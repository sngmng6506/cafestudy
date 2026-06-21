const NAVER_LOCAL_ENDPOINT = 'https://openapi.naver.com/v1/search/local.json';

// Proxies NAVER local (place) search so credentials stay server-side.
// Injectable deps for testing.
export async function searchPlaces(query, {
  fetchImpl = fetch,
  clientId = process.env.NAVER_SEARCH_CLIENT_ID,
  clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET,
} = {}) {
  if (!clientId || !clientSecret) {
    const error = new Error('장소 검색이 설정되지 않았습니다. (NAVER_SEARCH_CLIENT_ID/SECRET)');
    error.statusCode = 503;
    error.code = 'PLACES_NOT_CONFIGURED';
    throw error;
  }

  const url = `${NAVER_LOCAL_ENDPOINT}?query=${encodeURIComponent(query)}&display=5`;
  const response = await fetchImpl(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    const error = new Error('장소 검색에 실패했습니다.');
    error.statusCode = 502;
    error.code = 'PLACES_SEARCH_FAILED';
    throw error;
  }

  const body = await response.json();

  return (body.items ?? []).map((item) => ({
    placeName: stripTags(item.title),
    address: item.address,
    roadAddress: item.roadAddress || item.address,
    // NAVER returns mapx/mapy as WGS84 coordinates scaled by 1e7.
    lat: item.mapy ? Number(item.mapy) / 1e7 : null,
    lng: item.mapx ? Number(item.mapx) / 1e7 : null,
  }));
}

function stripTags(value = '') {
  return value.replace(/<[^>]+>/g, '');
}
