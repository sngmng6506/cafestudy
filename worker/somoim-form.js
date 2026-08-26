import { APP_PACKAGE, findByResourceId, formatKoreanDate, formatKoreanTime } from './somoim-app.js';

// 소모임 "정모 개설" 폼의 규칙만 모은다. 기기를 조작하지 않는 순수 함수라 태블릿
// 없이 테스트할 수 있고, 핸들러는 "화면을 어떻게 조작하는가"에만 집중한다.
//
// 여기 상수들은 앱 화면이 실제로 받아주는 한계다. 서버의 SOMOIM_AUTOMATION_LIMITS와
// 다르다 — 그쪽은 job payload가 담을 수 있는 크기이고, 앱은 그보다 짧게 자른다.


export const PHOTO_PLACEHOLDER_TEXT = '정모사진을 등록해주세요.';

// 앱은 경비를 필수로 받는다. 비우고 제출하면 "경비를 입력해 주세요." 토스트를 띄우고
// 폼에 머문다(실기기에서 스크린샷으로 확인). 토스트는 uiautomator 덤프에 안 잡혀서,
// 겉으로는 "눌렀는데 아무 일도 안 일어남"으로만 보인다.
//
// 카페스터디 모임에는 참가비 개념이 없다. 값이 없을 때 이 문구를 넣는다 — 빈칸을
// 우회하려고 아무 숫자나 넣으면 멤버에게 없는 비용을 알리는 셈이 된다.
// 카페에서 모이므로 각자 음료를 사는 것이 실제 비용이다.
const DEFAULT_COST_TEXT = '각자 음료값';

// 소모임 정모 화면의 장소 칸은 20자에서 잘린다(실기기 확인: 44자를 넣었더니 앞
// 20자만 남았다). 서버 쪽 limit은 120자라 통과하므로, 여기서 앱에 맞게 줄인다.
//
// 웹 모임의 장소는 "가게이름 (도로명주소)" 형태다. 이걸 20자에서 그냥 자르면
// 주소가 중간에 끊겨("아비아채 서울홍대점 (서울특별시 마포") 오히려 못 알아본다.
// 괄호 앞 가게 이름만 남기는 편이 짧으면서 알아보기 쉽다.
export const APP_LOCATION_MAX_LENGTH = 20;

// 앱의 지도 URL 칸은 100자에서 자른다(실기기 확인: 130자를 넣었더니 정확히 앞
// 100자만 남았다). 잘린 URL은 열리지 않으므로 없느니만 못하다.
const APP_MAP_URL_MAX_LENGTH = 100;

// 폼이 사진을 받았는지. 안내 문구가 사라지면 받은 것이다.
export function isPhotoAttached(nodes) {
  return !nodes.some((n) => n.text === PHOTO_PLACEHOLDER_TEXT);
}

export function costForApp(payload) {
  const cost = String(payload?.cost ?? '').trim();
  return cost || DEFAULT_COST_TEXT;
}

export function fitLocationForApp(location, limit = APP_LOCATION_MAX_LENGTH) {
  const trimmed = String(location ?? '').trim();
  if (trimmed.length <= limit) return trimmed;

  const nameOnly = trimmed.replace(/\s*\(.*$/, '').trim();
  if (nameOnly && nameOnly.length <= limit) return nameOnly;

  return (nameOnly || trimmed).slice(0, limit);
}

export function buildNaverMapUrl(location, limit = APP_MAP_URL_MAX_LENGTH) {
  const query = fitLocationForApp(location, Number.MAX_SAFE_INTEGER)
    .replace(/\s*\(.*$/, '')
    .trim();
  if (!query) return null;

  const url = `https://map.naver.com/p/search/${query.replace(/ /g, '%20')}`;
  // 길면 붙이지 않는다. 잘린 링크를 남기느니 지도 없이 올리는 편이 낫다.
  return url.length <= limit ? url : null;
}

// 네이버 지도 검색 URL. 네이버 API는 필요 없다 — payload의 장소 문자열만으로
// 만든다. v5/search와 ?query= 형식은 모두 이 형태로 리다이렉트되므로 이것이 정식이다.
//
// 한글을 퍼센트 인코딩하지 않는다. 한 글자가 9자(%EC%95%84)가 되어 100자 예산을
// 금방 넘긴다 — "아비아채 서울홍대점"은 전체 인코딩 시 115자로 잘린다. 공백만
// 인코딩한다. 공백이 그대로 있는 문자열은 URL로서 유효하지 않아 받는 쪽이 거부할 수 있다.
// payload에 장소 상세페이지 URL이 있으면 그걸 쓴다. 서버가 카카오 검색 결과에서
// 받아 둔 진짜 장소 페이지라, 이름으로 만든 검색 URL과 달리 정확히 그 가게를 연다.
//
// 없으면(직접 입력했거나 이 기능 이전에 만들어진 모임) 예전처럼 이름으로 검색 URL을
// 만든다 — 지도가 아예 없는 것보다는 낫다.
export function resolveMapUrl(payload = {}) {
  const placeUrl = String(payload.mapUrl ?? '').trim();
  if (placeUrl) return placeUrl.length <= APP_MAP_URL_MAX_LENGTH ? placeUrl : null;
  return buildNaverMapUrl(payload.location);
}

export function buildExpectedFieldValues(payload, target) {
  const expected = {
    name_edit: payload.title,
    // 앱이 잘라서 담을 값과 비교해야 한다. 원본과 비교하면 항상 어긋난다.
    location_edit: fitLocationForApp(payload.location),
    max_count_edit: String(payload.capacity),
    date_text: formatKoreanDate(target),
    time_text: formatKoreanTime(target),
  };
  // 항상 값이 들어간다(앱이 필수로 받는다). 그래서 hint와 헷갈릴 일도 없다 —
  // uiautomator는 빈 EditText의 hint를 text로 돌려주므로, 빈 값을 기대했다면
  // "식사비 15000원"과 영원히 어긋났을 것이다.
  expected.expense_edit = costForApp(payload);
  return expected;
}

// 정모 개설 폼이 아직 화면에 있는지. 저장을 눌렀는데 폼이 그대로면 앱이 제출을
// 받지 않은 것이다(검증 실패, 네트워크 오류 등).
export function isCreateFormPresent(nodes) {
  return nodes.some((n) => n.text === '정모 개설')
    || nodes.some((n) => n.resourceId.endsWith('/save_button') && n.text === '정모 만들기');
}

export function evaluateSubmitOutcome(nodes, { title } = {}) {
  if (nodes.length === 0) return { ok: false, reason: 'empty_screen' };

  const foreign = nodes.find((n) => n.packageName && n.packageName !== APP_PACKAGE);
  if (foreign) {
    return { ok: false, reason: 'foreign_window', packageName: foreign.packageName };
  }
  if (isCreateFormPresent(nodes)) return { ok: false, reason: 'form_still_present' };

  // 생성 성공 시 앱은 만들어진 정모 게시글로 이동한다. event_info 한 줄에
  // 일시·장소·비용이 함께 들어 있어 이게 곧 결과 확인이다.
  const eventInfo = findByResourceId(nodes, 'event_info');
  if (!eventInfo) return { ok: false, reason: 'no_event_post' };

  const postTitle = findByResourceId(nodes, 'title_text');
  if (title && postTitle?.text !== title) {
    return { ok: false, reason: 'title_mismatch', expected: title, actual: postTitle?.text ?? null };
  }
  return { ok: true, eventInfo: eventInfo.text };
}
