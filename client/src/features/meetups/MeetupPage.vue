<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { CalendarDays, ExternalLink, MapPin, Plus, RefreshCw } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

const meetups = ref([]);
const loading = ref(true);
const status = reactive({ type: 'idle', message: '' });
const form = reactive({
  title: '',
  cafeName: '',
  location: '',
  scheduledAt: getDefaultScheduledAt(),
});

const sortedMeetups = computed(() => {
  return [...meetups.value].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
});

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

  try {
    const body = await apiFetch('/api/meetups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': DEMO_USER_ID,
      },
      body: JSON.stringify({
        title: form.title.trim(),
        cafeName: form.cafeName.trim(),
        location: form.location.trim(),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      }),
    });

    meetups.value = [body.data, ...meetups.value];
    form.title = '';
    form.cafeName = '';
    form.location = '';
    form.scheduledAt = getDefaultScheduledAt();
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
  return `${meetup.cafeName} ${meetup.location}`.trim();
}
</script>

<template>
  <section class="workspace">
    <form class="panel create-panel" @submit.prevent="createMeetup">
      <div class="panel-heading">
        <Plus :size="18" />
        <h2>모임 개설</h2>
      </div>

      <label>
        제목
        <input v-model="form.title" placeholder="예: 토요일 AI 논문 읽기" required />
      </label>

      <label>
        카페명
        <input v-model="form.cafeName" placeholder="예: 강남 커피랩" required />
      </label>

      <label>
        위치
        <input v-model="form.location" placeholder="예: 강남역 11번 출구" required />
      </label>

      <label>
        일정
        <input v-model="form.scheduledAt" type="datetime-local" required />
      </label>

      <button class="primary-button" type="submit">
        <Plus :size="17" />
        개설
      </button>

      <p v-if="status.message" class="status" :class="status.type">
        {{ status.message }}
      </p>
    </form>

    <section class="panel list-panel">
      <div class="panel-heading split">
        <div class="heading-title">
          <CalendarDays :size="18" />
          <h2>공개 모임</h2>
        </div>
        <button class="icon-button compact" type="button" aria-label="새로고침" @click="loadMeetups">
          <RefreshCw :size="17" />
        </button>
      </div>

      <p v-if="loading" class="empty">불러오는 중입니다.</p>
      <p v-else-if="sortedMeetups.length === 0" class="empty">
        아직 개설된 모임이 없습니다.
      </p>
      <div v-else class="meetup-list">
        <article v-for="meetup in sortedMeetups" :key="meetup.id" class="meetup-card">
          <div>
            <h3>{{ meetup.title }}</h3>
            <p class="cafe">{{ meetup.cafeName }}</p>
          </div>
          <div class="meta-row">
            <MapPin :size="15" />
            <span>{{ meetup.location }}</span>
          </div>
          <div class="meta-row">
            <CalendarDays :size="15" />
            <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
          </div>
          <div class="map-actions">
            <a :href="naverMapUrl(meetup)" target="_blank" rel="noreferrer">
              네이버지도
              <ExternalLink :size="14" />
            </a>
            <a :href="googleMapUrl(meetup)" target="_blank" rel="noreferrer">
              구글맵
              <ExternalLink :size="14" />
            </a>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
