import crypto from 'node:crypto';
import { createBadgesQueries } from './badges.queries.js';
import { createHuggingFaceBadgeProvider } from './huggingface.provider.js';
import { throwError, throwNotFound, throwValidation, throwConflict } from '../../shared/errors.js';
import { BADGE_LIMITS } from '../../../shared/domain-constraints.js';
import { extensionForContentType } from '../../core/storage.js';

const POINT_COST = 0;
const MAX_PROMPT_LENGTH = BADGE_LIMITS.maxPromptLength;
const MAX_TITLE_LENGTH = BADGE_LIMITS.maxTitleLength;
const MAX_BADGES_PER_USER = BADGE_LIMITS.maxPerUser;
const BADGE_LIMIT_MESSAGE = `뱃지는 최대 ${MAX_BADGES_PER_USER}개까지 보관할 수 있어요. 기존 뱃지를 삭제한 뒤 다시 시도해 주세요.`;

export function createBadgesService({ db, storage, config = {}, badgeProvider, badgeQueries }) {
  const queries = badgeQueries ?? createBadgesQueries(db);
  const badgeConfig = config.badges ?? config;
  const provider = badgeProvider ?? createHuggingFaceBadgeProvider(badgeConfig);
  const dailyGenerationLimit = badgeConfig.dailyGenerationLimit ?? 3;

  return {
    async listUserBadges(userId) {
      return Promise.all((await queries.listUserBadges(userId)).map(withImageViewUrl));
    },

    async getActiveBadge(userId) {
      const badge = await queries.getActiveBadge(userId);
      return badge ? withImageViewUrl(badge) : null;
    },

    async listBadgesForUser(userId) {
      if (!isUuid(userId)) throwNotFound('MEMBER_NOT_FOUND', 'Member was not found.');
      return Promise.all((await queries.listUserBadges(userId)).map(withImageViewUrl));
    },

    async generateBadge({ userId, prompt }) {
      const normalizedPrompt = normalizePrompt(prompt);
      ensureStorageConfigured();
      if ((await queries.countUserBadges(userId)) >= MAX_BADGES_PER_USER) {
        throwValidation(BADGE_LIMIT_MESSAGE);
      }

      const generationId = crypto.randomUUID();
      const reserved = await queries.reserveGeneration({
        id: generationId,
        userId,
        prompt: normalizedPrompt,
        provider: provider.provider,
        model: provider.model,
        pointCost: POINT_COST,
        dailyLimit: dailyGenerationLimit,
      });
      if (reserved.outcome === 'daily_limit') {
        throwError(429, 'BADGE_DAILY_LIMIT', `AI 뱃지는 하루 ${dailyGenerationLimit}번까지 만들 수 있어요.`);
      }
      if (reserved.outcome === 'in_progress') {
        throwConflict('BADGE_GENERATION_IN_PROGRESS', '이미 뱃지를 만들고 있어요. 잠시 후 다시 시도해 주세요.');
      }

      let objectKey = null;
      try {
        const image = await provider.generateImage(buildBadgePrompt(normalizedPrompt));
        objectKey = `badges/generations/${userId}/${generationId}${extensionForContentType(image.contentType)}`;
        await storage.putObject({ objectKey, body: image.body, contentType: image.contentType });

        const generation = await queries.completeGeneration({ generationId, userId, objectKey });
        if (!generation) {
          throwConflict('BADGE_GENERATION_CHANGED', '뱃지 생성 상태가 바뀌었어요. 다시 시도해 주세요.');
        }
        return withImageViewUrl(generation);
      } catch (error) {
        await queries.failGeneration({
          generationId,
          userId,
          message: error.code ?? error.message,
        }).catch(() => {});
        if (objectKey) await storage.deleteObject(objectKey).catch(() => {});
        throw error;
      }
    },

    async applyGeneration({ userId, generationId, title }) {
      if (!isUuid(generationId)) {
        throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      }
      const generation = await queries.getGenerationForUser({ generationId, userId });
      if (!generation) throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      if (generation.status !== 'preview') throwValidation('이미 적용됐거나 사용할 수 없는 뱃지 생성 결과입니다.');

      const badge = await queries.createBadgeFromGeneration({
        userId,
        generationId,
        title: normalizeTitle(title, generation.prompt),
        description: generation.prompt,
        maxBadges: MAX_BADGES_PER_USER,
      });
      if (!badge) throwNotFound('BADGE_GENERATION_NOT_FOUND', 'Badge generation was not found.');
      if (badge.limitExceeded) throwValidation(BADGE_LIMIT_MESSAGE);
      return withImageViewUrl(badge);
    },

    async deleteBadge({ userId, badgeId }) {
      if (!isUuid(badgeId)) throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      const result = await queries.deleteUserBadge({ userId, badgeId });
      if (!result.removed) throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      return { deleted: true, clearedActive: result.clearedActive };
    },

    async setActiveBadge({ userId, badgeId }) {
      if (!isUuid(badgeId)) throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      const badge = await queries.setActiveBadge({ userId, badgeId });
      if (!badge) throwNotFound('BADGE_NOT_FOUND', 'Badge was not found.');
      return withImageViewUrl(badge);
    },
  };

  async function withImageViewUrl(row) {
    return { ...row, imageViewUrl: await resolveImageUrl(row.imageObjectKey) };
  }

  async function resolveImageUrl(objectKey) {
    if (!objectKey || objectKey.startsWith('pending:')) return null;
    return storage.createDownloadUrl(objectKey);
  }

  function ensureStorageConfigured() {
    if (storage.status?.().configured === false) {
      throwError(503, 'STORAGE_NOT_CONFIGURED', 'Badge image storage is not configured.');
    }
  }
}

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
  if (value.length > MAX_TITLE_LENGTH) throwValidation(`뱃지 이름은 ${MAX_TITLE_LENGTH}자 이하로 입력해 주세요.`);
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
