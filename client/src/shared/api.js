const USER_ID_KEY = 'cafestudy_user_id';

export async function apiFetch(path, options = {}) {
  const userId = localStorage.getItem(USER_ID_KEY);
  const headers = { ...(options.headers ?? {}) };
  if (userId) headers['x-user-id'] = userId;

  const response = await fetch(path, { ...options, headers });
  const body = await response.json();

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? '요청에 실패했습니다.');
  }

  return body;
}
