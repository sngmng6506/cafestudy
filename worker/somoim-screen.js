import { ManualReviewError } from './errors.js';

// 소모임 앱 화면을 읽고 값을 만드는 규칙. 기기를 조작하지 않는다.
//
// somoim-app.js(adb 조작)와 나눈 이유는 의존 방향이다. 폼 규칙(somoim-form.js)이
// 순수한데 기기 모듈을 import하면 "태블릿 없이 검증한다"는 말이 구조로는 성립하지
// 않는다. 순수한 쪽은 순수한 쪽만 의존한다.

const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 앱은 기기의 벽시계 기준으로 정모 시각을 해석한다. 기기 타임존이 KST가 아니면
// 화면에 찍힌 값은 맞는데 실제 정모 시각이 어긋나고, verifyForm은 같은 문자열끼리
// 비교하므로 이 어긋남을 잡지 못한다 — 조용히 틀리는 것보다 실패가 낫다.
const REQUIRED_TIMEZONE = 'Asia/Seoul';

// 소모임 앱(com.friendscube.somoim) 자동화 상수.
//
// 이 bot 계정은 "[홍대] it&ai 스터디" 클럽 운영진 권한만 가지고 있고, 다른 클럽은
// 쓰지 않는다(사용자 확정). payload에 groupId가 없으므로 이 클럽 하나로 고정한다.
// 클럽 이름은 화면에서 정확히 일치 비교하므로, 클럽장이 이름을 바꾸면 모든 job이
// 실패한다. 코드 수정 없이 복구할 수 있도록 설정(SOMOIM_TARGET_GROUP_NAME)으로 뺐다.
export const APP_PACKAGE = 'com.friendscube.somoim';

export const DEFAULT_TARGET_GROUP_NAME = '[홍대] it&ai 스터디';

export const MY_GROUPS_TAB = '내모임';

export const JOINED_SECTION_TITLE = '가입한 모임';

export const ADB_KEYBOARD_IME = 'com.android.adbkeyboard/.AdbIME';

function decodeXmlEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseUiNodes(xml) {
  const nodes = [];
  // 자식이 있는 노드는 <node ...>...</node>로, 리프 노드는 <node .../>로 끝난다.
  // 뒤가 "/>"인지는 신경 쓰지 않고 첫 ">"까지만 잡아야 컨테이너 노드도 놓치지 않는다.
  const nodeRe = /<node\b([^>]*)>/g;
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  let nodeMatch;
  while ((nodeMatch = nodeRe.exec(xml))) {
    const attrs = {};
    attrRe.lastIndex = 0;
    let attrMatch;
    while ((attrMatch = attrRe.exec(nodeMatch[1]))) {
      attrs[attrMatch[1]] = decodeXmlEntities(attrMatch[2]);
    }
    const boundsMatch = (attrs.bounds || '').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    const bounds = boundsMatch
      ? {
          x1: Number(boundsMatch[1]),
          y1: Number(boundsMatch[2]),
          x2: Number(boundsMatch[3]),
          y2: Number(boundsMatch[4]),
        }
      : null;
    nodes.push({
      text: attrs.text || '',
      contentDesc: attrs['content-desc'] || '',
      resourceId: attrs['resource-id'] || '',
      className: attrs.class || '',
      packageName: attrs.package || '',
      clickable: attrs.clickable === 'true',
      enabled: attrs.enabled === 'true',
      selected: attrs.selected === 'true',
      bounds,
      center: bounds
        ? { x: Math.round((bounds.x1 + bounds.x2) / 2), y: Math.round((bounds.y1 + bounds.y2) / 2) }
        : null,
    });
  }
  return nodes;
}

export function findByResourceId(nodes, idSuffix) {
  return nodes.find((n) => n.resourceId.endsWith(`/${idSuffix}`));
}

// scheduledAt(ISO, UTC)을 한국 표준시(UTC+9, DST 없음) 구성요소로 바꾼다.
// 실행 환경(worker 서버)의 로컬 타임존에 의존하지 않도록 UTC 접근자만 쓴다.
// 태블릿 자체가 한국 시간대로 설정돼 있다고 가정한다.
export function toKstParts(scheduledAt) {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) {
    throw new ManualReviewError(`scheduledAt is not a valid date: ${scheduledAt}`, {
      stage: 'validate_payload',
    });
  }
  const kst = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour24: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    weekday: kst.getUTCDay(),
  };
}

// 서버는 모임 생성 시점에만 "30분 뒤" 최소 리드타임을 검사한다. worker가 job을
// 집어들 때까지는 큐 대기·stale-claim 재시도(최악의 경우 900초 x 3회 = 45분)와
// 호스트가 임의 시점에 누르는 재시도가 끼어들 수 있어, 그 사이 scheduledAt이 실제로
// 지나가 버릴 수 있다. 지난 시각으로 화면을 채우려 들면(달력을 거꾸로 넘기는 등)
// 결과를 예측할 수 없으니 시도 자체를 하지 않는다.
export function assertScheduledAtIsFuture(scheduledAt, now = Date.now()) {
  if (new Date(scheduledAt).getTime() <= now) {
    throw new ManualReviewError(`scheduledAt has already passed: ${scheduledAt}`, {
      stage: 'validate_payload',
    });
  }
}

