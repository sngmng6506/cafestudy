<script setup>
import { computed, ref } from 'vue';
import { features } from './features/index.js';

const sortedFeatures = [...features].sort((a, b) => a.order - b.order);
const activeFeatureName = ref(sortedFeatures[0]?.name ?? '');

const activeFeature = computed(() => {
  return sortedFeatures.find((feature) => feature.name === activeFeatureName.value) ?? sortedFeatures[0];
});
</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 text-[#191F28] sm:px-8 sm:py-10">
    <section class="mb-6">
      <p class="mb-2 text-sm font-medium text-[#8B95A1]">CafeStudy MVP</p>
      <h1 class="text-[28px] font-bold leading-tight text-[#191F28]">스터디 모임 플랫폼</h1>
    </section>

    <nav
      class="mb-8 flex gap-2 overflow-x-auto rounded-2xl border border-[#E5E8EB] bg-white p-1.5 shadow-sm"
      aria-label="기능 탭"
    >
      <button
        v-for="feature in sortedFeatures"
        :key="feature.name"
        class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-[#8B95A1] transition"
        :class="feature.name === activeFeatureName ? 'bg-[#16A34A] text-white' : 'hover:bg-[#F9FAFB] hover:text-[#191F28]'"
        type="button"
        @click="activeFeatureName = feature.name"
      >
        <component :is="feature.icon" :size="17" />
        {{ feature.label }}
      </button>
    </nav>

    <component :is="activeFeature.component" />
  </main>
</template>
