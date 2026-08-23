import { computed, ref } from 'vue';
import { useCurrentUser } from './useCurrentUser.js';

// 로그인하지 않고 둘러보는 상태. 로그인 모달에서 '먼저 둘러보기'를 고르면 켜지고,
// 새로고침해도 모달이 다시 뜨지 않도록 localStorage에 남긴다.
export const STORAGE_GUEST_KEY = 'cafestudy_guest';

const browsing = ref(localStorage.getItem(STORAGE_GUEST_KEY) === '1');
// 로그인 모달을 왜 띄웠는지. 잠긴 기능을 눌러서 열렸다면 그 이유를 모달에 보여준다.
const loginPromptOpen = ref(false);
const loginReason = ref('');

export function useGuestGate() {
  const { currentUserId } = useCurrentUser();

  // 로그인하지 않았으면 게스트다. browsing은 "모달을 이미 지나왔는지"만 기억한다.
  const isGuest = computed(() => !currentUserId.value);

  function startBrowsing() {
    browsing.value = true;
    localStorage.setItem(STORAGE_GUEST_KEY, '1');
  }

  function stopBrowsing() {
    browsing.value = false;
    localStorage.removeItem(STORAGE_GUEST_KEY);
  }

  function requireLogin(reason = '') {
    loginReason.value = reason;
    loginPromptOpen.value = true;
  }

  function closeLoginPrompt() {
    loginPromptOpen.value = false;
    loginReason.value = '';
  }

  // 게스트면 로그인을 안내하고 동작을 막는다. 로그인 상태면 그대로 실행한다.
  function guard(reason, action) {
    if (isGuest.value) {
      requireLogin(reason);
      return false;
    }
    action?.();
    return true;
  }

  return {
    isGuest,
    browsing,
    loginPromptOpen,
    loginReason,
    startBrowsing,
    stopBrowsing,
    requireLogin,
    closeLoginPrompt,
    guard,
  };
}
