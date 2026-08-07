const DEFAULT_BADGE_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_BADGE_PROVIDER_PATH = 'hf-inference';
const DEFAULT_BADGE_GC_SCHEDULE = '30 3 * * *';
const DEFAULT_CRAWL_SCHEDULE = '0 2,18 * * *';
const DEFAULT_SESSION_COOKIE = 'cafestudy_session';
const DEFAULT_VERIFICATION_GC_SCHEDULE = '15 * * * *';

export function createConfig(env = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const internalApiKey = env.INTERNAL_API_KEY || '';

  return {
    env: nodeEnv,
    port: readInteger(env.PORT, 3001, { min: 1, max: 65_535 }),
    shutdownTimeoutMs: readInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, { min: 1_000 }),
    databaseUrl: env.DATABASE_URL || '',
    internalApiKey,

    auth: {
      cookieName: env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE,
      sessionTtlMs: readInteger(env.SESSION_TTL_SEC, 7 * 24 * 60 * 60, { min: 300 }) * 1000,
      secureCookie: readBoolean(env.SESSION_COOKIE_SECURE, nodeEnv === 'production'),
      allowBearerAuth: readBoolean(env.ALLOW_BEARER_AUTH, nodeEnv !== 'production'),
    },

    storage: {
      bucket: firstValue(env, ['S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET_NAME', 'BUCKET_NAME', 'RAILWAY_BUCKET_NAME']),
      endpoint: firstValue(env, ['S3_ENDPOINT', 'S3_ENDPOINT_URL', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3', 'RAILWAY_S3_ENDPOINT']),
      region: firstValue(env, ['S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION']) || 'auto',
      accessKeyId: firstValue(env, ['S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']),
      secretAccessKey: firstValue(env, ['S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']),
      publicBaseUrl: firstValue(env, ['S3_PUBLIC_BASE_URL', 'BUCKET_PUBLIC_BASE_URL', 'STORAGE_PUBLIC_BASE_URL']),
      uploadTtlSeconds: readInteger(env.UPLOAD_URL_TTL_SEC, 300, { min: 30, max: 900 }),
      verificationMaxBytes: readInteger(env.VERIFICATION_UPLOAD_MAX_BYTES, 5 * 1024 * 1024, { min: 64 * 1024, max: 20 * 1024 * 1024 }),
      verificationMaxPending: readInteger(env.VERIFICATION_UPLOAD_MAX_PENDING, 3, { min: 1, max: 20 }),
      verificationMaxPerHour: readInteger(env.VERIFICATION_UPLOAD_MAX_PER_HOUR, 10, { min: 1, max: 100 }),
      verificationGcSchedule: env.VERIFICATION_UPLOAD_GC_SCHEDULE || DEFAULT_VERIFICATION_GC_SCHEDULE,
      verificationRetentionHours: readInteger(env.VERIFICATION_UPLOAD_RETENTION_HOURS, 24, { min: 1, max: 720 }),
    },

    badges: {
      token: env.HF_TOKEN || '',
      model: env.HF_BADGE_MODEL || DEFAULT_BADGE_MODEL,
      providerPath: env.HF_BADGE_PROVIDER_PATH || DEFAULT_BADGE_PROVIDER_PATH,
      endpoint: env.HF_BADGE_ENDPOINT || '',
      dailyGenerationLimit: readInteger(env.BADGE_GENERATION_DAILY_LIMIT, 3, { min: 1, max: 100 }),
      requestTimeoutMs: readInteger(env.BADGE_GENERATION_TIMEOUT_MS, 45_000, { min: 1_000, max: 180_000 }),
      maxResponseBytes: readInteger(env.BADGE_GENERATION_MAX_BYTES, 5 * 1024 * 1024, { min: 64 * 1024, max: 20 * 1024 * 1024 }),
      gcSchedule: env.BADGE_GC_SCHEDULE || DEFAULT_BADGE_GC_SCHEDULE,
    },

    members: {
      somoimUrl: env.SOMOIM_URL || '',
      crawlSchedule: env.CRAWL_SCHEDULE || DEFAULT_CRAWL_SCHEDULE,
      refreshCooldownMs: readInteger(env.REFRESH_COOLDOWN_SEC, 300, { min: 0, max: 86_400 }) * 1000,
      puppeteerExecutablePath: env.PUPPETEER_EXECUTABLE_PATH || '',
    },

    naver: {
      clientId: env.NAVER_SEARCH_CLIENT_ID || '',
      clientSecret: env.NAVER_SEARCH_CLIENT_SECRET || '',
    },

    somoimAutomation: {
      internalApiKey,
      allowSubmit: readBoolean(env.SOMOIM_AUTOMATION_ALLOW_SUBMIT, false),
    },
  };
}

function firstValue(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  return '';
}

function readBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function readInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}
