// feature 간 직접 import를 피하기 위한 이벤트 훅.
// composition root가 만들어 ctx.hooks로 주입하고, feature는 onLoad(ctx)에서 구독한다.
// emit이 반환값을 모아 주므로, 이벤트를 낸 쪽이 결과를 받아 자기 테이블만 갱신할 수 있다.
const noopLogger = { error: () => {} };

export function createHooks({ logger = noopLogger } = {}) {
  const listeners = new Map();

  return {
    on(event, listener) {
      if (typeof listener !== 'function') return;
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(listener);
    },

    async emit(event, payload) {
      const results = [];
      for (const listener of listeners.get(event) ?? []) {
        try {
          const result = await listener(payload);
          if (result !== undefined) results.push(result);
        } catch (error) {
          // 리스너 실패가 이벤트를 낸 쪽의 동작을 깨뜨리면 안 된다.
          logger.error('hook_listener_failed', { event, message: error?.message });
        }
      }
      return results;
    },
  };
}
