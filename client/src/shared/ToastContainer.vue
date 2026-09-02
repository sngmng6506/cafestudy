<script setup>
import { AlertCircle, CheckCircle, Info, X } from '@lucide/vue';
import { useToast } from './useToast.js';

const { toasts, dismiss } = useToast();

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info };
// Naver toasts are always neutral dark — only the icon carries semantic color.
const ICON_COLOR = { success: 'ui-text-brand', error: 'ui-text-danger', info: 'text-white' };
</script>

<template>
  <div
    class="ui-layer-toast pointer-events-none fixed bottom-[7.5rem] left-1/2 flex w-full max-w-md -translate-x-1/2 flex-col-reverse gap-2 px-5"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--ui-color-content)] px-4 py-3 text-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
        role="alert"
      >
        <component :is="ICONS[toast.type]" :size="18" class="shrink-0" :class="ICON_COLOR[toast.type]" />
        <span class="flex-1 text-[14px] font-semibold">{{ toast.message }}</span>
        <button
          type="button"
          class="focus-ring ui-transition-colors -my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
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
  transition:
    opacity var(--ui-duration-normal) var(--ui-ease-out),
    transform var(--ui-duration-normal) var(--ui-ease-out);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity var(--ui-duration-fast) var(--ui-ease-out);
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
