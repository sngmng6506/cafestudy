// 서버의 somoim-automation job endpoint 클라이언트.
// 내부 키는 헤더로만 쓰고 로그나 에러 메시지에 절대 넣지 않는다.
export function createApiClient({ baseUrl, internalKey, fetchImpl = fetch }) {
  const root = String(baseUrl ?? '').replace(/\/+$/, '');

  async function post(path, body) {
    const response = await fetchImpl(`${root}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify(body ?? {}),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.error?.code ?? `HTTP_${response.status}`;
      const message = payload?.error?.message ?? 'Request failed';
      throw new Error(`${path} failed — ${code}: ${message}`);
    }
    return payload?.data ?? null;
  }

  return {
    async claimJob() {
      const data = await post('/api/somoim-automation/jobs/claim');
      return data?.job ?? null;
    },

    async completeJob(id, result) {
      return post(`/api/somoim-automation/jobs/${id}/complete`, { result });
    },

    async failJob(id, { errorMessage, needsManualReview, result }) {
      return post(`/api/somoim-automation/jobs/${id}/fail`, {
        errorMessage,
        needsManualReview,
        result,
      });
    },
  };
}
