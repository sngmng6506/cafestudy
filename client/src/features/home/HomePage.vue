<script setup>
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@lucide/vue';
import { useMeetups, formatDate, formatTime } from '../../shared/useMeetups.js';
import MeetupCard from '../../shared/MeetupCard.vue';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const { meetups, loading, pendingId, errorMessage, actionError, loadMeetups, toggleJoin, cancelMeetup } = useMeetups();

const viewMonth = ref(startOfMonth(new Date()));
const selectedDate = ref(null);
const infoOpen = ref(false);

const openMeetups = computed(() =>
  [...meetups.value]
    .filter((meetup) => meetup.state !== 'done')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
);

const meetupsByDay = computed(() => {
  const map = {};
  for (const meetup of meetups.value) {
    const key = dayKey(new Date(meetup.scheduledAt));
    (map[key] ??= []).push(meetup);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }
  return map;
});

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
const todayMeetupsCount = computed(() => meetupsByDay.value[dayKey(new Date())]?.length ?? 0);
const selectedLabel = computed(() =>
  selectedDate.value
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(
        selectedDate.value,
      )
    : '',
);

onMounted(() => {
  void loadMeetups();
});

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function cellClass(date) {
  if (isSelected(date)) return 'bg-[#03C75A] text-white';

  const classes = ['hover:bg-[#f5f6f7]'];
  if (!isCurrentMonth(date)) {
    classes.push('text-[#C4CAD2]');
  } else if (date.getDay() === 0) {
    classes.push('text-[#e74c3c]');
  } else if (date.getDay() === 6) {
    classes.push('text-[#0068c3]');
  } else {
    classes.push('text-[#333333]');
  }
  if (isToday(date)) classes.push('ring-1 ring-inset ring-[#03C75A]');
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
</script>

<template>
  <section class="grid gap-5">
    <!-- 헤더 -->
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">[홍대] it&ai 스터디</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">주말 아침 몰입할 수 있는 시간을 만들어요.</p>
    </div>

    <!-- 모임 캘린더 -->
    <section class="rounded-xl border border-[#dadce0] bg-white p-6 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-[#333333]">모임 캘린더</h3>
        <div class="flex items-center gap-1">
          <button
            class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
            type="button"
            aria-label="이전 달"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="18" />
          </button>
          <span class="min-w-[88px] text-center text-[15px] font-semibold text-[#333333]">{{ monthLabel }}</span>
          <button
            class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
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
          :class="index === 0 ? 'text-[#e74c3c]' : index === 6 ? 'text-[#0068c3]' : 'text-[#5f6368]'"
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
          @click="selectDay(date)"
        >
          {{ date.getDate() }}
          <span
            v-if="countOn(date)"
            class="mt-0.5 h-1.5 w-1.5 rounded-full"
            :class="isSelected(date) ? 'bg-white' : 'bg-[#03C75A]'"
          ></span>
        </button>
      </div>

      <div class="mt-5 border-t border-[#dadce0] pt-5">
        <p v-if="!selectedDate" class="text-[15px] text-[#5f6368]">
          날짜를 선택하면 그날 열린 모임을 볼 수 있어요.
        </p>
        <template v-else>
          <p class="mb-3 text-sm font-semibold text-[#333333]">{{ selectedLabel }}</p>
          <p v-if="selectedMeetups.length === 0" class="text-[15px] text-[#5f6368]">
            이 날은 열린 모임이 없어요.
          </p>
          <ul v-else class="grid gap-2">
            <MeetupCard
              v-for="meetup in selectedMeetups"
              :key="meetup.id"
              :meetup="meetup"
              :pending-id="pendingId"
              compact
              @toggle-join="toggleJoin"
              @cancel="cancelMeetup"
            />
          </ul>
        </template>
      </div>
    </section>

    <!-- 지금 열린 모임 -->
    <section class="rounded-xl border border-[#dadce0] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <CalendarDays :size="18" class="text-[#03C75A]" />
        <h3 class="text-lg font-semibold text-[#333333]">지금 열린 모임</h3>
        <span
          v-if="!loading && !errorMessage"
          class="ml-1 rounded-lg bg-[#f5f6f7] px-2 py-0.5 text-sm font-semibold text-[#5f6368]"
        >
          {{ openMeetups.length }}
        </span>
      </div>

      <p v-if="actionError" class="mb-4 rounded-lg bg-[#FFF1F2] px-4 py-3 text-sm font-semibold text-[#e74c3c]">
        {{ actionError }}
      </p>

      <!-- 스켈레톤 -->
      <ul v-if="loading" class="divide-y divide-[#dadce0]">
        <li
          v-for="n in 3"
          :key="n"
          class="flex animate-pulse flex-col gap-2.5 py-4 first:pt-0 last:pb-0"
        >
          <div class="h-5 w-3/4 rounded-md bg-[#f5f6f7]"></div>
          <div class="h-3 w-1/2 rounded bg-[#f5f6f7]"></div>
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded-full bg-[#f5f6f7]"></div>
            <div class="h-3 w-2/3 rounded bg-[#f5f6f7]"></div>
          </div>
          <div class="flex gap-2">
            <div class="h-7 w-20 rounded-full bg-[#f5f6f7]"></div>
            <div class="h-7 w-16 rounded-full bg-[#f5f6f7]"></div>
          </div>
          <div class="mt-auto flex gap-2">
            <div class="h-9 w-24 rounded-lg bg-[#f5f6f7]"></div>
            <div class="h-9 w-20 rounded-lg bg-[#f5f6f7]"></div>
            <div class="ml-auto h-9 w-24 rounded-lg bg-[#f5f6f7]"></div>
          </div>
        </li>
      </ul>

      <p v-else-if="errorMessage" class="py-6 text-[15px] font-semibold text-[#e74c3c]">
        {{ errorMessage }}
      </p>
      <div v-else-if="openMeetups.length === 0" class="py-12 text-center">
        <p class="text-[14px] text-[#333333]">열린 모임이 없습니다.</p>
        <p class="mt-1 text-[13px] text-[#5f6368]">새 모임을 개설해 보세요.</p>
      </div>

      <ul v-else class="divide-y divide-[#dadce0]">
        <MeetupCard
          v-for="meetup in openMeetups"
          :key="meetup.id"
          :meetup="meetup"
          :pending-id="pendingId"
          @toggle-join="toggleJoin"
          @cancel="cancelMeetup"
        />
      </ul>
    </section>

    <!-- 오늘 열린 모임 배너 -->
    <div class="flex items-center gap-2.5 rounded-xl bg-[#f5f6f7] px-4 py-3.5">
      <CalendarDays :size="18" class="text-[#03C75A]" />
      <p class="text-[14px] font-medium text-[#333333]">
        오늘 열린 모임
        <span class="ml-0.5 font-bold text-[#03C75A]">{{ todayMeetupsCount }}개</span>
      </p>
    </div>

    <!-- 모임 안내 (접기/펼치기) -->
    <section class="rounded-xl border border-[#dadce0] bg-white shadow-sm">
      <button
        class="flex w-full items-center justify-between px-5 py-4 text-left transition"
        type="button"
        @click="infoOpen = !infoOpen"
      >
        <h3 class="text-[15px] font-bold text-[#333333]">모임 안내</h3>
        <ChevronUp v-if="infoOpen" :size="18" class="shrink-0 text-[#5f6368]" />
        <ChevronDown v-else :size="18" class="shrink-0 text-[#5f6368]" />
      </button>
      <div
        class="overflow-hidden"
        :style="{ maxHeight: infoOpen ? '1200px' : '0px', transition: 'max-height 0.3s ease-in-out' }"
      >
        <div class="grid gap-3.5 px-5 pb-5">
          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[#5f6368]">시간</p>
            <p class="text-[14px] text-[#333333]">
              <span class="mr-1.5 rounded bg-[#f5f6f7] px-1.5 py-0.5 text-[11px] font-semibold text-[#5f6368]">정기</span>매주 토요일 오전 10–12시
            </p>
            <p class="mt-0.5 text-[14px] text-[#333333]">
              <span class="mr-1.5 rounded bg-[#f5f6f7] px-1.5 py-0.5 text-[11px] font-semibold text-[#5f6368]">비정기</span>제한 없음
            </p>
          </div>

          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[#5f6368]">장소</p>
            <p class="text-[14px] text-[#333333]">
              <span class="mr-1.5 rounded bg-[#f5f6f7] px-1.5 py-0.5 text-[11px] font-semibold text-[#5f6368]">정기</span>홍대입구역·신촌역 인근 카페
            </p>
            <p class="mt-0.5 text-[14px] text-[#333333]">
              <span class="mr-1.5 rounded bg-[#f5f6f7] px-1.5 py-0.5 text-[11px] font-semibold text-[#5f6368]">비정기</span>제한 없음
            </p>
          </div>

          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[#5f6368]">준비물</p>
            <p class="text-[14px] text-[#333333]">노트북 혹은 책</p>
          </div>

          <p class="rounded-lg bg-[#f5f6f7] px-3 py-2.5 text-[13px] leading-snug text-[#03C75A]">
            정기모임 5회 이상 참여 시 비정기 모임을 자유롭게 개설할 수 있는 운영진 권한을 드려요.
          </p>

          <div class="border-t border-[#dadce0]"></div>

          <div>
            <h4 class="mb-3 text-[13px] font-bold text-[#333333]">정기 타임라인</h4>
            <ul class="space-y-2">
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[#f5f6f7] py-0.5 text-center text-[11px] font-bold text-[#03C75A]">10:00–10:15</span>
                <span class="text-[14px] text-[#333333]">할 일 공유</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[#f5f6f7] py-0.5 text-center text-[11px] font-bold text-[#03C75A]">10:15–11:45</span>
                <span class="text-[14px] text-[#333333]">작업에 몰두</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[#f5f6f7] py-0.5 text-center text-[11px] font-bold text-[#03C75A]">11:45–12:15</span>
                <span class="text-[14px] text-[#333333]">결과 및 인사이트 공유</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="w-[92px] shrink-0 rounded-md bg-[#f5f6f7] py-0.5 text-center text-[11px] font-bold text-[#03C75A]">12:15~</span>
                <span class="text-[14px] text-[#333333]">희망 인원 점심</span>
              </li>
            </ul>
            <p class="mt-3 text-[13px] text-[#5f6368]">10:15 이후에 오셔도 괜찮아요. 11:45 공유 시간에 함께 참여해 주세요.</p>
          </div>

          <div class="border-t border-[#dadce0]"></div>

          <div>
            <p class="mb-0.5 text-[12px] font-semibold text-[#5f6368]">모임장 소개</p>
            <p class="mt-0.5 text-[14px] leading-relaxed text-[#333333]">
              제조업에서 AI 개발자로 일하고 있어요. 주말 아침이 사라져서 모임을 만들었습니다. 같이 작업하고 이야기해요.
            </p>
          </div>
          <p class="text-[13px] text-[#5f6368]">증원 신청 및 문의·건의는 메시지 주세요.</p>
          <p class="text-[13px] text-[#5f6368]">웹에 추가하고 싶은 기능 있으시면 언제든 말씀해주세요.</p>
        </div>
      </div>
    </section>
  </section>
</template>
