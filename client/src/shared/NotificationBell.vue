<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { Bell, CheckCheck, X } from '@lucide/vue';
import { useCurrentUser } from './useCurrentUser.js';
import { useNotices } from './useNotices.js';
import { useToast } from './useToast.js';

const emit = defineEmits(['open-notices']);
const open = ref(false);
const { currentToken, currentUserId } = useCurrentUser();
const {
  recentNotices,
  notificationLoading,
  errorMessage,
  unreadCount,
  loadNotificationSummary,
  markRead,
  markAllRead,
  resetNotices,
} = useNotices();
const toast = useToast();
let timer;

async function refresh() {
  if (!currentToken.value) {
    resetNotices();
    return;
  }
  try {
    await loadNotificationSummary();
  } catch {
    // 팝오버 안의 errorMessage로 재시도 가능한 상태를 보여준다.
  }
}

watch([currentUserId, currentToken], () => {
  resetNotices();
  void refresh();
}, { immediate: true });

onMounted(() => {
  timer = window.setInterval(refresh, 60_000);
});

onUnmounted(() => window.clearInterval(timer));

async function openNotice(notice) {
  try {
    await markRead(notice);
    open.value = false;
    emit('open-notices', notice.id);
  } catch (error) {
    toast.error(error.message);
  }
}

async function readAll() {
  try {
    await markAllRead();
  } catch (error) {
    toast.error(error.message);
  }
}
</script>

<template>
  <div class="relative">
    <button
      class="focus-ring ui-text-muted ui-radius-pill relative flex h-9 w-9 items-center justify-center transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
      type="button"
      aria-label="알림 보기"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Bell :size="19" />
      <span
        v-if="unreadCount"
        class="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ui-color-destructive)] px-1 text-[10px] font-bold leading-none text-white"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="ui-bg-surface ui-radius-overlay absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden border border-[var(--ui-color-stroke)] shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
      role="dialog"
      aria-label="공지 알림"
    >
      <div class="ui-border-subtle flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 class="ui-section-title">알림</h2>
          <p class="ui-text-caption mt-0.5">새 공지를 확인할 수 있어요.</p>
        </div>
        <button class="focus-ring ui-text-muted p-1" type="button" aria-label="알림 닫기" @click="open = false">
          <X :size="18" />
        </button>
      </div>

      <div v-if="notificationLoading && !recentNotices.length" class="ui-text-muted px-4 py-8 text-center text-[14px]">공지를 불러오고 있어요.</div>
      <div v-else-if="errorMessage" class="px-4 py-6 text-center">
        <p class="ui-text-danger text-[14px]">{{ errorMessage }}</p>
        <button class="focus-ring ui-text-brand mt-2 text-[12px] font-semibold" type="button" @click="refresh">다시 불러오기</button>
      </div>
      <div v-else-if="!recentNotices.length" class="px-4 py-8 text-center">
        <p class="ui-text text-[14px]">아직 공지가 없어요.</p>
        <p class="ui-text-muted mt-1 text-[13px]">새 공지가 올라오면 여기에 표시돼요.</p>
      </div>
      <ul v-else class="max-h-80 overflow-y-auto">
        <li v-for="notice in recentNotices" :key="notice.id" class="ui-border-subtle border-b last:border-0">
          <button
            class="focus-ring w-full px-4 py-3 text-left transition hover:bg-[var(--ui-color-surface-hover)]"
            type="button"
            @click="openNotice(notice)"
          >
            <div class="flex items-start gap-2">
              <span v-if="!notice.isRead" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--ui-color-brand)]"></span>
              <span v-else class="mt-1.5 h-2 w-2 shrink-0"></span>
              <div class="min-w-0 flex-1">
                <p class="ui-text truncate text-[14px] font-semibold">{{ notice.title }}</p>
                <p class="ui-text-muted mt-1 line-clamp-2 text-[13px] leading-relaxed">{{ notice.body }}</p>
              </div>
            </div>
          </button>
        </li>
      </ul>

      <div v-if="recentNotices.length" class="ui-border-subtle flex items-center justify-between border-t px-3 py-2">
        <button class="focus-ring ui-text-link flex items-center gap-1 px-2 py-1 text-[12px] font-medium" type="button" @click="readAll">
          <CheckCheck :size="15" /> 모두 읽음으로 표시
        </button>
        <button class="focus-ring ui-text-brand px-2 py-1 text-[12px] font-semibold" type="button" @click="open = false; emit('open-notices')">
          공지 전체 보기
        </button>
      </div>
    </div>
  </div>
</template>
