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

    // 되돌릴 수 없는 제출 직전에 부른다. 실패하면 호출부가 제출을 포기해야 한다 —
    // 표시를 남기지 못한 채 누르면 재시도가 정모를 하나 더 만든다.
    async markSubmitAttempted(id) {
      return post(`/api/somoim-automation/jobs/${id}/submit-attempt`);
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
