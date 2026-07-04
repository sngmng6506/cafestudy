import { throwError } from '../../shared/errors.js';

const DEFAULT_MODEL = 'megaaziib/aziibpixelmix';
const DEFAULT_PROVIDER = 'hf-inference-api';

export function createHuggingFaceBadgeProvider(env, fetchImpl = fetch) {
  const token = env.HF_TOKEN;
  const model = env.HF_BADGE_MODEL || DEFAULT_MODEL;
  const endpoint =
    env.HF_BADGE_ENDPOINT || `https://api-inference.huggingface.co/models/${encodeModelPath(model)}`;

  return {
    provider: DEFAULT_PROVIDER,
    model,

    async generateImage(prompt) {
      if (!token) {
        throwError(503, 'HF_TOKEN_MISSING', 'Hugging Face token is not configured.');
      }

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'image/png,image/jpeg,application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          options: { wait_for_model: true },
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        const message = await readErrorMessage(response, contentType);
        throwError(response.status === 401 ? 502 : 503, 'BADGE_GENERATION_FAILED', message);
      }

      if (!contentType.startsWith('image/')) {
        const message = await readErrorMessage(response, contentType);
        throwError(503, 'BADGE_GENERATION_FAILED', message || 'Hugging Face did not return an image.');
      }

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: contentType.split(';')[0],
      };
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
