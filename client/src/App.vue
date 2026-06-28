<script setup>
import { computed, ref } from 'vue';
import { MoreHorizontal } from '@lucide/vue';
import { features } from './features/index.js';
import ToastContainer from './shared/ToastContainer.vue';

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
  <main class="mx-auto min-h-screen w-full max-w-md px-5 pb-28 pt-8 text-[#191F28]">
    <component :is="activeFeature.component" />

    <!-- Bottom-fixed tab bar, constrained to the phone-width column -->
    <nav
      class="fixed bottom-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 gap-1 border-t border-[#E5E8EB] bg-white px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
      aria-label="기능 탭"
    >
      <button
        v-for="feature in primaryFeatures"
        :key="feature.name"
        class="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
        :class="feature.name === activeFeatureName ? 'font-bold text-[#16A34A]' : 'font-medium text-[#8B95A1] hover:text-[#191F28]'"
        type="button"
        @click="selectFeature(feature.name)"
      >
        <component :is="feature.icon" :size="20" />
        {{ feature.label }}
      </button>

      <button
        v-if="hasOverflow"
        class="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition"
        :class="overflowActive || moreOpen ? 'font-bold text-[#16A34A]' : 'font-medium text-[#8B95A1] hover:text-[#191F28]'"
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

    <!-- 더보기 sheet -->
    <div v-if="moreOpen && hasOverflow" class="fixed inset-0 z-40" @click="moreOpen = false">
      <div class="absolute inset-0 bg-[#191F28]/20"></div>
      <div class="absolute bottom-20 left-1/2 w-full max-w-md -translate-x-1/2 px-2" @click.stop>
        <div class="grid gap-1 rounded-xl border border-[#E5E8EB] bg-white p-2 shadow-sm" role="menu">
          <button
            v-for="feature in overflowFeatures"
            :key="feature.name"
            class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-semibold transition"
            :class="feature.name === activeFeatureName ? 'bg-[#16A34A] text-white' : 'text-[#191F28] hover:bg-[#F9FAFB]'"
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
