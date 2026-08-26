<script setup>
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@lucide/vue';
import { formatTime } from '../../shared/useMeetups.js';
import { dayKey, useUpcomingMeetups } from '../../shared/useUpcomingMeetups.js';
import { useFeatureNav } from '../../shared/useFeatureNav.js';
import MeetupCard from '../../shared/MeetupCard.vue';
import UserAvatar from '../../shared/UserAvatar.vue';
import { attendeeStack } from '../../shared/useSomoimEvents.js';
import RefreshSomoimButton from '../../shared/RefreshSomoimButton.vue';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 홈은 미리보기만 보여준다. 전체 목록은 모임 탭이 담당한다.
const PREVIEW_COUNT = 3;

const {
  upcomingMeetups,
  meetupsByDay,
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
const { goToFeature } = useFeatureNav();

const viewMonth = ref(startOfMonth(new Date()));
const selectedDate = ref(null);
const infoOpen = ref(false);

const previewMeetups = computed(() => upcomingMeetups.value.slice(0, PREVIEW_COUNT));

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(viewMonth.value),
);

const calendarDays = computed(() => {
  const start = new Date(viewMonth.value);
  start.setDate(1 - viewMonth.value.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
});

const selectedMeetups = computed(() =>
  selectedDate.value ? meetupsByDay.value[dayKey(selectedDate.value)] ?? [] : [],
);
const selectedLabel = computed(() =>
  selectedDate.value
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(
        selectedDate.value,
      )
    : '',
);

onMounted(() => {
  void loadAll();
});

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function countOn(date) {
  return meetupsByDay.value[dayKey(date)]?.length ?? 0;
}

function isCurrentMonth(date) {
  return date.getMonth() === viewMonth.value.getMonth();
}

function isToday(date) {
  return dayKey(date) === dayKey(new Date());
}

function isSelected(date) {
  return selectedDate.value && dayKey(date) === dayKey(selectedDate.value);
}

function dayAriaLabel(date) {
  const count = countOn(date);
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return count ? `${base}, 모임 ${count}건` : base;
}

function cellClass(date) {
  if (isSelected(date)) return 'bg-[var(--ui-color-brand)] text-white';

  const classes = ['hover:bg-[var(--ui-color-surface-subtle)]'];
  if (!isCurrentMonth(date)) {
    classes.push('text-[#C4CAD2]');
  } else if (date.getDay() === 0) {
    classes.push('text-[var(--ui-color-destructive)]');
  } else if (date.getDay() === 6) {
    classes.push('text-[var(--ui-color-link)]');
  } else {
    classes.push('text-[var(--ui-color-content)]');
  }
  if (isToday(date)) classes.push('ring-1 ring-inset ring-[var(--ui-color-brand)]');
  return classes.join(' ');
}

function selectDay(date) {
  selectedDate.value = new Date(date);
  if (!isCurrentMonth(date)) viewMonth.value = startOfMonth(date);
}

function shiftMonth(delta) {
  viewMonth.value = new Date(
    viewMonth.value.getFullYear(),
    viewMonth.value.getMonth() + delta,
    1,
  );
}

function calendarAttendeeStack(meetup) {
  return attendeeStack(meetup.attendees, 3);
}
</script>

<template>
  <section class="grid gap-5">
    <!-- 모임 캘린더 -->
    <section class="surface-card">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-[var(--ui-color-content)]">모임 캘린더</h3>
        <div class="flex items-center gap-1">
          <button
            class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[var(--ui-color-content-muted)] transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
            type="button"
            aria-label="이전 달"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="18" />
          </button>
          <span class="min-w-[88px] text-center text-[15px] font-semibold text-[var(--ui-color-content)]">{{ monthLabel }}</span>
          <button
            class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[var(--ui-color-content-muted)] transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
            type="button"
            aria-label="다음 달"
            @click="shiftMonth(1)"
          >
            <ChevronRight :size="18" />
          </button>
        </div>
      </div>

      <div class="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold">
        <span
          v-for="(label, index) in WEEKDAYS"
          :key="label"
          :class="index === 0 ? 'text-[var(--ui-color-destructive)]' : index === 6 ? 'text-[var(--ui-color-link)]' : 'text-[var(--ui-color-content-muted)]'"
        >
          {{ label }}
        </span>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="date in calendarDays"
          :key="date.toISOString()"
          type="button"
          class="focus-ring relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition"
          :class="cellClass(date)"
          :aria-label="dayAriaLabel(date)"
          :aria-pressed="isSelected(date)"
          @click="selectDay(date)"
        >
          {{ date.getDate() }}
          <span
            v-if="countOn(date)"
            class="mt-0.5 h-1.5 w-1.5 rounded-full"
            :class="isSelected(date) ? 'bg-white' : 'bg-[var(--ui-color-brand)]'"
          ></span>
        </button>
      </div>

      <div class="mt-5 border-t border-[var(--ui-color-stroke)] pt-5">
        <p v-if="!selectedDate" class="text-[15px] text-[var(--ui-color-content-muted)]">
          날짜를 선택하면 그날 열린 모임을 볼 수 있어요.
        </p>
        <template v-else>
          <p class="mb-3 text-sm font-semibold text-[var(--ui-color-content)]">{{ selectedLabel }}</p>
          <p v-if="selectedMeetups.length === 0" class="text-[15px] text-[var(--ui-color-content-muted)]">
            이 날은 열린 모임이 없어요.
          </p>
          <ul v-else class="grid gap-1.5">
            <li
              v-for="meetup in selectedMeetups"
              :key="meetup.id"
              class="flex min-h-9 items-center gap-2 rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2"
            >
              <time
                class="w-12 shrink-0 text-[12px] font-bold text-[var(--ui-color-brand)]"
                :datetime="meetup.scheduledAt"
              >
                {{ formatTime(meetup.scheduledAt) }}
              </time>
              <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ui-color-content)]">
                {{ meetup.title }}
              </span>
              <div
                v-if="calendarAttendeeStack(meetup).shown.length || calendarAttendeeStack(meetup).overflow"
                class="flex shrink-0 -space-x-1"
              >
                <UserAvatar
                  v-for="attendee in calendarAttendeeStack(meetup).shown"
                  :key="attendee.id ?? attendee.name"
                  class="h-5 w-5 text-[9px] ring-2"
                  :class="attendee.isHost ? 'ring-[var(--ui-color-brand)]' : 'ring-white'"
                  :name="attendee.name"
                  :image-url="attendee.badgeUrl ?? ''"
                  :title="attendee.name"
                />
                <span
                  v-if="calendarAttendeeStack(meetup).overflow"
                  class="flex h-5 items-center justify-center rounded-full bg-white px-1.5 text-[9px] font-bold text-[var(--ui-color-content-muted)] ring-2 ring-white"
                >
                  +{{ calendarAttendeeStack(meetup).overflow }}
                </span>
              </div>
            </li>
          </ul>
        </template>
      </div>
    </section>

    <!-- 예정 모임 -->
    <section class="surface-card">
      <div class="mb-5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <CalendarDays :size="18" class="text-[var(--ui-color-brand)]" />
          <h3 class="text-lg font-semibold text-[var(--ui-color-content)]">예정 모임</h3>
          <span
            v-if="!loadingAny && !errorMessage"
            class="ml-1 rounded-lg bg-[var(--ui-color-surface-subtle)] px-2 py-0.5 text-sm font-semibold text-[var(--ui-color-content-muted)]"
          >
            {{ upcomingMeetups.length }}
          </span>
        </div>
        <RefreshSomoimButton @refreshed="loadSomoimEvents" />
      </div>

      <p v-if="actionError" class="mb-4 rounded-lg bg-[var(--ui-color-danger-surface)] px-4 py-3 text-sm font-semibold text-[var(--ui-color-destructive)]">
        {{ actionError }}
      </p>

      <!-- 스켈레톤 -->
      <ul v-if="loadingAny" class="divide-y divide-[var(--ui-color-stroke)]">
        <li
          v-for="n in 3"
          :key="n"
          class="flex animate-pulse flex-col gap-2.5 py-4 first:pt-0 last:pb-0"
        >
          <div class="h-5 w-3/4 rounded-md bg-[var(--ui-color-surface-subtle)]"></div>
          <div class="h-3 w-1/2 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded-full bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-3 w-2/3 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          </div>
          <div class="flex gap-2">
            <div class="h-7 w-20 rounded-full bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-7 w-16 rounded-full bg-[var(--ui-color-surface-subtle)]"></div>
          </div>
          <div class="mt-auto flex gap-2">
            <div class="h-9 w-24 rounded-lg bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-9 w-20 rounded-lg bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="ml-auto h-9 w-24 rounded-lg bg-[var(--ui-color-surface-subtle)]"></div>
          </div>
        </li>
      </ul>

      <p v-else-if="errorMessage" class="py-6 text-[15px] font-semibold text-[var(--ui-color-destructive)]">
        {{ errorMessage }}
      </p>
      <div v-else-if="upcomingMeetups.length === 0" class="py-8 text-center">
        <p class="text-[14px] text-[var(--ui-color-content)]">예정된 모임이 없어요.</p>
        <p class="mt-1 text-[13px] text-[var(--ui-color-content-muted)]">아래 ‘모임 만들기’로 새 모임을 열어 보세요.</p>
      </div>

      <template v-else>
        <ul class="divide-y divide-[var(--ui-color-stroke)]">
          <MeetupCard
            v-for="meetup in previewMeetups"
            :key="meetup.id"
            :meetup="meetup"
            :pending-id="pendingId"
            :show-readonly-dot="false"
            @toggle-join="toggleJoin"
            @retry-somoim="retrySomoim"
            @cancel="cancelMeetup"
          />
        </ul>

        <!-- 카드 안의 액션 아이콘(소모임 앱 열기 등)과 같은 크기·정렬로 맞춘다.
             목록 흐름을 끊지 않도록 전체 폭 버튼 대신 아이콘 하나만 둔다. -->
        <div class="mt-3 flex justify-end">
          <button
            class="focus-ring ui-radius-control ui-border inline-flex h-9 w-9 items-center justify-center border text-[var(--ui-color-content-muted)] transition hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
            type="button"
            aria-label="모임 전체 보기"
            title="모임 전체 보기"
            @click="goToFeature('meetups')"
          >
            <CalendarDays :size="16" />
          </button>
        </div>
      </template>
    </section>

    <!-- 모임 안내 (접기/펼치기) -->
    <!-- TODO(multi-group): 아래 시간/장소/타임라인은 현재 단일 모임
         (IT&AI 스터디) 전용으로 하드코딩됨. 여러 모임을 지원하게 되면
         모임 설정(meetup_config 등)에서 불러오도록 분리 필요. -->
    <section class="surface-card surface-card--flush">
      <button
        class="flex w-full items-center justify-between px-5 py-4 text-left transition"
        type="button"
        @click="infoOpen = !infoOpen"
      >
        <h3 class="text-[15px] font-bold text-[var(--ui-color-content)]">모임 안내</h3>
        <ChevronUp v-if="infoOpen" :size="18" class="shrink-0 text-[var(--ui-color-content-muted)]" />
        <ChevronDown v-else :size="18" class="shrink-0 text-[var(--ui-color-content-muted)]" />
      </button>
      <div
        class="overflow-hidden"
        :style="{ maxHeight: infoOpen ? '900px' : '0px', transition: 'max-height 0.3s ease-in-out' }"
      >
        <div class="grid gap-3.5 px-5 pb-5">
          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[var(--ui-color-content-muted)]">시간</p>
            <p class="text-[14px] text-[var(--ui-color-content)]">
              <span class="mr-1.5 rounded bg-[var(--ui-color-surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ui-color-content-muted)]">정기</span>매주 토요일 오전 10–12시
            </p>
            <p class="mt-0.5 text-[14px] text-[var(--ui-color-content)]">
              <span class="mr-1.5 rounded bg-[var(--ui-color-surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ui-color-content-muted)]">비정기</span>제한 없음
            </p>
          </div>

          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[var(--ui-color-content-muted)]">장소</p>
            <p class="text-[14px] text-[var(--ui-color-content)]">
              <span class="mr-1.5 rounded bg-[var(--ui-color-surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ui-color-content-muted)]">정기</span>홍대입구역·신촌역 인근 카페
            </p>
            <p class="mt-0.5 text-[14px] text-[var(--ui-color-content)]">
              <span class="mr-1.5 rounded bg-[var(--ui-color-surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ui-color-content-muted)]">비정기</span>제한 없음
            </p>
          </div>

          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[var(--ui-color-content-muted)]">준비물</p>
            <p class="text-[14px] text-[var(--ui-color-content)]">노트북 혹은 책</p>
          </div>

          <div class="border-t border-[var(--ui-color-stroke)]"></div>

          <div>
            <h4 class="mb-3 text-[13px] font-bold text-[var(--ui-color-content)]">정기 타임라인</h4>
            <ul class="space-y-2">
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[var(--ui-color-surface-subtle)] py-0.5 text-center text-[11px] font-bold text-[var(--ui-color-brand)]">10:00–10:15</span>
                <span class="text-[14px] text-[var(--ui-color-content)]">할 일 공유</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[var(--ui-color-surface-subtle)] py-0.5 text-center text-[11px] font-bold text-[var(--ui-color-brand)]">10:15–11:45</span>
                <span class="text-[14px] text-[var(--ui-color-content)]">작업에 몰두</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[var(--ui-color-surface-subtle)] py-0.5 text-center text-[11px] font-bold text-[var(--ui-color-brand)]">11:45–12:15</span>
                <span class="text-[14px] text-[var(--ui-color-content)]">결과 및 인사이트 공유</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[var(--ui-color-surface-subtle)] py-0.5 text-center text-[11px] font-bold text-[var(--ui-color-brand)]">12:15~</span>
                <span class="text-[14px] text-[var(--ui-color-content)]">희망 인원 점심</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
