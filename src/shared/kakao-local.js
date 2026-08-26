import { throwError } from './errors.js';

const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

// 카카오 로컬 검색을 쓰는 이유는 장소 ID와 상세페이지 URL을 함께 주기 때문이다.
// 네이버 지역 검색에는 둘 다 없어서, 같은 카페를 식별할 안정적인 키를 만들 수 없고
// 지도 링크도 이름으로 만든 "검색" URL밖에 안 됐다.
//
// 대신 카카오는 덜 관대하다. 사람이 소모임 앱에 자유롭게 적은 문자열
// ("아비아채 지하1층", "정기모임장소 근처")은 결과가 비는 경우가 있다. 그건 단점이
// 아니라 이 용도에는 장점이다 — 네이버는 같은 입력에 자신 있게 엉뚱한 곳을
// 돌려줬고(고양시 스터디룸), 그걸 믿고 합치면 남의 카페 이력이 섞인다.
export async function searchPlaces(query, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const restApiKey = options.restApiKey ?? '';
  if (!restApiKey) {
    throwError(503, 'PLACES_NOT_CONFIGURED', '장소 검색이 설정되지 않았습니다.');
  }

  const url = `${KAKAO_KEYWORD_ENDPOINT}?query=${encodeURIComponent(query)}&size=5`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `KakaoAK ${restApiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throwError(502, 'PLACES_SEARCH_FAILED', '장소 검색에 실패했습니다.');

  const body = await response.json();
  return (body.documents ?? []).map(toPlace);
}

function toPlace(document) {
  return {
    // 카페 이력을 묶는 키다. 이 값이 없는 장소는 합치지 않고 따로 둔다.
    placeId: document.id ? String(document.id) : null,
    placeName: document.place_name ?? '',
    address: document.address_name ?? '',
    roadAddress: document.road_address_name || document.address_name || '',
    // 응답은 http로 오는데 https도 같은 페이지를 연다(둘 다 200 확인). 소모임 앱의
    // 지도 URL 칸에 넣는 값이라 https로 맞춘다.
    placeUrl: toHttps(document.place_url),
    // 카카오는 x가 경도, y가 위도다. 뒤집으면 지도가 엉뚱한 곳을 가리킨다.
    lat: toNumber(document.y),
    lng: toNumber(document.x),
  };
}

function toHttps(value) {
  if (!value) return '';
  return String(value).replace(/^http:\/\//, 'https://');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
