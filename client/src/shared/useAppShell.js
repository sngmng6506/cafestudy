import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Hammer, Wrench } from '@lucide/vue';
import { features } from '../features/index.js';
import { apiFetch } from './api.js';
import { useCurrentUser } from './useCurrentUser.js';
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

  const memberSelectOpen = ref(false);
  const menuSearchOpen = ref(false);
  const moreOpen = ref(false);
  const activeFeatureName = ref('home');
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
  const wheelItems = computed(() => [
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

  function selectFeature(name) {
    if (name === 'smash') {
      toggleSmash();
      moreOpen.value = false;
      return;
    }
    activeFeatureName.value = name;
    moreOpen.value = false;
    menuSearchOpen.value = false;
  }

  function openMenuSearch() {
    moreOpen.value = false;
    menuSearchOpen.value = true;
  }

  onMounted(async () => {
    if (!currentToken.value) memberSelectOpen.value = true;
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
    wheelItems,
    selectFeature,
    openMenuSearch,
  };
}
