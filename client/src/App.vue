<script setup>
import { computed, onMounted, ref } from 'vue';
import { Hammer, MoreHorizontal, Search, Wrench } from '@lucide/vue';
import { features } from './features/index.js';
import ToastContainer from './shared/ToastContainer.vue';
import MemberSelectModal from './shared/MemberSelectModal.vue';
import FeatureWheel from './shared/FeatureWheel.vue';
import MenuSearchSheet from './features/menu-search/MenuSearchSheet.vue';
import { useCurrentUser } from './shared/useCurrentUser.js';
import { useActiveBadge } from './shared/useActiveBadge.js';
import { useSmash } from './shared/useSmash.js';
import { smashStyleVars } from './shared/smash-style.js';
import UserAvatar from './shared/UserAvatar.vue';

const { currentUserId, currentUserName, currentToken } = useCurrentUser();
const { activeBadgeImageUrl } = useActiveBadge();
const { smashed, smashSeed, toggleSmash } = useSmash();

// 깨질 때마다(updated_at이 바뀔 때마다) 새로운 랜덤 파괴 패턴.
const smashStyle = computed(() =>
  smashed.value ? smashStyleVars(smashSeed.value || 'smash') : {},
);
const memberSelectOpen = ref(false);
const menuSearchOpen = ref(false);

onMounted(() => {
  // 유효한 세션 토큰이 있어야 로그인 상태로 본다.
  if (!currentToken.value) memberSelectOpen.value = true;
});

// Features flagged `primary` are pinned to the bottom bar; everything else
// (extra features contributors add later) collects in the "더보기" sheet, so the
// core navigation never gets crowded out as features grow.
const sortedFeatures = [...features].sort((a, b) => a.order - b.order);
const activeFeatureName = ref(sortedFeatures[0]?.name ?? '');
const moreOpen = ref(false);

const primaryFeatures = computed(() => sortedFeatures.filter((feature) => feature.primary));
const overflowFeatures = computed(() => sortedFeatures.filter((feature) => !feature.primary));
const hasOverflow = computed(() => overflowFeatures.value.length > 0);
const showBottomSearch = computed(() => activeFeatureName.value === 'home' && !moreOpen.value);

const activeFeature = computed(
  () => sortedFeatures.find((feature) => feature.name === activeFeatureName.value) ?? sortedFeatures[0],
);
const overflowActive = computed(() =>
  overflowFeatures.value.some((feature) => feature.name === activeFeatureName.value),
);

// 더보기 휠 항목 = 탭바에 없는 기능 + '깨부수기' 장난 토글.
// 깨진 상태에서는 이름이 '원래대로'로 바뀐다.
const wheelItems = computed(() => [
  ...overflowFeatures.value,
  {
    name: 'smash',
    label: smashed.value ? '원래대로' : '깨부수기',
    icon: smashed.value ? Wrench : Hammer,
  },
]);

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

</script>

<template>
  <main
    class="mx-auto min-h-screen w-full max-w-md px-5 pt-8 text-[#333333]"
    :class="[smashed ? 'smashed' : '', showBottomSearch ? 'pb-44' : 'pb-28']"
    :style="smashStyle"
  >
    <div class="relative">
      <!-- 현재 사용자 표시 (페이지 타이틀과 같은 라인) -->
      <div class="absolute right-0 top-0 z-10 flex items-center gap-1">
        <button
          v-if="currentUserId"
          class="focus-ring flex items-center gap-2 rounded-full py-1 pl-2 pr-3 text-[13px] font-medium text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
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
          class="focus-ring rounded-full px-3 py-1 text-[13px] font-medium text-[#03C75A] transition hover:bg-[#f5f6f7]"
          type="button"
          @click="memberSelectOpen = true"
        >
          멤버 선택
        </button>
      </div>

      <component :is="activeFeature.component" />
    </div>

    <!-- Home-only search entry + bottom tab bar, constrained to the phone-width column -->
    <div
      class="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-[#dadce0] bg-white px-2 pt-2 shadow-[0_-4px_18px_rgba(0,0,0,0.06)]"
    >
      <button
        v-if="showBottomSearch"
        class="focus-ring mx-2 flex h-11 w-[calc(100%-1rem)] items-center gap-2.5 rounded-xl border border-[#dadce0] bg-[#f7f8f9] px-4 text-left text-[14px] font-medium text-[#5f6368] transition hover:border-[#bfc4c9] hover:bg-[#f1f3f4]"
        type="button"
        aria-label="자연어로 기능 찾기"
        @click="openMenuSearch"
      >
        <Search class="shrink-0 text-[#03C75A]" :size="18" />
        <span class="min-w-0 flex-1 truncate">하고 싶은 기능을 문장으로 찾아보세요</span>
      </button>

      <nav
        class="flex gap-1 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
        :class="showBottomSearch ? 'mt-1.5' : ''"
        aria-label="기능 탭"
      >
        <button
          v-for="feature in primaryFeatures"
          :key="feature.name"
          class="focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
          :class="feature.name === activeFeatureName ? 'font-bold text-[#03C75A] before:absolute before:-top-1.5 before:left-1/2 before:h-[3px] before:w-8 before:-translate-x-1/2 before:rounded-full before:bg-[#03C75A]' : 'font-medium text-[#5f6368] hover:text-[#333333]'"
          type="button"
          @click="selectFeature(feature.name)"
        >
          <component :is="feature.icon" :size="20" />
          {{ feature.label }}
        </button>

        <button
          v-if="hasOverflow"
          class="focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
          :class="overflowActive || moreOpen ? 'font-bold text-[#03C75A] before:absolute before:-top-1.5 before:left-1/2 before:h-[3px] before:w-8 before:-translate-x-1/2 before:rounded-full before:bg-[#03C75A]' : 'font-medium text-[#5f6368] hover:text-[#333333]'"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          <MoreHorizontal :size="20" />
          더보기
        </button>
      </nav>
    </div>

    <ToastContainer />

    <!-- 멤버 선택 모달 -->
    <MemberSelectModal
      v-if="memberSelectOpen"
      :dismissable="!!currentToken"
      @close="memberSelectOpen = false"
    />

    <MenuSearchSheet
      v-if="menuSearchOpen"
      :features="sortedFeatures"
      @select="selectFeature"
      @close="menuSearchOpen = false"
    />

    <!-- 더보기: 회전 휠 (탭바에 없는 기능 + 깨부수기) -->
    <FeatureWheel
      v-if="moreOpen && hasOverflow"
      :features="wheelItems"
      :active-name="activeFeatureName"
      @select="selectFeature"
      @close="moreOpen = false"
    />
  </main>
</template>