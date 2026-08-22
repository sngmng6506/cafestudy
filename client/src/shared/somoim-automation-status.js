// 자동화 요청 상태의 표시 규칙. 브라우저 API에 의존하지 않는 순수 모듈이다.

// 서버 상태값을 관리자 화면에서 쓰는 묶음으로 옮긴다.
// '실패'와 '확인 필요'는 둘 다 사람이 봐야 하는 상태라 한 필터로 묶는다.
export const JOB_FILTERS = Object.freeze([
  { key: 'all', label: '전체', status: '' },
  { key: 'running', label: '진행 중', status: 'pending,claimed' },
  { key: 'done', label: '완료', status: 'succeeded' },
  { key: 'blocked', label: '확인 필요', status: 'failed,needs_manual_review' },
]);

const STATUS_LABELS = Object.freeze({
  pending: '대기 중',
  claimed: '진행 중',
  succeeded: '완료',
  failed: '실패',
  needs_manual_review: '확인 필요',
});

const STATUS_TONES = Object.freeze({
  pending: 'ui-text-muted',
  claimed: 'ui-text-link',
  succeeded: 'ui-text-brand',
  failed: 'ui-text-danger',
  needs_manual_review: 'ui-text-danger',
});

export function jobStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function jobStatusTone(status) {
  return STATUS_TONES[status] ?? 'ui-text-muted';
}

export function jobFilterStatus(key) {
  return JOB_FILTERS.find((filter) => filter.key === key)?.status ?? '';
}
