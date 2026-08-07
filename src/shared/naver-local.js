import { throwError } from './errors.js';

const NAVER_LOCAL_ENDPOINT = 'https://openapi.naver.com/v1/search/local.json';

export async function searchPlaces(query, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clientId = options.clientId ?? options.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = options.clientSecret ?? options.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throwError(503, 'PLACES_NOT_CONFIGURED', '장소 검색이 설정되지 않았습니다.');
  }

  const url = `${NAVER_LOCAL_ENDPOINT}?query=${encodeURIComponent(query)}&display=5`;
  const response = await fetchImpl(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throwError(502, 'PLACES_SEARCH_FAILED', '장소 검색에 실패했습니다.');

  const body = await response.json();
  return (body.items ?? []).map((item) => ({
    placeName: stripTags(item.title),
    address: item.address,
    roadAddress: item.roadAddress || item.address,
    lat: item.mapy ? Number(item.mapy) / 1e7 : null,
    lng: item.mapx ? Number(item.mapx) / 1e7 : null,
  }));
}

function stripTags(value = '') {
  return value.replace(/<[^>]+>/g, '');
}
