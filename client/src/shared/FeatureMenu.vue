<script setup>
import { ref } from 'vue';
import { Lock } from '@lucide/vue';
import { useOverlay } from './useOverlay.js';

const props = defineProps({
  features: { type: Array, required: true },
  activeName: { type: String, default: '' },
  isLocked: { type: Function, default: () => false },
});

const emit = defineEmits(['select', 'close']);
const menuRef = ref(null);

useOverlay({
  containerRef: menuRef,
  onClose: () => emit('close'),
  initialFocusSelector: '[role="menuitem"]',
  trapFocus: false,
  lockScroll: false,
});

function onMenuKeydown(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

  const items = [...menuRef.value.querySelectorAll('[role="menuitem"]')];
  if (!items.length) return;

  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement);
  let nextIndex;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = items.length - 1;
  else if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
  else nextIndex = (currentIndex <= 0 ? items.length : currentIndex) - 1;

  items[nextIndex].focus();
}
</script>

<template>
  <!-- 탭바보다 아래 레이어다. 배경막도 탭바 위에서 끊어 탭바가 계속 눌리게 둔다. -->
  <div class="fixed inset-0 ui-layer-menu">
    <div class="absolute inset-0 bottom-[var(--ui-bottom-bar-height,4.25rem)] bg-[var(--ui-color-content)]/20" @click="emit('close')"></div>

    <section
      ref="menuRef"
      class="ui-popover-panel absolute bottom-[calc(var(--ui-bottom-bar-height,4.25rem)+0.5rem)] right-[max(0.75rem,calc((100vw-28rem)/2+0.75rem))] flex max-h-[52vh] w-[min(9rem,calc(100vw-1.5rem))] origin-bottom-right flex-col rounded-2xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
      role="menu"
      aria-label="더보기 기능"
      tabindex="-1"
      @keydown="onMenuKeydown"
    >
      <!-- 제목은 두지 않는다. 방금 누른 버튼이 무엇을 열었는지는 이미 알고, 메뉴의
           이름은 아래 section의 aria-label이 낭독기에 알린다. -->
      <div class="flex shrink-0 justify-end border-b border-[var(--ui-color-stroke-subtle)] px-3 py-2">
        <button
          class="focus-ring ui-transition-colors flex h-11 items-center rounded px-3 text-[12px] font-semibold text-[var(--ui-color-content-muted)] hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
          type="button"
          @click="emit('close')"
        >
          닫기
        </button>
      </div>

      <div class="overflow-y-auto p-2">
        <button
          v-for="feature in props.features"
          :key="feature.name"
          class="focus-ring flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition"
          :class="[
            feature.name === activeName ? 'ui-bg-success ui-text-brand' : 'ui-text hover:bg-[var(--ui-color-surface-subtle)]',
            props.isLocked(feature) ? 'opacity-45' : '',
          ]"
          type="button"
          role="menuitem"
          :aria-disabled="props.isLocked(feature)"
          @click="emit('select', feature.name)"
        >
          <span
            class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
            :class="feature.name === activeName ? 'border-[var(--ui-color-brand)] bg-white' : 'border-[var(--ui-color-stroke)] bg-[var(--ui-color-canvas)]'"
          >
            <component :is="feature.icon" :size="16" />
            <Lock
              v-if="props.isLocked(feature)"
              class="ui-bg-surface absolute -right-1 -top-1 rounded-full"
              :size="10"
            />
          </span>
          <span class="min-w-0 flex-1 truncate text-[14px] font-semibold leading-snug">
            {{ feature.label }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
