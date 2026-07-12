// 정모(모임 일정) 파싱 순수 함수 모음.
// 브라우저 없이 단위 테스트 가능하도록 크롤러에서 분리.
//
// 크롤러(members.crawler.js)는 page.evaluate 로 각 정모 카드에서
// { thumbnailSrc, title, dateTimeText, location, cost, attendeeFaceSrcs, capacityText }
// 형태의 raw 카드를 뽑고, 여기 함수들로 정규화한다.

// 크롤링된 시각은 KST 벽시계다. 서버 로컬 타임존으로 해석하면 UTC 컨테이너에서
// 9시간 밀리므로, 항상 UTC+9 고정 오프셋으로 절대 시각을 만든다 (KST는 DST 없음).
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDate(year, month0, day, hour, minute) {
  const date = new Date(Date.UTC(year, month0, day, hour, minute) - SEOUL_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 얼굴 이미지 URL에서 UUID(36자) 추출. 예: ".../<uuid>1t.png", ".../<uuid>1n.png"
export function extractFaceId(url) {
  if (!url) return null;
  const m = url.match(/\/([0-9a-f-]{36})1[tn]\.png/i);
  return m ? m[1] : null;
}

// 정모 썸네일 URL 끝의 YYYYMMDDHHMM 추출. 예: "...667c1202607041000s1.png"
export function extractDateTimeFromThumbnail(url) {
  if (!url) return null;
  const m = url.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})s\d+\.png$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return kstDate(+y, +mo - 1, +d, +h, +mi);
}

// 텍스트 fallback: "7/4(토) 오전 10:00" + 크롤링 연도.
// 썸네일 URL에서 날짜를 못 뽑을 때만 사용.
export function parseDateTimeText(text, crawlYear = new Date().getFullYear()) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\/(\d{1,2})\([월화수목금토일]\)\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, mo, d, ampm, hhRaw, mi] = m;
  let hh = +hhRaw;
  if (ampm === '오후' && hh !== 12) hh += 12;
  if (ampm === '오전' && hh === 12) hh = 0;
  return kstDate(crawlYear, +mo - 1, +d, hh, +mi);
}

// "7/10" -> { joined: 7, capacity: 10 }
export function parseCapacity(text) {
  if (!text) return { joined: null, capacity: null };
  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { joined: null, capacity: null };
  return { joined: +m[1], capacity: +m[2] };
}

// raw 카드 하나를 정규화된 정모 객체로 변환.
// memberByFaceId: { [faceId]: name } 매핑 테이블 (없으면 이름 null).
export function normalizeEvent(card, { crawlYear = new Date().getFullYear(), memberByFaceId = {} } = {}) {
  const scheduledAt =
    extractDateTimeFromThumbnail(card.thumbnailSrc) ??
    parseDateTimeText(card.dateTimeText, crawlYear);

  const { joined, capacity } = parseCapacity(card.capacityText);

  const seen = new Set();
  const attendees = [];
  for (const src of card.attendeeFaceSrcs ?? []) {
    const faceId = extractFaceId(src);
    if (!faceId || seen.has(faceId)) continue;
    seen.add(faceId);
    attendees.push({
      faceId,
      name: memberByFaceId[faceId] ?? null,
      isHost: attendees.length === 0,
    });
  }

  return {
    title: (card.title ?? '').trim() || '(제목 없음)',
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    location: card.location?.trim() || null,
    cost: card.cost?.trim() || null,
    joinedCount: joined,
    capacity,
    thumbnailUrl: card.thumbnailSrc ?? null,
    attendees,
  };
}

// 멤버 배열 -> { faceId: name } 매핑 테이블
export function buildFaceIdMap(members) {
  const map = {};
  for (const m of members ?? []) {
    if (m.face_id) map[m.face_id] = m.name;
    else if (m.faceId) map[m.faceId] = m.name;
  }
  return map;
}
