<script setup>
import { onMounted } from 'vue';
import { CalendarDays } from '@lucide/vue';
import { useUpcomingMeetups } from '../../shared/useUpcomingMeetups.js';
import MeetupCard from '../../shared/MeetupCard.vue';
import RefreshSomoimButton from '../../shared/RefreshSomoimButton.vue';

// 만들기는 셸의 하단 버튼이 소유한다(App.vue의 CreateMeetupDialog). 이 화면은
// 목록만 본다 — 폼을 여기에도 두면 같은 입력이 두 벌이 되어 갈라진다.
const {
  upcomingMeetups,
  loadingAny,
  pendingId,
  errorMessage,
  actionError,
  loadAll,
  loadSomoimEvents,
  toggleJoin,
  retrySomoim,
  cancelMeetup,
} = useUpcomingMeetups();

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <section class="grid gap-5">
    <section class="surface-card">
      <div class="mb-5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <CalendarDays :size="18" class="ui-text-brand" />
          <h2 class="ui-section-title">예정 모임</h2>
          <span
            v-if="!loadingAny && !errorMessage"
            class="ui-bg-subtle ui-text-muted ui-radius-item ml-1 px-2 py-0.5 text-sm font-semibold"
          >
            {{ upcomingMeetups.length }}
          </span>
        </div>
        <RefreshSomoimButton @refreshed="loadSomoimEvents" />
      </div>

      <p v-if="actionError" class="ui-text-danger ui-radius-item mb-4 bg-[var(--ui-color-danger-surface)] px-4 py-3 text-sm font-semibold">
        {{ actionError }}
      </p>

      <ul v-if="loadingAny" class="ui-border-subtle divide-y">
        <li v-for="n in 3" :key="n" class="flex animate-pulse flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
          <div class="ui-bg-subtle h-5 w-3/4 rounded-md"></div>
          <div class="ui-bg-subtle h-3 w-1/2 rounded"></div>
          <div class="ui-bg-subtle h-9 w-24 rounded-lg"></div>
        </li>
      </ul>

      <p v-else-if="errorMessage" class="ui-text-danger py-6 text-[15px] font-semibold">
        {{ errorMessage }}
      </p>

      <div v-else-if="upcomingMeetups.length === 0" class="py-8 text-center">
        <p class="ui-text text-[14px]">예정된 모임이 없어요.</p>
        <p class="ui-text-muted mt-1 text-[13px]">아래 ‘모임 만들기’로 새 모임을 열어 보세요.</p>
      </div>

      <ul v-else class="ui-border-subtle divide-y">
        <MeetupCard
          v-for="meetup in upcomingMeetups"
          :key="meetup.id"
          :meetup="meetup"
          :pending-id="pendingId"
          :show-readonly-dot="false"
          @toggle-join="toggleJoin"
          @retry-somoim="retrySomoim"
          @cancel="cancelMeetup"
        />
      </ul>
    </section>

  </section>
</template>
