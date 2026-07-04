import crypto from 'node:crypto';
import { createBadgesQueries } from './badges.queries.js';
import { createHuggingFaceBadgeProvider } from './huggingface.provider.js';
import { throwError, throwNotFound, throwValidation } from '../../shared/errors.js';

const POINT_COST = 0;
const MAX_PROMPT_LENGTH = 200;
const MAX_TITLE_LENGTH = 40;

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

    async generateBadge({ userId, prompt }) {
      const normalizedPrompt = normalizePrompt(prompt);
      ensureStorageConfigured();
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
      });
      if (!badge) {
        throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      }

      return withImageViewUrl(badge);
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
