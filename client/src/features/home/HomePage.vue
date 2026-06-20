<script setup>
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const meetups = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const actionError = ref('');
const pendingId = ref('');

const viewMonth = ref(startOfMonth(new Date()));
const selectedDate = ref(null);

// Upcoming only for the list; the calendar below keeps past ("완료") meetups as a record.
const openMeetups = computed(() =>
  [...meetups.value]
    .filter((meetup) => meetup.state !== 'done')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
);

// Group all meetups by local calendar day (YYYY-MM-DD).
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
const selectedLabel = computed(() =>
  selectedDate.value
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(selectedDate.value)
    : '',
);

onMounted(() => {
  void loadMeetups();
});

async function loadMeetups() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const body = await apiFetch('/api/meetups');
    meetups.value = body.data;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function toggleJoin(meetup) {
  pendingId.value = meetup.id;
  actionError.value = '';

  try {
    const body = await apiFetch(`/api/meetups/${meetup.id}/join`, {
      method: meetup.joined ? 'DELETE' : 'POST',
    });
    const target = meetups.value.find((m) => m.id === meetup.id);
    if (target) {
      target.joined = body.data.joined;
      target.participantCount = body.data.participantCount;
    }
  } catch (error) {
    actionError.value = error.message;
  } finally {
    pendingId.value = '';
  }
}

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
  if (isSelected(date)) return 'bg-[#16A34A] text-white';

  const classes = ['hover:bg-[#F9FAFB]'];
  if (!isCurrentMonth(date)) {
    classes.push('text-[#C4CAD2]');
  } else if (date.getDay() === 0) {
    classes.push('text-[#F04452]');
  } else if (date.getDay() === 6) {
    classes.push('text-[#1B64DA]');
  } else {
    classes.push('text-[#191F28]');
  }
  if (isToday(date)) classes.push('ring-1 ring-inset ring-[#16A34A]');
  return classes.join(' ');
}

function selectDay(date) {
  selectedDate.value = new Date(date);
  if (!isCurrentMonth(date)) viewMonth.value = startOfMonth(date);
}

function shiftMonth(delta) {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + delta, 1);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short' }).format(new Date(value));
}
</script>

