<script setup>
import { computed, onMounted, ref } from 'vue';
import { MoreHorizontal } from '@lucide/vue';
import { features } from './features/index.js';
import ToastContainer from './shared/ToastContainer.vue';
import MemberSelectModal from './shared/MemberSelectModal.vue';
import { useCurrentUser } from './shared/useCurrentUser.js';
import { avatarColor } from './shared/useAvatar.js';

const { currentUserId, currentUserName } = useCurrentUser();
const memberSelectOpen = ref(false);

onMounted(() => {
  if (!currentUserId.value) memberSelectOpen.value = true;
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
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            :class="avatarColor(currentUserName)"
          >
            {{ currentUserName.slice(0, 1) }}
          </span>
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
        <component :is="feature.icon" :size="24" />
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
        <MoreHorizontal :size="24" />
        더보기
      </button>
    </nav>

    <ToastContainer />

    <!-- 멤버 선택 모달 -->
    <MemberSelectModal
      v-if="memberSelectOpen"
      :dismissable="!!currentUserId"
      @close="memberSelectOpen = false"
    />

    <!-- 더보기 sheet -->
    <div v-if="moreOpen && hasOverflow" class="fixed inset-0 z-40" @click="moreOpen = false">
      <div class="absolute inset-0 bg-[#333333]/20"></div>
      <div class="absolute bottom-20 left-1/2 w-full max-w-md -translate-x-1/2 px-2" @click.stop>
        <div class="grid gap-1 rounded-xl border border-[#dadce0] bg-white p-2 shadow-sm" role="menu">
          <button
            v-for="feature in overflowFeatures"
            :key="feature.name"
            class="focus-ring flex w-full items-center gap-3 rounded px-4 py-3 text-[15px] font-semibold transition"
            :class="feature.name === activeFeatureName ? 'bg-[#03C75A] text-white' : 'text-[#333333] hover:bg-[#f5f6f7]'"
            type="button"
            role="menuitem"
            @click="selectFeature(feature.name)"
          >
            <component :is="feature.icon" :size="18" />
            {{ feature.label }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