export function to12Hour(hour24) {
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12raw = hour24 % 12;
  return { hour12: hour12raw === 0 ? 12 : hour12raw, period };
}

export function formatKoreanDate({ month, day, weekday }) {
  return `${month}월 ${day}일 (${KO_WEEKDAYS[weekday]})`;
}

export function formatKoreanTime({ hour24, minute }) {
  const { hour12, period } = to12Hour(hour24);
  return `${period === 'AM' ? '오전' : '오후'} ${hour12}:${String(minute).padStart(2, '0')}`;
}

export function formatEnglishHeader({ year, month, day, weekday }) {
  return {
    yearText: String(year),
    dateText: `${EN_WEEKDAYS[weekday]}, ${EN_MONTHS[month - 1]} ${day}`,
  };
}

export function parseEnglishHeaderDate(text) {
  const match = text.match(/^\w+,\s*(\w+)\s+(\d{1,2})$/);
  if (!match) return null;
  const month = EN_MONTHS.indexOf(match[1]) + 1;
  if (month <= 0) return null;
  return { month, day: Number(match[2]) };
}

export function monthsBetween(from, to) {
  return (to.year * 12 + to.month) - (from.year * 12 + from.month);
}

// 스크린샷은 job별 디렉터리에 남긴다. 반환하는 screenshotKey는 계약
// (SOMOIM_AUTOMATION.md)이 정한 오브젝트 스토리지 키 모양이고, screenshotPath는
// 지금 실제로 파일이 있는 worker 로컬 경로다. 스토리지를 붙이면 키는 그대로 두고
// 업로드만 추가하면 된다.
export function buildScreenshotKey(jobId, name) {
  // job id 없이는 키를 만들 수 없다. `undefined`를 문자열에 박으면 job끼리 같은
  // 키를 쓰게 되므로, 키가 없다는 사실을 그대로 null로 돌려준다.
  return jobId ? `somoim-automation/${jobId}/${name}.png` : null;
}

// uiautomator dump는 같은 창을 두 벌 내보낼 때가 있다. 화면상 같은 위치의 노드는
// 같은 요소이므로 bounds로 접는다. 이걸 하지 않으면 모임 하나가 둘로 세어진다.
export function uniqueByBounds(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    const key = `${node.bounds?.x1},${node.bounds?.y1},${node.bounds?.x2},${node.bounds?.y2}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 검색으로 클럽을 찾지 않고 "내모임"에서 가입한 모임을 연다. 검색 경로는 한글
// 입력·검색 제출·결과 정렬·이름 대조에 모두 의존하는데, 이 앱은 검색을 탭이나
// 엔터로 제출할 수 없어 실제로 막혔다. bot 계정은 대상 클럽 하나에만 가입해
// 있으므로 목록에서 바로 여는 편이 훨씬 짧고 안정적이다.
//
// 가입 모임은 `name_text`, 추천 카드는 `groupname_text`로 id가 갈려 있다. 다만
// `name_text`는 홈 화면에서 정모 이름으로도 쓰이므로, 내모임 화면에 도착한 것을
// 확인한 뒤에 세어야 한다. 그리고 엉뚱한 클럽에 들어가더라도 다음 단계
// (openCreateMeetupForm)가 클럽 이름을 검증해 막는다.
// "가입한 모임" 헤더 아래에 있는 모임 이름만 고른다.
//
// 정모를 하나라도 만들면 내모임 화면 위쪽에 "참여중인 정모 채팅" 섹션이 생기는데,
// 거기에도 같은 클럽 이름이 name_text로 나온다. 위치를 따지지 않고 고르면 클럽 대신
// 정모 채팅방이 열린다(실기기에서 겪음).
export function joinedGroupsBelow(nodes, header) {
  if (!header?.center) return [];
  return uniqueByBounds(
    nodes.filter(
      (n) => n.resourceId.endsWith('/name_text') && n.center && n.center.y > header.center.y,
    ),
  );
}

// 매번 강제 종료 후 재실행해 알 수 없는 이전 화면 상태(뒤로가기 스택, 남은 다이얼로그
// 등)에 의존하지 않는 결정적인 시작점을 만든다. 콜드 스타트는 웜 스타트보다 훨씬
// 느릴 수 있어(수 초) 고정 sleep 대신 홈 화면이 뜰 때까지 폴링한다.
// "<앱> has stopped" 크래시 다이얼로그. 우리 앱이 아니라 android 패키지가 띄우는
// 창이라 force-stop으로 사라지지 않고, 화면을 덮은 채 남아 이후 job들이 전부
// "홈 화면을 못 찾음"으로 실패한다(ADBKeyBoard가 죽었을 때 실기기에서 확인).
export function findCrashDialogButton(nodes) {
  const isCrashDialog = nodes.some((node) => node.resourceId.endsWith('/aerr_close')
    || node.resourceId.endsWith('/aerr_app_info'));
  if (!isCrashDialog) return null;
  return findByResourceId(nodes, 'aerr_close') ?? findByResourceId(nodes, 'button1') ?? null;
}
