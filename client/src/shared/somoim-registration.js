// 소모임 등록 상태의 화면 표현. 브라우저 API에 의존하지 않는 순수 모듈이다.
const BADGES = Object.freeze({
  pending: { label: '소모임 등록 중', tone: 'ui-text-muted' },
  failed: { label: '소모임 등록 실패', tone: 'ui-text-danger' },
});

export function somoimBadge(state) {
  return BADGES[state] ?? null;
}

export function canJoin(state) {
  return state !== 'pending' && state !== 'failed';
}
