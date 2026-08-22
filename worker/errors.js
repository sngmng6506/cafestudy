// worker 실패는 두 종류다. 확신할 수 없는 상태는 사람이 봐야 하므로
// ManualReviewError로, 아무 입력도 하지 않은 명백한 일시 장애만 TransientError로 던진다.
export class ManualReviewError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ManualReviewError';
    this.needsManualReview = true;
    this.details = details;
  }
}

export class TransientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TransientError';
    this.needsManualReview = false;
    this.details = details;
  }
}
