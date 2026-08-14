export function createLatestRequestGuard() {
  let currentRequestId = 0;

  return {
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent(requestId) {
      return requestId === currentRequestId;
    },
  };
}
