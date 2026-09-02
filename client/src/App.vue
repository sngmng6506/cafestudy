<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Lock, MoreHorizontal, Plus, Search } from '@lucide/vue';
import ToastContainer from './shared/ToastContainer.vue';
import MemberSelectModal from './shared/MemberSelectModal.vue';
import FeatureMenu from './shared/FeatureMenu.vue';
import NotificationBell from './shared/NotificationBell.vue';
import MenuSearchSheet from './features/menu-search/MenuSearchSheet.vue';
import CreateMeetupDialog from './shared/CreateMeetupDialog.vue';
import { useMeetups } from './shared/useMeetups.js';
import UserAvatar from './shared/UserAvatar.vue';
import { useAppShell } from './shared/useAppShell.js';

const {
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
  requireLogin,
} = useAppShell();

// 모임 만들기는 셸이 소유한다. 하단에 항상 떠 있어야 하므로 화면 하나에 매달 수 없다.
const createOpen = ref(false);
// 목록 상태는 모듈 스코프라, 셸에서 한 번 다시 읽으면 홈과 모임 화면이 함께 갱신된다.
const { loadMeetups } = useMeetups();

function openCreateMeetup() {
  if (isGuest.value) {
    requireLogin('모임 만들기는 로그인하면 쓸 수 있어요.');
    return;
  }
  createOpen.value = true;
}

// 하단 바 높이를 CSS 변수로 내보낸다. 더보기 메뉴가 이 값 위에 자리를 잡는데,
// 예전엔 한 줄짜리 탭바 높이를 상수로 박아 둬서 바가 두 줄이 되자 메뉴가 바 뒤로
// 들어가 버렸다. 재는 편이 다음에 바가 바뀌어도 어긋나지 않는다.
const bottomBar = ref(null);
let barObserver = null;

onMounted(() => {
  if (!bottomBar.value || typeof ResizeObserver === 'undefined') return;
  const publish = () => {
    const height = bottomBar.value?.offsetHeight ?? 0;
    document.documentElement.style.setProperty('--ui-bottom-bar-height', `${height}px`);
  };
  publish();
  barObserver = new ResizeObserver(publish);
  barObserver.observe(bottomBar.value);
});

onBeforeUnmount(() => barObserver?.disconnect());

async function onMeetupCreated() {
  await loadMeetups();
  // 다른 화면에서 만들었다면 결과가 보이는 곳으로 데려간다.
  if (activeFeatureName.value !== 'home') selectFeature('home');
}

function browseAsGuest() {
  startBrowsing();
  memberSelectOpen.value = false;
  closeLoginPrompt();
}

function closeLogin() {
  memberSelectOpen.value = false;
  closeLoginPrompt();
}
</script>

