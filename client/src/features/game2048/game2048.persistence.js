export function createGameStateSaveRequest(state, { keepalive = false } = {}) {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
    ...(keepalive ? { keepalive: true } : {}),
  };
}

export async function discardSavedGame({ reset, clearSavedState }) {
  reset();
  await clearSavedState({ keepalive: true });
}
