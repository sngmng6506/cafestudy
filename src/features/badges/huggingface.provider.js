import { throwError } from '../../shared/errors.js';

const DEFAULT_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_PROVIDER = 'hf-inference-api';
const DEFAULT_PROVIDER_PATH = 'hf-inference';

export function createHuggingFaceBadgeProvider(config = {}, fetchImpl = fetch) {
  const token = config.token ?? config.HF_TOKEN;
  const model = config.model ?? config.HF_BADGE_MODEL ?? DEFAULT_MODEL;
  const providerPath = config.providerPath ?? config.HF_BADGE_PROVIDER_PATH ?? DEFAULT_PROVIDER_PATH;
  const endpoint = config.endpoint ?? config.HF_BADGE_ENDPOINT
    ?? `https://router.huggingface.co/${providerPath}/models/${encodeModelPath(model)}`;
  const timeoutMs = config.requestTimeoutMs ?? 45_000;
  const maxResponseBytes = config.maxResponseBytes ?? 5 * 1024 * 1024;

  return {
    provider: DEFAULT_PROVIDER,
    model,

    async generateImage(prompt) {
      if (!token) throwError(503, 'HF_TOKEN_MISSING', 'Hugging Face token is not configured.');

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'image/png',
          },
          body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throwError(503, 'BADGE_GENERATION_TIMEOUT', '뱃지 생성 시간이 초과됐어요. 다시 시도해 주세요.');
        }
        throwError(503, 'BADGE_GENERATION_UNREACHABLE', `Hugging Face request could not be reached: ${error.message}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        const message = await readErrorMessage(response, contentType);
        throwError(response.status === 401 ? 502 : 503, errorCodeFor(message), message);
      }
      if (!contentType.startsWith('image/')) {
        const message = await readErrorMessage(response, contentType);
        throwError(503, 'BADGE_GENERATION_FAILED', message || 'Hugging Face did not return an image.');
      }

      const declaredSize = Number(response.headers.get('content-length') ?? 0);
      if (declaredSize > maxResponseBytes) {
        throwError(503, 'BADGE_IMAGE_TOO_LARGE', '생성된 이미지가 허용 크기를 초과했어요.');
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > maxResponseBytes) {
        throwError(503, 'BADGE_IMAGE_TOO_LARGE', '생성된 이미지 크기가 올바르지 않아요.');
      }

      return { body, contentType: contentType.split(';')[0] };
    },
  };
}

function encodeModelPath(model) {
  return model.split('/').map((part) => encodeURIComponent(part)).join('/');
}
async function readErrorMessage(response, contentType) {
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null);
    if (Array.isArray(body?.error)) return body.error.join(', ');
    return body?.error || body?.message || `Hugging Face request failed (${response.status})`;
  }
  return response.text().catch(() => `Hugging Face request failed (${response.status})`);
}
function errorCodeFor(message) {
  return /not support|not supported|no inference provider/i.test(message)
    ? 'BADGE_MODEL_UNSUPPORTED'
    : 'BADGE_GENERATION_FAILED';
}
