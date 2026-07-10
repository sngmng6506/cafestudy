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
      class="absolute bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 flex max-h-[52vh] w-full max-w-md -translate-x-1/2 flex-col rounded-t-2xl bg-white shadow-[0_-8px_28px_rgba(0,0,0,0.14)]"
      role="menu"
      aria-label="더보기 기능"
    >
      <div class="shrink-0 border-b border-[#e9ebee] px-5 py-3">
        <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-[#dadce0]"></div>
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-[17px] font-bold text-[#333333]">더보기</h2>
          <button
            class="focus-ring rounded px-2 py-1 text-[13px] font-semibold text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
            type="button"
            @click="emit('close')"
          >
            닫기
          </button>
        </div>
      </div>

      <div class="overflow-y-auto px-3 py-2">
        <button
          v-for="feature in props.features"
          :key="feature.name"
          class="focus-ring flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition"
          :class="feature.name === activeName ? 'bg-[#e9f8ef] text-[#03C75A]' : 'text-[#333333] hover:bg-[#f5f6f7]'"
          type="button"
          role="menuitem"
          @click="emit('select', feature.name)"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
            :class="feature.name === activeName ? 'border-[#03C75A] bg-white' : 'border-[#dadce0] bg-[#f7f8f9]'"
          >
            <component :is="feature.icon" :size="18" />
          </span>
          <span class="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
            {{ feature.label }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
