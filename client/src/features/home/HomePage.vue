<script setup>
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin } from '@lucide/vue';
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
const todayMeetupsCount = computed(() => meetupsByDay.value[dayKey(new Date())]?.length ?? 0);
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

async function cancelMeetup(meetup) {
  if (!window.confirm('이 모임을 취소할까요? 목록과 캘린더에서 사라집니다.')) return;

  pendingId.value = meetup.id;
  actionError.value = '';

  try {
    await apiFetch(`/api/meetups/${meetup.id}`, { method: 'DELETE' });
    meetups.value = meetups.value.filter((m) => m.id !== meetup.id);
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

function naverMapUrl(meetup) {
  return `https://map.naver.com/p/search/${encodeURIComponent(meetup.location)}`;
}

function googleMapUrl(meetup) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetup.location)}`;
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1">
      <h1 class="text-[22px] font-bold leading-snug text-[#191F28]">[홍대] it&ai 스터디</h1>
      <p class="mt-1 text-[14px] text-[#8B95A1]">주말 아침 몰입할 수 있는 시간을 만들어요.</p>
    </div>

    <section class="rounded-xl border border-[#E5E8EB] bg-white p-5 shadow-sm">
      <h3 class="mb-4 text-[15px] font-bold text-[#191F28]">모임 안내</h3>

      <div class="grid gap-3.5">
        <div>
          <p class="mb-0.5 text-[12px] font-semibold text-[#8B95A1]">시간</p>
          <p class="text-[14px] text-[#191F28]">
            <span class="mr-1.5 rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-semibold text-[#8B95A1]">정기</span>매주 토요일 오전 10–12시
          </p>
          <p class="mt-0.5 text-[14px] text-[#191F28]">
            <span class="mr-1.5 rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-semibold text-[#8B95A1]">비정기</span>제한 없음
          </p>
        </div>

        <div>
          <p class="mb-0.5 text-[12px] font-semibold text-[#8B95A1]">장소</p>
          <p class="text-[14px] text-[#191F28]">
            <span class="mr-1.5 rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-semibold text-[#8B95A1]">정기</span>홍대입구역·신촌역 인근 카페
          </p>
          <p class="mt-0.5 text-[14px] text-[#191F28]">
            <span class="mr-1.5 rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-semibold text-[#8B95A1]">비정기</span>제한 없음
          </p>
        </div>

        <div>
          <p class="mb-0.5 text-[12px] font-semibold text-[#8B95A1]">준비물</p>
          <p class="text-[14px] text-[#191F28]">노트북 혹은 책</p>
        </div>
      </div>

      <p class="mt-4 rounded-lg bg-[#F1F8F4] px-3 py-2.5 text-[13px] leading-snug text-[#16A34A]">
        정기모임 5회 이상 참여 시 비정기 모임을 자유롭게 개설할 수 있는 운영진 권한을 드려요.
      </p>

      <div class="my-4 border-t border-[#E5E8EB]" />

      <h4 class="mb-3 text-[13px] font-bold text-[#191F28]">정기 타임라인</h4>
      <ul class="space-y-2">
        <li class="flex items-center gap-3">
          <span class="w-[92px] shrink-0 rounded-md bg-[#F1F8F4] py-0.5 text-center text-[11px] font-bold text-[#16A34A]">10:00–10:15</span>
          <span class="text-[14px] text-[#191F28]">할 일 공유</span>
        </li>
        <li class="flex items-center gap-3">
          <span class="w-[92px] shrink-0 rounded-md bg-[#F1F8F4] py-0.5 text-center text-[11px] font-bold text-[#16A34A]">10:15–11:45</span>
          <span class="text-[14px] text-[#191F28]">작업에 몰두</span>
        </li>
        <li class="flex items-center gap-3">
          <span class="w-[92px] shrink-0 rounded-md bg-[#F1F8F4] py-0.5 text-center text-[11px] font-bold text-[#16A34A]">11:45–12:15</span>
          <span class="text-[14px] text-[#191F28]">결과 및 인사이트 공유</span>
        </li>
        <li class="flex items-center gap-3">
          <span class="w-[92px] shrink-0 rounded-md bg-[#F1F8F4] py-0.5 text-center text-[11px] font-bold text-[#16A34A]">12:15~</span>
          <span class="text-[14px] text-[#191F28]">희망 인원 점심</span>
        </li>
      </ul>
      <p class="mt-3 text-[13px] text-[#8B95A1]">10:15 이후에 오셔도 괜찮아요. 11:45 공유 시간에 함께 참여해 주세요.</p>

      <div class="my-4 border-t border-[#E5E8EB]" />

      <div>
        <p class="mb-0.5 text-[12px] font-semibold text-[#8B95A1]">모임장 소개</p>
        <p class="mt-0.5 text-[14px] leading-relaxed text-[#191F28]">
          제조업에서 AI 개발자로 일하고 있어요. 주말 아침이 사라져서 모임을 만들었습니다. 같이 작업하고 이야기해요.
        </p>
      </div>
      <p class="mt-3 text-[13px] text-[#8B95A1]">증원 신청 및 문의·건의는 메시지 주세요.</p>
      <p class="mt-3 text-[13px] text-[#8B95A1]">웹에 추가하고 싶은 기능 있으시면 언제든 말씀해주세요.</p>
    </section>

    <div class="flex items-center gap-2.5 rounded-xl bg-[#F1F8F4] px-4 py-3.5">
      <CalendarDays :size="18" class="text-[#16A34A]" />
      <p class="text-[14px] font-medium text-[#191F28]">
        오늘 열린 모임
        <span class="ml-0.5 font-bold text-[#16A34A]">{{ todayMeetupsCount }}개</span>
      </p>
    </div>

    <p v-if="actionError" class="rounded-lg bg-[#FFF1F2] px-4 py-3 text-sm font-semibold text-[#F04452]">
      {{ actionError }}
    </p>

    <section class="rounded-xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
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
      <div v-else-if="openMeetups.length === 0" class="py-12 text-center">
        <p class="text-[14px] text-[#191F28]">열린 모임이 없습니다.</p>
        <p class="mt-1 text-[13px] text-[#8B95A1]">새 모임을 개설해 보세요.</p>
      </div>

      <ul v-else class="divide-y divide-[#E5E8EB]">
        <li v-for="meetup in openMeetups" :key="meetup.id" class="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
          <h4 class="text-[17px] font-bold text-[#191F28]">{{ meetup.title }}</h4>
          <p class="text-[12px] text-[#8B95A1]">
            <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
          </p>
          <div class="flex items-center gap-1.5">
            <MapPin :size="13" class="shrink-0 text-[#8B95A1]" />
            <span class="text-[13px] text-[#8B95A1]">{{ meetup.location }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-flex h-7 items-center rounded-full bg-[#F1F3F5] px-3 text-[12px] font-medium text-[#8B95A1]">
              {{ meetup.participantCount }}/{{ meetup.capacity }}명
            </span>
            <span
              class="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold"
              :class="meetup.participantCount >= meetup.capacity ? 'bg-[#F1F3F5] text-[#8B95A1]' : 'bg-[#DCFCE7] text-[#16A34A]'"
            >
              {{ meetup.participantCount >= meetup.capacity ? '마감' : '모집중' }}
            </span>
          </div>
          <div class="mt-auto flex flex-wrap items-center gap-2">
            <a class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]" :href="naverMapUrl(meetup)" target="_blank" rel="noreferrer">
              네이버지도
              <ExternalLink :size="14" />
            </a>
            <a class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]" :href="googleMapUrl(meetup)" target="_blank" rel="noreferrer">
              구글맵
              <ExternalLink :size="14" />
            </a>
            <div class="ml-auto flex items-center gap-2">
              <div v-if="meetup.isHost" class="flex items-center gap-2">
                <span class="text-sm font-semibold text-[#8B95A1]">개설자</span>
                <button
                  class="h-9 shrink-0 rounded-lg border border-[#F04452] px-3 text-sm font-semibold text-[#F04452] transition hover:bg-[#FFF1F2] disabled:opacity-50"
                  type="button"
                  :disabled="pendingId === meetup.id"
                  @click="cancelMeetup(meetup)"
                >
                  모임 취소
                </button>
              </div>
              <button
                v-else-if="meetup.joined"
                class="h-9 shrink-0 rounded-lg border border-[#E5E8EB] px-4 text-sm font-semibold text-[#191F28] transition hover:bg-[#F9FAFB] disabled:opacity-50"
                type="button"
                :disabled="pendingId === meetup.id"
                @click="toggleJoin(meetup)"
              >
                참여 취소
              </button>
              <button
                v-else
                class="h-9 shrink-0 rounded-lg bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                type="button"
                :disabled="pendingId === meetup.id || meetup.participantCount >= meetup.capacity"
                @click="toggleJoin(meetup)"
              >
                {{ meetup.participantCount >= meetup.capacity ? '마감' : '참여하기' }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section class="rounded-xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-[#191F28]">모임 캘린더</h3>
        <div class="flex items-center gap-1">
          <button
            class="flex h-9 w-9 items-center justify-center rounded-lg text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
            type="button"
            aria-label="이전 달"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="18" />
          </button>
          <span class="min-w-[88px] text-center text-[15px] font-semibold text-[#191F28]">{{ monthLabel }}</span>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-lg text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
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
              class="grid gap-2 rounded-lg border border-[#E5E8EB] bg-[#F9FAFB] p-3"
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
                <div v-if="meetup.isHost" class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-[#8B95A1]">개설자</span>
                  <button
                    class="h-9 shrink-0 rounded-lg border border-[#F04452] bg-white px-3 text-sm font-semibold text-[#F04452] transition hover:bg-[#FFF1F2] disabled:opacity-50"
                    type="button"
                    :disabled="pendingId === meetup.id"
                    @click="cancelMeetup(meetup)"
                  >
                    모임 취소
                  </button>
                </div>
                <button
                  v-else-if="meetup.joined"
                  class="h-9 shrink-0 rounded-lg border border-[#E5E8EB] bg-white px-4 text-sm font-semibold text-[#191F28] transition hover:bg-[#F9FAFB] disabled:opacity-50"
                  type="button"
                  :disabled="pendingId === meetup.id"
                  @click="toggleJoin(meetup)"
                >
                  참여 취소
                </button>
                <button
                  v-else
                  class="h-9 shrink-0 rounded-lg bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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
