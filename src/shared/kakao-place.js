// 카카오 장소 참조를 받아들이는 규칙. meetups(저장)와 somoim-automation(정모에 넣기)이
// 같은 값을 다루므로 규칙도 한 벌이어야 한다. 서로 다른 feature라 직접 import할 수
// 없어 shared에 둔다.
//
// 규칙이 두 벌이던 시절엔 저장 쪽이 더 느슨해서, 저장은 되는데 정모에는 안 붙는 값이
// 생겼다 — 지도가 조용히 빠지고 이유는 어디에도 남지 않았다.

// 상세페이지 URL은 소모임 정모의 "지도 URL" 칸에 그대로 들어가고, 그걸 누르는 건
// 모임 멤버들이다. 사용자가 보내는 값이므로 카카오 장소 페이지 형태만 받는다.
const PLACE_URL_PATTERN = /^https:\/\/place\.map\.kakao\.com\/\d+$/;

// 카카오 장소 ID는 숫자 문자열이다. URL과 모양이 달라 검사도 따로 한다 —
// 한 함수로 둘을 받으면 숫자 쪽은 사실상 아무 값이나 통과한다.
const PLACE_ID_PATTERN = /^\d{1,20}$/;

export function normalizeKakaoPlaceUrl(value) {
  const text = toText(value);
  return PLACE_URL_PATTERN.test(text) ? text : null;
}

export function normalizeKakaoPlaceId(value) {
  const text = toText(value);
  return PLACE_ID_PATTERN.test(text) ? text : null;
}

function toText(value) {
  return (value ?? '').toString().trim();
}
