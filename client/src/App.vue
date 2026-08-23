<script setup>
import { MoreHorizontal, Search } from '@lucide/vue';
import ToastContainer from './shared/ToastContainer.vue';
import MemberSelectModal from './shared/MemberSelectModal.vue';
import FeatureMenu from './shared/FeatureMenu.vue';
import NotificationBell from './shared/NotificationBell.vue';
import MenuSearchSheet from './features/menu-search/MenuSearchSheet.vue';
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
  primaryFeatures,
  hasOverflow,
  showBottomSearch,
  activeFeatureName,
  activeFeature,
  overflowActive,
  moreItems,
  selectFeature,
  openMenuSearch,
  toggleMore,
} = useAppShell();
</script>

<template>
  <main
    class="ui-text mx-auto min-h-screen w-full max-w-md px-5 pt-8"
    :class="[smashed ? 'smashed' : '', showBottomSearch ? 'pb-44' : 'pb-28']"
    :style="smashStyle"
  >
    <div class="relative">
      <div class="absolute right-0 top-0 z-20 flex items-center gap-1">
        <NotificationBell v-if="currentToken" @open-notices="selectFeature('notices')" />
        <button
          v-if="currentUserId"
          class="focus-ring ui-text-muted ui-radius-pill flex items-center gap-2 py-1 pl-2 pr-3 text-[13px] font-medium transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
          type="button"
          @click="memberSelectOpen = true"
        >
          <UserAvatar
            class="h-7 w-7 text-[12px]"
            :name="currentUserName"
            :image-url="activeBadgeImageUrl"
          />
          {{ currentUserName }}
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

      <component :is="activeFeature.component" />
    </div>

    <div
      class="ui-bg-surface ui-border fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t px-2 pt-2 shadow-[0_-4px_18px_rgba(0,0,0,0.06)]"
    >
      <Transition name="bottom-search">
        <div v-if="showBottomSearch" class="bottom-search-slot overflow-hidden px-2">
          <button
            class="focus-ring ui-search-trigger flex h-11 w-full items-center gap-2.5 px-4 text-left transition"
            type="button"
            aria-label="자연어로 기능 찾기"
            @click="openMenuSearch"
          >
            <Search class="ui-text-brand shrink-0" :size="18" />
            <span class="min-w-0 flex-1 truncate">찾고 싶은 기능 검색</span>
          </button>
        </div>
      </Transition>

      <nav
        class="flex gap-1 pb-[calc(0.375rem+env(safe-area-inset-bottom))] transition-[margin] duration-200 ease-out"
        :class="showBottomSearch ? 'mt-1.5' : ''"
        aria-label="기능 탭"
      >
        <button
          v-for="feature in primaryFeatures"
          :key="feature.name"
          class="focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
          :class="feature.name === activeFeatureName ? 'ui-nav-item-active' : 'ui-nav-item'"
          type="button"
          @click="selectFeature(feature.name)"
        >
          <component :is="feature.icon" :size="20" />
          {{ feature.label }}
        </button>

        <button
          v-if="hasOverflow"
          class="focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
          :class="overflowActive ? 'ui-nav-item-active' : 'ui-nav-item'"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="toggleMore"
        >
          <MoreHorizontal :size="20" />
          더보기
        </button>
      </nav>
    </div>

    <ToastContainer />

    <MemberSelectModal
      v-if="memberSelectOpen"
      :dismissable="!!currentToken"
      @close="memberSelectOpen = false"
    />

    <MenuSearchSheet
      v-if="menuSearchOpen"
      :features="visibleFeatures"
      @select="selectFeature"
      @close="menuSearchOpen = false"
    />

    <FeatureMenu
      v-if="moreOpen && hasOverflow"
      :features="moreItems"
      :active-name="activeFeatureName"
      @select="selectFeature"
      @close="moreOpen = false"
    />
  </main>
</template>

<style scoped>
.bottom-search-slot {
  max-height: 44px;
  transform-origin: bottom center;
}

.bottom-search-enter-active {
  transition:
    max-height 220ms cubic-bezier(0, 0, 0.2, 1),
    opacity 180ms cubic-bezier(0, 0, 0.2, 1),
    transform 220ms cubic-bezier(0, 0, 0.2, 1);
}

.bottom-search-leave-active {
  transition:
    max-height 220ms cubic-bezier(0.4, 0, 1, 1),
    opacity 160ms cubic-bezier(0.4, 0, 1, 1),
    transform 220ms cubic-bezier(0.4, 0, 1, 1);
}

.bottom-search-enter-from,
.bottom-search-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .bottom-search-enter-active,
  .bottom-search-leave-active {
    transition: none;
  }
}
</style>
