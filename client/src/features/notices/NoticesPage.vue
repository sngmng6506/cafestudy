<script setup>
import { onMounted } from 'vue';
import { Pin } from '@lucide/vue';
import { useNotices } from '../../shared/useNotices.js';

const { notices, loading, errorMessage, loadNotices, markRead } = useNotices();

onMounted(loadNotices);

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="ui-page-title">공지사항</h1>
    </div>

    <p v-if="loading && !notices.length" class="ui-text-muted py-12 text-center text-[14px]">공지를 불러오고 있어요.</p>
    <p v-else-if="errorMessage" class="ui-text-danger py-12 text-center text-[14px] font-semibold">{{ errorMessage }}</p>
    <div v-else-if="!notices.length" class="py-12 text-center">
      <p class="ui-text text-[15px]">아직 공지가 없어요.</p>
      <p class="ui-text-muted mt-1 text-[13px]">새 소식이 생기면 이곳에 알려드릴게요.</p>
    </div>

    <ul v-else class="grid gap-3">
      <li v-for="notice in notices" :key="notice.id" class="surface-card">
        <button class="focus-ring w-full text-left" type="button" @click="markRead(notice)">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Pin v-if="notice.isPinned" :size="15" class="ui-text-brand shrink-0" />
                <h2 class="ui-section-title">{{ notice.title }}</h2>
                <span v-if="!notice.isRead" class="ui-radius-badge bg-[var(--ui-color-brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">새 공지</span>
              </div>
              <p class="ui-text-caption mt-1">{{ notice.authorName }} · {{ formatDate(notice.publishedAt) }}</p>
            </div>
          </div>
          <p class="ui-text-muted mt-4 whitespace-pre-wrap text-[14px] leading-6">{{ notice.body }}</p>
        </button>
      </li>
    </ul>
  </section>
</template>
