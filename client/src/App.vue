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
  <main class="app-shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">CafeStudy MVP</p>
        <h1>스터디 모임 플랫폼</h1>
      </div>
    </section>

    <nav class="feature-tabs" aria-label="기능 탭">
      <button
        v-for="feature in sortedFeatures"
        :key="feature.name"
        class="tab-button"
        :class="{ active: feature.name === activeFeatureName }"
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
