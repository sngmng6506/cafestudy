<script setup>
import { onBeforeUnmount, onMounted } from 'vue';

const props = defineProps({
  features: { type: Array, required: true },
  activeName: { type: String, default: '' },
});

const emit = defineEmits(['select', 'close']);

function onKeydown(event) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="fixed inset-0 z-40">
    <div class="absolute inset-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] bg-[#333333]/20" @click="emit('close')"></div>

    <section
      class="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-[max(0.75rem,calc((100vw-28rem)/2+0.75rem))] flex max-h-[52vh] w-[min(9rem,calc(100vw-1.5rem))] flex-col rounded-2xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
      role="menu"
      aria-label="더보기 기능"
    >
      <div class="shrink-0 border-b border-[var(--ui-color-stroke-subtle)] px-3 py-2.5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-bold text-[var(--ui-color-content)]">더보기</h2>
          <button
            class="focus-ring rounded px-1.5 py-1 text-[12px] font-semibold text-[var(--ui-color-content-muted)] transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
            type="button"
            @click="emit('close')"
          >
            닫기
          </button>
        </div>
      </div>

      <div class="overflow-y-auto p-2">
        <button
          v-for="feature in props.features"
          :key="feature.name"
          class="focus-ring flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition"
          :class="feature.name === activeName ? 'bg-[var(--ui-color-success-surface)] text-[var(--ui-color-brand)]' : 'text-[var(--ui-color-content)] hover:bg-[var(--ui-color-surface-subtle)]'"
          type="button"
          role="menuitem"
          @click="emit('select', feature.name)"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
            :class="feature.name === activeName ? 'border-[var(--ui-color-brand)] bg-white' : 'border-[var(--ui-color-stroke)] bg-[var(--ui-color-canvas)]'"
          >
            <component :is="feature.icon" :size="16" />
          </span>
          <span class="min-w-0 flex-1 truncate text-[14px] font-semibold leading-snug">
            {{ feature.label }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
