import { ref } from 'vue';
import { apiFetch } from './api.js';
import { useToast } from './useToast.js';

// '깨부수기'는 전역 장난 모드 — 한 명이 깨부수면 서버 상태(app_flags)가
// 바뀌고 모든 사용자의 화면이 함께 깨진다. 누가 그랬는지는 알 수 없다.
// 다른 사람의 조작은 폴링과 탭 활성화 시점에 조용히 반영된다.
const POLL_MS = 45_000;

const smashed = ref(false);
// 랜덤 파괴 패턴의 시드 — 서버 updated_at이라 모든 사용자가 같은 패턴을 본다.
const smashSeed = ref('');
const toast = useToast();

let started = false;

function applyState(data) {
  smashed.value = data?.smashed ?? false;
  smashSeed.value = data?.updatedAt ?? '';
}

async function loadState() {
  try {
    const body = await apiFetch('/api/smash');
    applyState(body.data);
  } catch {
    // 상태 조회 실패는 조용히 무시 — 다음 폴링에서 다시 시도된다.
  }
}

function startSync() {
  if (started) return;
  started = true;
  void loadState();
  setInterval(() => void loadState(), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadState();
  });
}

export function useSmash() {
  startSync();

  async function toggleSmash() {
    try {
      const body = await apiFetch('/api/smash/toggle', { method: 'POST' });
      applyState(body.data);
    } catch (error) {
      toast.error(error.message);
    }
  }

  return { smashed, smashSeed, toggleSmash };
}
