export async function apiFetch(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? '요청에 실패했습니다.');
  }

  return body;
}
