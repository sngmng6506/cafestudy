<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { CalendarDays, ExternalLink, MapPin, Plus } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const meetups = ref([]);
const loading = ref(true);
const status = reactive({ type: 'idle', message: '' });
const form = reactive({
  title: '',
  description: '',
  location: '',
  scheduledAt: getDefaultScheduledAt(),
  capacity: 6,
});

// Only upcoming meetups are listed here; past ones become "완료" and live in the home calendar.
const sortedMeetups = computed(() => {
  return [...meetups.value]
    .filter((meetup) => meetup.state !== 'done')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
});

// Meetups can only be created at least 30 minutes from now.
const minScheduledAt = computed(() => toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));

onMounted(() => {
  void loadMeetups();
});

async function loadMeetups() {
  loading.value = true;
  setStatus('idle', '');

  try {
    const body = await apiFetch('/api/meetups');
    meetups.value = body.data;
  } catch (error) {
    setStatus('error', error.message);
  } finally {
    loading.value = false;
  }
}

async function createMeetup() {
  setStatus('idle', '');

  const scheduled = new Date(form.scheduledAt);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + 30 * 60 * 1000) {
    setStatus('error', '모임은 지금부터 30분 이후 시간으로만 개설할 수 있습니다.');
    return;
  }

  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    setStatus('error', '최대 참가 인원은 1~100 사이로 입력해주세요.');
    return;
  }

  try {
    const body = await apiFetch('/api/meetups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim(),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        capacity: Number(form.capacity),
      }),
    });

    meetups.value = [body.data, ...meetups.value];
    form.title = '';
    form.description = '';
    form.location = '';
    form.scheduledAt = getDefaultScheduledAt();
    form.capacity = 6;
    setStatus('success', '모임이 생성되었습니다.');
  } catch (error) {
    setStatus('error', error.message);
  }
}

function setStatus(type, message) {
  status.type = type;
  status.message = message;
}

function getDefaultScheduledAt() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return toLocalInputValue(date);
}

function toLocalInputValue(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function naverMapUrl(meetup) {
  return `https://map.naver.com/p/search/${encodeURIComponent(mapQuery(meetup))}`;
}

function googleMapUrl(meetup) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(meetup))}`;
}

function mapQuery(meetup) {
  return meetup.location;
}
</script>

<template>
  <section class="grid gap-5">
    <form class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm" @submit.prevent="createMeetup">
      <div class="mb-5 flex items-center gap-2">
        <Plus :size="18" class="text-[#16A34A]" />
        <h2 class="text-lg font-semibold text-[#191F28]">모임 개설</h2>
      </div>

      <label class="mb-4 grid gap-2 text-sm font-semibold text-[#191F28]">
        제목
        <input
          v-model="form.title"
          class="h-12 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium outline-none transition placeholder:text-[#8B95A1] focus:border-[#16A34A]"
          placeholder="예: 토요일 AI 논문 읽기"
          required
        />
      </label>

      <label class="mb-4 grid gap-2 text-sm font-semibold text-[#191F28]">
        내용
        <textarea
          v-model="form.description"
          class="min-h-[88px] rounded-xl border border-[#E5E8EB] px-4 py-3 text-[15px] font-medium leading-7 outline-none transition placeholder:text-[#8B95A1] focus:border-[#16A34A]"
          placeholder="호스트가 무엇을 할지 간단히 적어주세요 (예: 알고리즘 문제 풀이, 토익 단어 암기)"
          rows="3"
        ></textarea>
      </label>

      <label class="mb-4 grid gap-2 text-sm font-semibold text-[#191F28]">
        위치
        <input
          v-model="form.location"
          class="h-12 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium outline-none transition placeholder:text-[#8B95A1] focus:border-[#16A34A]"
          placeholder="예: 강남역 11번 출구"
          required
        />
      </label>

      <label class="mb-4 grid gap-2 text-sm font-semibold text-[#191F28]">
        일정
        <input
          v-model="form.scheduledAt"
          class="h-12 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium outline-none transition focus:border-[#16A34A]"
          type="datetime-local"
          :min="minScheduledAt"
          required
        />
      </label>

      <label class="mb-5 grid gap-2 text-sm font-semibold text-[#191F28]">
        최대 참가 인원
        <input
          v-model.number="form.capacity"
          class="h-12 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium outline-none transition placeholder:text-[#8B95A1] focus:border-[#16A34A]"
          type="number"
          min="1"
          max="100"
          required
        />
        <span class="text-xs font-medium text-[#8B95A1]">개설자(나) 포함 인원입니다.</span>
      </label>

      <button class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-[15px] font-semibold text-white transition hover:opacity-90" type="submit">
        <Plus :size="17" />
        개설
      </button>

      <p v-if="status.message" class="mt-4 text-sm font-semibold" :class="status.type === 'error' ? 'text-[#F04452]' : 'text-[#16A34A]'">
        {{ status.message }}
      </p>
    </form>

    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <CalendarDays :size="18" class="text-[#16A34A]" />
        <h2 class="text-lg font-semibold text-[#191F28]">공개 모임</h2>
      </div>

      <p v-if="loading" class="py-6 text-[15px] text-[#8B95A1]">불러오는 중입니다.</p>
      <p v-else-if="sortedMeetups.length === 0" class="py-6 text-[15px] text-[#8B95A1]">
        아직 개설된 모임이 없습니다.
      </p>
      <div v-else class="divide-y divide-[#E5E8EB]">
        <article v-for="meetup in sortedMeetups" :key="meetup.id" class="grid gap-3 py-5 first:pt-0 last:pb-0">
          <div>
            <h3 class="text-base font-semibold text-[#191F28]">{{ meetup.title }}</h3>
            <p v-if="meetup.description" class="mt-1 whitespace-pre-line text-[15px] font-medium text-[#8B95A1]">{{ meetup.description }}</p>
          </div>
          <div class="flex items-center gap-2 text-sm font-medium text-[#8B95A1]">
            <MapPin :size="15" />
            <span>{{ meetup.location }}</span>
          </div>
          <div class="flex items-center gap-2 text-sm font-medium text-[#8B95A1]">
            <CalendarDays :size="15" />
            <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
          </div>
          <div class="flex flex-wrap gap-2">
            <a class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]" :href="naverMapUrl(meetup)" target="_blank" rel="noreferrer">
              네이버지도
              <ExternalLink :size="14" />
            </a>
            <a class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]" :href="googleMapUrl(meetup)" target="_blank" rel="noreferrer">
              구글맵
              <ExternalLink :size="14" />
            </a>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
