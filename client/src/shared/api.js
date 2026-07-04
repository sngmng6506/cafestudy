const USER_ID_KEY = 'cafestudy_user_id';
const TOKEN_KEY = 'cafestudy_token';

export async function apiFetch(path, options = {}) {
  const userId = localStorage.getItem(USER_ID_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(options.headers ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // dev 폴백 및 최초 로그인 전 개인화 읽기를 위해 병행 전송 (서버는 토큰을 우선한다).
  if (userId) headers['x-user-id'] = userId;

  const response = await fetch(path, { ...options, headers });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`서버 오류 (${response.status})`);
  }

  const body = await response.json();

  if (!response.ok || body.error) {
    // 세션 만료/무효: 저장된 인증 정보를 지워 재로그인을 유도한다.
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }
    const error = new Error(body.error?.message ?? '요청에 실패했습니다.');
    error.code = body.error?.code;
    error.status = response.status;
    throw error;
  }

  return body;
}
