<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Plus, Search, X } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const status = reactive({ type: 'idle', message: '' });
const form = reactive({
  title: '',
  description: '',
  location: '',
  lat: null,
  lng: null,
  scheduledAt: getDefaultScheduledAt(),
  capacity: 6,
});

// Meetups can only be created at least 30 minutes from now.
const minScheduledAt = computed(() => toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));

// --- Place search (NAVER, proxied via backend) ---
const showSearch = ref(false);
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const searchError = ref('');

function openPlaceSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  searchError.value = '';
  showSearch.value = true;
}

async function runPlaceSearch() {
  const query = searchQuery.value.trim();
  if (!query) return;

  searching.value = true;
  searchError.value = '';

  try {
    const body = await apiFetch(`/api/places/search?q=${encodeURIComponent(query)}`);
    searchResults.value = body.data;
  } catch (error) {
    searchError.value = error.message;
  } finally {
    searching.value = false;
  }
}

function selectPlace(place) {
  form.location = place.roadAddress ? `${place.placeName} (${place.roadAddress})` : place.placeName;
  form.lat = place.lat ?? null;
  form.lng = place.lng ?? null;
  showSearch.value = false;
}

// --- Map preview (Leaflet, lazy-loaded) ---
const mapEl = ref(null);
let leaflet = null;
let map = null;
let marker = null;

async function ensureLeaflet() {
  if (!leaflet) {
    const mod = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    leaflet = mod.default;
  }
  return leaflet;
}

async function renderMap() {
  if (form.lat == null || form.lng == null) {
    if (map) {
      map.remove();
      map = null;
      marker = null;
    }
    return;
  }

  const L = await ensureLeaflet();
  await nextTick();
  if (!mapEl.value) return;

  const center = [form.lat, form.lng];
  if (!map) {
    map = L.map(mapEl.value, { zoomControl: true }).setView(center, 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    marker = L.circleMarker(center, {
      radius: 8,
      color: '#16A34A',
      fillColor: '#16A34A',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);
  } else {
    map.setView(center, 16);
    marker.setLatLng(center);
  }

  map.invalidateSize();
}

watch(() => [form.lat, form.lng], renderMap);
onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

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

  if (!form.location) {
    setStatus('error', '위치(주소)를 검색해서 선택해주세요.');
    return;
  }

  try {
    await apiFetch('/api/meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim(),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        capacity: Number(form.capacity),
      }),
    });

    form.title = '';
    form.description = '';
    form.location = '';
    form.lat = null;
    form.lng = null;
    form.scheduledAt = getDefaultScheduledAt();
    form.capacity = 6;
    setStatus('success', '모임이 생성되었습니다. 홈에서 확인할 수 있어요.');
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

      <div class="mb-4 grid gap-2 text-sm font-semibold text-[#191F28]">
        위치
        <button
          type="button"
          class="flex h-12 items-center justify-between gap-2 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium transition hover:border-[#16A34A]"
          @click="openPlaceSearch"
        >
          <span :class="form.location ? 'text-[#191F28]' : 'text-[#8B95A1]'">
            {{ form.location || '카페·장소를 검색하세요' }}
          </span>
          <Search :size="16" class="shrink-0 text-[#8B95A1]" />
        </button>
      </div>

      <div v-if="form.lat != null" class="mb-4 overflow-hidden rounded-xl border border-[#E5E8EB]">
        <div ref="mapEl" class="h-44 w-full"></div>
      </div>

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

    <div
      v-if="showSearch"
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      @click.self="showSearch = false"
    >
      <div class="absolute inset-0 bg-[#191F28]/30" @click="showSearch = false"></div>
      <div class="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:rounded-2xl">
        <div class="flex items-center justify-between border-b border-[#E5E8EB] px-4 py-3">
          <span class="text-[15px] font-semibold text-[#191F28]">장소 검색</span>
          <button
            type="button"
            class="text-[#8B95A1] transition hover:text-[#191F28]"
            aria-label="닫기"
            @click="showSearch = false"
          >
            <X :size="18" />
          </button>
        </div>
        <form class="flex gap-2 p-4" @submit.prevent="runPlaceSearch">
          <input
            v-model="searchQuery"
            class="h-11 flex-1 rounded-xl border border-[#E5E8EB] px-4 text-[15px] font-medium outline-none transition placeholder:text-[#8B95A1] focus:border-[#16A34A]"
            placeholder="예: 강남 스타벅스"
          />
          <button
            type="submit"
            class="h-11 shrink-0 rounded-xl bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90"
          >
            검색
          </button>
        </form>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p v-if="searching" class="py-6 text-center text-[15px] text-[#8B95A1]">검색 중입니다.</p>
          <p v-else-if="searchError" class="py-6 text-center text-[15px] font-semibold text-[#F04452]">
            {{ searchError }}
          </p>
          <p v-else-if="searchResults.length === 0" class="py-6 text-center text-[15px] text-[#8B95A1]">
            카페·장소 이름으로 검색해보세요.
          </p>
          <ul v-else class="divide-y divide-[#E5E8EB]">
            <li v-for="(place, index) in searchResults" :key="index">
              <button
                type="button"
                class="w-full py-3 text-left transition hover:opacity-80"
                @click="selectPlace(place)"
              >
                <p class="text-[15px] font-semibold text-[#191F28]">{{ place.placeName }}</p>
                <p class="mt-0.5 text-sm text-[#8B95A1]">{{ place.roadAddress || place.address }}</p>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
