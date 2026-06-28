<script setup>
import { AlertCircle, CheckCircle, Info, X } from '@lucide/vue';
import { useToast } from './useToast.js';

const { toasts, dismiss } = useToast();

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info };
const BG = { success: 'bg-[#16A34A]', error: 'bg-[#F04452]', info: 'bg-[#191F28]' };
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-[7.5rem] left-1/2 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col-reverse gap-2 px-5"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md"
        :class="BG[toast.type]"
        role="alert"
      >
        <component :is="ICONS[toast.type]" :size="18" class="shrink-0" />
        <span class="flex-1 text-[14px] font-semibold">{{ toast.message }}</span>
        <button
          type="button"
          class="shrink-0 opacity-80 transition hover:opacity-100"
          aria-label="닫기"
          @click="dismiss(toast.id)"
        >
          <X :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
