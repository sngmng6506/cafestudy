import crypto from 'node:crypto';
import { createBadgesQueries } from './badges.queries.js';
import { createHuggingFaceBadgeProvider } from './huggingface.provider.js';
import { throwError, throwNotFound, throwValidation } from '../../shared/errors.js';

const POINT_COST = 0;
const MAX_PROMPT_LENGTH = 200;
const MAX_TITLE_LENGTH = 40;
const MAX_BADGES_PER_USER = 5;
const BADGE_LIMIT_MESSAGE = `뱃지는 최대 ${MAX_BADGES_PER_USER}개까지 보관할 수 있어요. 기존 뱃지를 삭제한 뒤 다시 시도해 주세요.`;

export function createBadgesService({ db, storage, config, badgeProvider }) {
  const queries = createBadgesQueries(db);
  const provider = badgeProvider ?? createHuggingFaceBadgeProvider({ ...process.env, ...(config ?? {}) });

  return {
    async listUserBadges(userId) {
      const badges = await queries.listUserBadges(userId);
      return Promise.all(badges.map(withImageViewUrl));
    },

    async getActiveBadge(userId) {
      const badge = await queries.getActiveBadge(userId);
      return badge ? withImageViewUrl(badge) : null;
    },

    // 다른 멤버의 뱃지 컬렉션 조회 (프로필 카드). 뱃지는 앱 안에서 공개 정보.
    async listBadgesForUser(userId) {
      if (!isUuid(userId)) {
        throwNotFound('MEMBER_NOT_FOUND', 'Member was not found.');
      }
      const badges = await queries.listUserBadges(userId);
      return Promise.all(badges.map(withImageViewUrl));
    },

    async generateBadge({ userId, prompt }) {
      const normalizedPrompt = normalizePrompt(prompt);
      ensureStorageConfigured();
      // 이미지 생성 비용을 쓰기 전에 미리 차단. 실제 한도 보장은
      // applyGeneration 트랜잭션 안에서 한 번 더 확인한다.
      if ((await queries.countUserBadges(userId)) >= MAX_BADGES_PER_USER) {
        throwValidation(BADGE_LIMIT_MESSAGE);
      }
      const fullPrompt = buildBadgePrompt(normalizedPrompt);
      const image = await provider.generateImage(fullPrompt);
      const objectKey = `badges/generations/${userId}/${crypto.randomUUID()}.png`;

      await storage.putObject({
        objectKey,
        body: image.body,
        contentType: image.contentType,
      });

      const generation = await queries.createGeneration({
        userId,
        prompt: normalizedPrompt,
        provider: provider.provider,
        model: provider.model,
        imageObjectKey: objectKey,
        pointCost: POINT_COST,
      });

      return withImageViewUrl(generation);
    },

    async applyGeneration({ userId, generationId, title }) {
      if (!isUuid(generationId)) {
        throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      }

      const generation = await queries.getGenerationForUser({ generationId, userId });
      if (!generation) {
        throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      }
      if (generation.status !== 'preview') {
        throwValidation('이미 적용된 뱃지 생성 결과입니다.');
      }

      const badge = await queries.createBadgeFromGeneration({
        userId,
        generationId,
        title: normalizeTitle(title, generation.prompt),
        description: generation.prompt,
        maxBadges: MAX_BADGES_PER_USER,
      });
      if (!badge) {
        throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      }
      if (badge.limitExceeded) {
        throwValidation(BADGE_LIMIT_MESSAGE);
      }

      return withImageViewUrl(badge);
    },

    async deleteBadge({ userId, badgeId }) {
      if (!isUuid(badgeId)) {
        throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      }

      const result = await queries.deleteUserBadge({ userId, badgeId });
      if (!result.removed) {
        throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      }

      return { deleted: true, clearedActive: result.clearedActive };
    },

    async setActiveBadge({ userId, badgeId }) {
      if (!isUuid(badgeId)) {
        throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      }

      const badge = await queries.setActiveBadge({ userId, badgeId });
      if (!badge) {
        throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      }

      return withImageViewUrl(badge);
    },
  };

  async function withImageViewUrl(row) {
    return {
      ...row,
      imageViewUrl: await resolveImageUrl(row.imageObjectKey),
    };
  }

  async function resolveImageUrl(objectKey) {
    if (!objectKey) return null;
    return storage.createDownloadUrl(objectKey);
  }

  function ensureStorageConfigured() {
    if (storage.status?.().configured === false) {
      throwError(503, 'STORAGE_NOT_CONFIGURED', 'Badge image storage is not configured.');
    }
  }
}

// URL 파라미터를 uuid 컬럼 쿼리에 넣기 전에 걸러낸다.
// 통과시키면 Postgres 22P02 캐스트 에러가 500으로 노출된다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizePrompt(prompt) {
  const value = (prompt ?? '').toString().replace(/\s+/g, ' ').trim();
  if (!value || value.length > MAX_PROMPT_LENGTH) {
    throwValidation(`프롬프트는 1~${MAX_PROMPT_LENGTH}자로 입력해 주세요.`);
  }
  return value;
}

function normalizeTitle(title, prompt) {
  const value = (title ?? '').toString().replace(/\s+/g, ' ').trim();
  if (value.length > MAX_TITLE_LENGTH) {
    throwValidation(`뱃지 이름은 ${MAX_TITLE_LENGTH}자 이하로 입력해 주세요.`);
  }
  return value || prompt.slice(0, MAX_TITLE_LENGTH);
}

function buildBadgePrompt(prompt) {
  return [
    `pixel art badge icon of ${prompt}`,
    'single centered subject',
    'simple silhouette',
    'clean outline',
    'limited color palette',
    'no text',
    'no letters',
    'plain background',
  ].join(', ');
}