<template>
  <main
    class="ui-text mx-auto min-h-screen w-full max-w-md px-5 pt-8"
    :class="[smashed ? 'smashed' : '', showBottomSearch ? 'pb-44' : 'pb-28']"
    :style="smashStyle"
  >
    <header class="mb-5 flex items-start justify-between gap-3">
      <h1 class="ui-page-title min-w-0 flex-1 break-keep">
        {{ activeFeature.title ?? activeFeature.label }}
      </h1>

      <div class="flex shrink-0 items-center gap-1">
        <NotificationBell v-if="currentToken" @open-notices="selectFeature('notices')" />
        <button
          v-if="currentUserId"
          class="focus-ring ui-text-muted ui-radius-pill flex max-w-[9rem] items-center gap-2 py-1 pl-2 pr-3 text-[13px] font-medium transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
          type="button"
          @click="memberSelectOpen = true"
        >
          <UserAvatar
            class="h-7 w-7 shrink-0 text-[12px]"
            :name="currentUserName"
            :image-url="activeBadgeImageUrl"
          />
          <span class="truncate">{{ currentUserName }}</span>
        </button>
        <button
          v-else
          class="focus-ring ui-text-brand ui-radius-pill px-3 py-1 text-[13px] font-medium transition hover:bg-[var(--ui-color-surface-subtle)]"
          type="button"
          @click="memberSelectOpen = true"
        >
          멤버 선택
        </button>
      </div>
    </header>

    <p
      v-if="isGuest"
      class="ui-radius-item ui-bg-subtle ui-text-muted mb-5 px-4 py-2.5 text-[13px] font-medium"
    >
      둘러보는 중이에요.
    </p>

    <component :is="activeFeature.component" />

    <div
      ref="bottomBar"
      class="ui-bg-surface ui-border fixed bottom-0 left-1/2 ui-layer-shell w-full max-w-md -translate-x-1/2 border-t shadow-[0_-4px_18px_rgba(0,0,0,0.06)]"
    >
      <!-- 만들기는 이동 수단이 아니라 행동이라 줄을 나눈다. 검색·더보기와 한 칸에
           섞으면 셋이 같은 무게로 보인다. -->
      <div class="border-b border-[var(--ui-color-stroke-subtle)] px-3 py-2.5">
        <button
          class="focus-ring ui-radius-control flex h-11 w-full items-center justify-center gap-1.5 bg-[var(--ui-color-brand)] text-[15px] font-semibold text-white transition hover:bg-[var(--ui-color-brand-hover)]"
          type="button"
          @click="openCreateMeetup"
        >
          <Plus :size="18" />
          모임 만들기
          <Lock v-if="isGuest" :size="13" class="opacity-80" />
        </button>
      </div>

      <div class="flex items-center gap-2 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
        <button
          v-if="showBottomSearch"
          class="focus-ring ui-search-trigger flex h-10 min-w-0 flex-1 items-center gap-2.5 px-3.5 text-left transition"
          type="button"
          aria-label="자연어로 기능 찾기"
          @click="openMenuSearch"
        >
          <Search class="ui-text-brand shrink-0" :size="17" />
          <span class="min-w-0 flex-1 truncate">찾고 싶은 기능 검색</span>
        </button>
        <span
          v-else
          class="ui-radius-item ui-border flex h-10 min-w-0 flex-1 items-center border px-3.5 text-[14px] font-semibold text-[var(--ui-color-content)]"
        >
          <span class="min-w-0 truncate">{{ activeFeature.title }}</span>
        </span>

        <button
          v-if="hasOverflow"
          class="focus-ring ui-radius-item ui-border flex h-10 w-10 shrink-0 items-center justify-center border transition"
          :class="moreOpen ? 'ui-nav-item-active' : 'ui-nav-item'"
          type="button"
          aria-label="더보기"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="toggleMore"
        >
          <MoreHorizontal :size="18" />
        </button>
      </div>
    </div>

    <CreateMeetupDialog :open="createOpen" @close="createOpen = false" @created="onMeetupCreated" />

    <ToastContainer />

    <Transition name="ui-modal">
      <MemberSelectModal
        v-if="memberSelectOpen || loginPromptOpen"
        :dismissable="!!currentToken || loginPromptOpen"
        :reason="loginReason"
        @close="closeLogin"
        @browse="browseAsGuest"
      />
    </Transition>

    <Transition name="ui-sheet">
      <MenuSearchSheet
        v-if="menuSearchOpen"
        :features="visibleFeatures"
        @select="selectFeature"
        @close="menuSearchOpen = false"
      />
    </Transition>

    <Transition name="ui-popover">
      <FeatureMenu
        v-if="moreOpen && hasOverflow"
        :features="moreItems"
        :active-name="activeFeatureName"
        :is-locked="isLocked"
        @select="selectFeature"
        @close="moreOpen = false"
      />
    </Transition>
  </main>
</template>

<style scoped>
/* 하단 검색 슬롯의 등장 트랜지션은 검색이 더보기와 한 줄이 되면서 사라졌다. */
</style>
