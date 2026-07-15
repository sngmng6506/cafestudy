<script setup>
import { onMounted } from 'vue';
import { Pin } from '@lucide/vue';
import { useNotices } from '../../shared/useNotices.js';
import { useToast } from '../../shared/useToast.js';

const {
  notices,
  loading,
  hasMore,
  errorMessage,
  loadNotices,
  loadMoreNotices,
  markAllRead,
} = useNotices();
const toast = useToast();

onMounted(async () => {
  try {
    await loadNotices();
  } catch {
    return;
  }

  if (notices.value.length) {
    try {
      await markAllRead();
    } catch (error) {
      toast.error(error.message);
    }
  }
});

async function loadMore() {
  try {
    await loadMoreNotices();
  } catch (error) {
    toast.error(error.message);
  }
}

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
    <div v-else-if="errorMessage && !notices.length" class="py-12 text-center">
      <p class="ui-text-danger text-[14px] font-semibold">{{ errorMessage }}</p>
      <button class="focus-ring ui-text-brand mt-3 text-[13px] font-semibold" type="button" @click="loadNotices()">다시 불러오기</button>
    </div>
    <div v-else-if="!notices.length" class="py-12 text-center">
      <p class="ui-text text-[15px]">아직 공지가 없어요.</p>
      <p class="ui-text-muted mt-1 text-[13px]">새 소식이 생기면 이곳에 알려드릴게요.</p>
    </div>

    <template v-else>
      <ul class="grid gap-3">
        <li v-for="notice in notices" :key="notice.id" class="surface-card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Pin v-if="notice.isPinned" :size="15" class="ui-text-brand shrink-0" />
                <h2 class="ui-section-title">{{ notice.title }}</h2>
              </div>
              <p class="ui-text-caption mt-1">{{ notice.authorName }} · {{ formatDate(notice.publishedAt) }}</p>
            </div>
          </div>
          <p class="ui-text-muted mt-4 whitespace-pre-wrap text-[14px] leading-6">{{ notice.body }}</p>
        </li>
      </ul>

      <button
        v-if="hasMore"
        class="focus-ring ui-radius-control ui-border h-11 w-full border text-[14px] font-semibold disabled:opacity-50"
        type="button"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? '공지를 불러오고 있어요.' : '이전 공지 더 보기' }}
      </button>
    </template>
  </section>
</template>
