// 도메인 에러 표준화.
// 모든 feature가 이 헬퍼로 에러를 던지면, 라우트는 next(error) 한 줄로 끝나고
// app.js의 전역 에러 핸들러가 error.statusCode/code를 읽어 자동으로 HTTP 응답에 매핑한다.
// (기존엔 meetups/verifications에 throwError가 복붙, cafes는 라우트에서 수동 매핑,
//  members는 Object.assign 등 4가지 방식이 공존했음.)

export class AppError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// 임의 코드/상태로 던지기 (기존 throwError(statusCode, code, message)와 호환되게 인자 순서 제공)
export function throwError(statusCode, code, message) {
  throw new AppError(code, message, statusCode);
}

// 자주 쓰는 것들 — 의미가 드러나는 이름으로.
export function throwValidation(message) {
  throw new AppError('VALIDATION_ERROR', message, 400);
}

export function throwNotFound(code, message) {
  throw new AppError(code, message, 404);
}

export function throwForbidden(code, message) {
  throw new AppError(code, message, 403);
}

export function throwConflict(code, message) {
  throw new AppError(code, message, 409);
}