<template>
  <section class="grid gap-5">
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-7 shadow-sm">
      <p class="mb-3 text-sm font-medium text-[#8B95A1]">카공 일정 공유</p>
      <h2 class="text-2xl font-bold leading-tight text-[#191F28]">
        카공 일정을 알려주세요.
      </h2>
      <p class="mt-3 text-[15px] font-normal leading-7 text-[#8B95A1]">
        혼자 카공도 괜찮고, 함께해도 괜찮아요.
      </p>

      <h2 class="mt-6 text-2xl font-bold leading-tight text-[#191F28]">
        기능 추가를 해주세요.
      </h2>
      <p class="mt-3 text-[15px] font-normal leading-7 text-[#8B95A1]">
        같이 만들어가고 싶으면 언제든 메시지 주세요.
      </p>
    </section>

    <p v-if="actionError" class="rounded-xl bg-[#FFF1F2] px-4 py-3 text-sm font-semibold text-[#F04452]">
      {{ actionError }}
    </p>

    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <CalendarDays :size="18" class="text-[#16A34A]" />
        <h3 class="text-lg font-semibold text-[#191F28]">지금 열린 모임</h3>
        <span
          v-if="!loading && !errorMessage"
          class="ml-1 rounded-lg bg-[#F9FAFB] px-2 py-0.5 text-sm font-semibold text-[#8B95A1]"
        >
          {{ openMeetups.length }}
        </span>
      </div>

      <p v-if="loading" class="py-6 text-[15px] text-[#8B95A1]">불러오는 중입니다.</p>
      <p v-else-if="errorMessage" class="py-6 text-[15px] font-semibold text-[#F04452]">
        {{ errorMessage }}
      </p>
      <p v-else-if="openMeetups.length === 0" class="py-6 text-[15px] text-[#8B95A1]">
        지금 열린 모임이 없어요. 모임 탭에서 가장 먼저 개설해보세요.
      </p>

      <ul v-else class="divide-y divide-[#E5E8EB]">
        <li v-for="meetup in openMeetups" :key="meetup.id" class="grid gap-2.5 py-4 first:pt-0 last:pb-0">
          <div>
            <h4 class="text-base font-semibold text-[#191F28]">{{ meetup.title }}</h4>
            <p v-if="meetup.description" class="mt-1 whitespace-pre-line text-[15px] font-medium text-[#8B95A1]">{{ meetup.description }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-[#8B95A1]">
            <span class="flex items-center gap-1.5">
              <CalendarDays :size="15" />
              <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
            </span>
            <span class="flex items-center gap-1.5">
              <MapPin :size="15" />
              {{ meetup.location }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium text-[#8B95A1]">참여 {{ meetup.participantCount }}/{{ meetup.capacity }}명</span>
            <span
              v-if="meetup.isHost"
              class="rounded-xl bg-[#F9FAFB] px-3 py-1.5 text-sm font-semibold text-[#8B95A1]"
            >
              개설자
            </span>
            <button
              v-else-if="meetup.joined"
              class="h-9 shrink-0 rounded-xl border border-[#E5E8EB] px-4 text-sm font-semibold text-[#191F28] transition hover:bg-[#F9FAFB] disabled:opacity-50"
              type="button"
              :disabled="pendingId === meetup.id"
              @click="toggleJoin(meetup)"
            >
              참여 취소
            </button>
            <button
              v-else
              class="h-9 shrink-0 rounded-xl bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              type="button"
              :disabled="pendingId === meetup.id || meetup.participantCount >= meetup.capacity"
              @click="toggleJoin(meetup)"
            >
              {{ meetup.participantCount >= meetup.capacity ? '마감' : '참여하기' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-[#191F28]">모임 캘린더</h3>
        <div class="flex items-center gap-1">
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
            type="button"
            aria-label="이전 달"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="18" />
          </button>
          <span class="min-w-[88px] text-center text-[15px] font-semibold text-[#191F28]">{{ monthLabel }}</span>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
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
          :class="index === 0 ? 'text-[#F04452]' : index === 6 ? 'text-[#1B64DA]' : 'text-[#8B95A1]'"
        >
          {{ label }}
        </span>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="date in calendarDays"
          :key="date.toISOString()"
          type="button"
          class="relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition"
          :class="cellClass(date)"
          @click="selectDay(date)"
        >
          {{ date.getDate() }}
          <span
            v-if="countOn(date)"
            class="mt-0.5 h-1.5 w-1.5 rounded-full"
            :class="isSelected(date) ? 'bg-white' : 'bg-[#16A34A]'"
          ></span>
        </button>
      </div>

      <div class="mt-5 border-t border-[#E5E8EB] pt-5">
        <p v-if="!selectedDate" class="text-[15px] text-[#8B95A1]">
          날짜를 선택하면 그날 열린 모임을 볼 수 있어요.
        </p>
        <template v-else>
          <p class="mb-3 text-sm font-semibold text-[#191F28]">{{ selectedLabel }}</p>
          <p v-if="selectedMeetups.length === 0" class="text-[15px] text-[#8B95A1]">
            이 날은 열린 모임이 없어요.
          </p>
          <ul v-else class="grid gap-2">
            <li
              v-for="meetup in selectedMeetups"
              :key="meetup.id"
              class="grid gap-2 rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-3"
            >
              <div>
                <p class="flex items-center gap-2 text-[15px] font-semibold text-[#191F28]">
                  {{ meetup.title }}
                  <span
                    v-if="meetup.state === 'done'"
                    class="rounded bg-[#F1F3F5] px-1.5 py-0.5 text-xs font-semibold text-[#8B95A1]"
                  >
                    완료
                  </span>
                </p>
                <p class="mt-1 text-sm font-medium text-[#8B95A1]">{{ formatTime(meetup.scheduledAt) }}</p>
                <p v-if="meetup.description" class="mt-0.5 whitespace-pre-line text-sm font-medium text-[#8B95A1]">
                  {{ meetup.description }}
                </p>
              </div>
              <div v-if="meetup.state !== 'done'" class="flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-[#8B95A1]">참여 {{ meetup.participantCount }}/{{ meetup.capacity }}명</span>
                <span
                  v-if="meetup.isHost"
                  class="rounded-xl border border-[#E5E8EB] bg-white px-3 py-1.5 text-sm font-semibold text-[#8B95A1]"
                >
                  개설자
                </span>
                <button
                  v-else-if="meetup.joined"
                  class="h-9 shrink-0 rounded-xl border border-[#E5E8EB] bg-white px-4 text-sm font-semibold text-[#191F28] transition hover:bg-[#F9FAFB] disabled:opacity-50"
                  type="button"
                  :disabled="pendingId === meetup.id"
                  @click="toggleJoin(meetup)"
                >
                  참여 취소
                </button>
                <button
                  v-else
                  class="h-9 shrink-0 rounded-xl bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  type="button"
                  :disabled="pendingId === meetup.id || meetup.participantCount >= meetup.capacity"
                  @click="toggleJoin(meetup)"
                >
                  {{ meetup.participantCount >= meetup.capacity ? '마감' : '참여하기' }}
                </button>
              </div>
            </li>
          </ul>
        </template>
      </div>
    </section>
  </section>
</template>
