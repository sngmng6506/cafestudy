<script setup>
import { computed, onMounted, ref } from 'vue';
import { MoreHorizontal } from '@lucide/vue';
import { features } from './features/index.js';
import ToastContainer from './shared/ToastContainer.vue';
import MemberSelectModal from './shared/MemberSelectModal.vue';
import FeatureWheel from './shared/FeatureWheel.vue';
import { useCurrentUser } from './shared/useCurrentUser.js';
import { useActiveBadge } from './shared/useActiveBadge.js';
import UserAvatar from './shared/UserAvatar.vue';

const { currentUserId, currentUserName, currentToken } = useCurrentUser();
const { activeBadgeImageUrl } = useActiveBadge();
const memberSelectOpen = ref(false);

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

const activeFeature = computed(
  () => sortedFeatures.find((feature) => feature.name === activeFeatureName.value) ?? sortedFeatures[0],
);
const overflowActive = computed(() =>
  overflowFeatures.value.some((feature) => feature.name === activeFeatureName.value),
);

function selectFeature(name) {
  activeFeatureName.value = name;
  moreOpen.value = false;
}

</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-md px-5 pb-28 pt-8 text-[#333333]">
    <div class="relative">
      <!-- 현재 사용자 표시 (페이지 타이틀과 같은 라인) -->
      <div class="absolute right-0 top-0 z-10">
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

    <!-- Bottom-fixed tab bar, constrained to the phone-width column -->
    <nav
      class="fixed bottom-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 gap-1 border-t border-[#dadce0] bg-white px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
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

    <ToastContainer />

    <!-- 멤버 선택 모달 -->
    <MemberSelectModal
      v-if="memberSelectOpen"
      :dismissable="!!currentToken"
      @close="memberSelectOpen = false"
    />

    <!-- 더보기: 전체 기능 회전 휠 -->
    <FeatureWheel
      v-if="moreOpen && hasOverflow"
      :features="sortedFeatures"
      :active-name="activeFeatureName"
      @select="selectFeature"
      @close="moreOpen = false"
    />
  </main>
</template>
