import { ref } from 'vue';
import { apiFetch } from './api.js';
import { useToast } from './useToast.js';

// '깨부수기'는 전역 장난 모드 — 한 명이 깨부수면 서버 상태(app_flags)가
// 바뀌고 모든 사용자의 화면이 함께 깨진다. 다른 사람의 조작은 폴링과
// 탭 활성화 시점에 동기화된다.
const POLL_MS = 45_000;

const smashed = ref(false);
const toast = useToast();

let started = false;

async function loadState({ announce = false } = {}) {
  try {
    const body = await apiFetch('/api/smash');
    const next = body.data?.smashed ?? false;
    if (announce && next !== smashed.value) {
      const who = body.data?.updatedByName;
      toast.show(
        next
          ? `💥 ${who ?? '누군가'} 님이 앱을 깨부쉈습니다!`
          : `🔧 ${who ?? '누군가'} 님이 앱을 원래대로 고쳤습니다.`,
      );
    }
    smashed.value = next;
  } catch {
    // 상태 조회 실패는 조용히 무시 — 다음 폴링에서 다시 시도된다.
  }
}

function startSync() {
  if (started) return;
  started = true;
  void loadState();
  setInterval(() => void loadState({ announce: true }), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadState({ announce: true });
  });
}

export function useSmash() {
  startSync();

  async function toggleSmash() {
    try {
      const body = await apiFetch('/api/smash/toggle', { method: 'POST' });
      smashed.value = body.data?.smashed ?? false;
    } catch (error) {
      toast.error(error.message);
    }
  }

  return { smashed, toggleSmash };
}
