import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Hammer, Wrench } from '@lucide/vue';
import { features } from '../features/index.js';
import { apiFetch } from './api.js';
import { useCurrentUser } from './useCurrentUser.js';
import { useFeatureNav } from './useFeatureNav.js';
import { useGuestGate } from './useGuestGate.js';
import { useActiveBadge } from './useActiveBadge.js';
import { useSmash } from './useSmash.js';
import { smashStyleVars } from './smash-style.js';

export function useAppShell() {
  const {
    currentUserId,
    currentUserName,
    currentToken,
    isAdmin,
    setCurrentUser,
    clearCurrentUser,
  } = useCurrentUser();
  const { activeBadgeImageUrl } = useActiveBadge();
  const { smashed, smashSeed, toggleSmash } = useSmash();

  const { activeFeatureName, goToFeature } = useFeatureNav();
  const {
    isGuest,
    browsing,
    loginPromptOpen,
    loginReason,
    startBrowsing,
    requireLogin,
    closeLoginPrompt,
  } = useGuestGate();
  const memberSelectOpen = ref(false);
  const menuSearchOpen = ref(false);
  const moreOpen = ref(false);
  let sessionTimer;

  const smashStyle = computed(() =>
    smashed.value ? smashStyleVars(smashSeed.value || 'smash') : {},
  );
  const visibleFeatures = computed(() =>
    features
      .filter((feature) => !feature.adminOnly || isAdmin.value)
      .sort((a, b) => a.order - b.order),
  );
  const primaryFeatures = computed(() => visibleFeatures.value.filter((feature) => feature.primary));
  const overflowFeatures = computed(() => visibleFeatures.value.filter((feature) => !feature.primary));
  const hasOverflow = computed(() => overflowFeatures.value.length > 0);
  const showBottomSearch = computed(() => activeFeatureName.value === 'home' && !moreOpen.value);
  const activeFeature = computed(
    () => visibleFeatures.value.find((feature) => feature.name === activeFeatureName.value)
      ?? visibleFeatures.value[0],
  );
  const overflowActive = computed(() =>
    overflowFeatures.value.some((feature) => feature.name === activeFeatureName.value),
  );
  const moreItems = computed(() => [
    ...overflowFeatures.value,
    {
      name: 'smash',
      label: smashed.value ? '원래대로' : '깨부수기',
      icon: smashed.value ? Wrench : Hammer,
    },
  ]);

  async function syncSession() {
    if (!currentToken.value) return;
    try {
      const response = await apiFetch('/api/auth/me');
      const user = response.data;
      setCurrentUser(user.id, user.name, currentToken.value, user.adminRole);
    } catch (error) {
      if (error.status === 401) {
        clearCurrentUser();
        memberSelectOpen.value = true;
      }
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void syncSession();
  }

  function closeOverlays() {
    moreOpen.value = false;
    menuSearchOpen.value = false;
  }

  function isLocked(feature) {
    return feature?.memberOnly === true && isGuest.value;
  }

  function selectFeature(name) {
    if (name === 'smash') {
      toggleSmash();
      closeOverlays();
      return;
    }

    // 잠긴 기능은 이동하지 않고 왜 막혔는지 알리며 로그인을 안내한다.
    const feature = visibleFeatures.value.find((item) => item.name === name);
    if (isLocked(feature)) {
      closeOverlays();
      // '기능은'을 붙여 두면 이름 끝소리와 무관하게 조사가 맞는다.
      requireLogin(`‘${feature.title ?? feature.label}’ 기능은 로그인하면 쓸 수 있어요.`);
      return;
    }

    goToFeature(name);
    closeOverlays();
  }

  function openMenuSearch() {
    // 오버레이는 한 번에 하나만 뜬다.
    moreOpen.value = false;
    menuSearchOpen.value = true;
  }

  function toggleMore() {
    menuSearchOpen.value = false;
    moreOpen.value = !moreOpen.value;
  }

  onMounted(async () => {
    // 이미 '둘러보기'를 고른 방문자에게는 모달을 다시 띄우지 않는다.
    if (!currentToken.value) memberSelectOpen.value = !browsing.value;
    else await syncSession();
    sessionTimer = window.setInterval(syncSession, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onUnmounted(() => {
    window.clearInterval(sessionTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return {
    currentUserId,
    currentUserName,
    currentToken,
    activeBadgeImageUrl,
    smashed,
    smashStyle,
    memberSelectOpen,
    menuSearchOpen,
    moreOpen,
    visibleFeatures,
    primaryFeatures,
    hasOverflow,
    showBottomSearch,
    activeFeatureName,
    activeFeature,
    overflowActive,
    moreItems,
    isGuest,
    loginPromptOpen,
    loginReason,
    isLocked,
    startBrowsing,
    closeLoginPrompt,
    selectFeature,
    openMenuSearch,
    toggleMore,
  };
}
