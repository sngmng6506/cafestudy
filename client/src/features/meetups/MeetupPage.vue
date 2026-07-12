<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronDown, Plus, Search, X } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/useMeetups.js';
import { useToast } from '../../shared/useToast.js';

const toast = useToast();

// 서버 한도는 100이지만, 셀렉트 박스에서 고르기 쉬운 현실적인 범위만 노출한다.
const CAPACITY_CHOICES = 20;

const form = ref({
  title: '',
  description: '',
  location: '',
  lat: null,
  lng: null,
  scheduledAt: getDefaultScheduledAt(),
  capacity: 6,
});

const minScheduledAt = computed(() => toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));

// --- Place search ---
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
  form.value.location = place.roadAddress
    ? `${place.placeName} (${place.roadAddress})`
    : place.placeName;
  form.value.lat = place.lat ?? null;
  form.value.lng = place.lng ?? null;
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
  if (form.value.lat == null || form.value.lng == null) {
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

  const center = [form.value.lat, form.value.lng];
  if (!map) {
    map = L.map(mapEl.value, { zoomControl: true }).setView(center, 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    marker = L.circleMarker(center, {
      radius: 8,
      color: '#03C75A',
      fillColor: '#03C75A',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);
  } else {
    map.setView(center, 16);
    marker.setLatLng(center);
  }

  map.invalidateSize();
}

watch(() => [form.value.lat, form.value.lng], renderMap);
onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

// --- 개설 확인 팝업 ---
const showConfirm = ref(false);
const creating = ref(false);

// 개설 버튼: 입력 검증만 통과하면 바로 만들지 않고 장소·일시 확인 팝업을 띄운다.
function requestCreateMeetup() {
  const scheduled = new Date(form.value.scheduledAt);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + 30 * 60 * 1000) {
    toast.error('모임은 지금부터 30분 이후 시간으로만 개설할 수 있습니다.');
    return;
  }

  const capacity = Number(form.value.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    toast.error('최대 참가 인원은 1~100 사이로 입력해주세요.');
    return;
  }

  if (!form.value.location) {
    toast.error('위치(주소)를 검색해서 선택해주세요.');
    return;
  }

  showConfirm.value = true;
}

async function createMeetup() {
  if (creating.value) return;
  creating.value = true;

  try {
    await apiFetch('/api/meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.value.title.trim(),
        description: form.value.description.trim() || null,
        location: form.value.location.trim(),
        scheduledAt: new Date(form.value.scheduledAt).toISOString(),
        capacity: Number(form.value.capacity),
      }),
    });

    form.value.title = '';
    form.value.description = '';
    form.value.location = '';
    form.value.lat = null;
    form.value.lng = null;
    form.value.scheduledAt = getDefaultScheduledAt();
    form.value.capacity = 6;

    toast.success('모임이 생성되었습니다.');
  } catch (error) {
    toast.error(error.message);
  } finally {
    creating.value = false;
    showConfirm.value = false;
  }
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
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">모임 개설</h1>
    </div>

    <form class="surface-card" @submit.prevent="requestCreateMeetup">
      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[#333333]">
        제목
        <input
          v-model="form.title"
          class="h-12 rounded-lg border border-[#dadce0] px-4 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[#5f6368] focus:border-[#03C75A]"
          placeholder="예: 모여서 각자 코딩"
          required
        />
      </label>

      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[#333333]">
        내용
        <textarea
          v-model="form.description"
          class="min-h-[88px] rounded-lg border border-[#dadce0] px-4 py-3 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[#5f6368] focus:border-[#03C75A]"
          placeholder="호스트는 무엇을 할지 간단히 적어주세요 (예: 사이드 프로젝트, 바이브 코딩)"
          rows="3"
        ></textarea>
      </label>

      <div class="mb-4 grid gap-1.5 text-[13px] font-medium text-[#333333]">
        위치
        <button
          type="button"
          class="focus-ring flex h-12 items-center justify-between gap-2 rounded-lg border border-[#dadce0] px-4 text-[15px] font-medium transition hover:border-[#03C75A]"
          @click="openPlaceSearch"
        >
          <span :class="form.location ? 'text-[#333333]' : 'text-[14px] text-[#5f6368]'">
            {{ form.location || '카페·장소를 검색하세요' }}
          </span>
          <Search :size="16" class="shrink-0 text-[#5f6368]" />
        </button>
      </div>

      <div v-if="form.lat != null" class="mb-4 overflow-hidden rounded-lg border border-[#dadce0]">
        <!-- relative z-0: Leaflet 내부 z-index가 z-50 모달을 덮지 않게 가둔다. -->
        <div ref="mapEl" class="relative z-0 h-44 w-full"></div>
      </div>

      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[#333333]">
        일정
        <input
          v-model="form.scheduledAt"
          class="h-12 rounded-lg border border-[#dadce0] px-4 text-[15px] font-medium outline-none transition focus:border-[#03C75A]"
          type="datetime-local"
          :min="minScheduledAt"
          required
        />
      </label>

      <label class="mb-5 grid gap-1.5 text-[13px] font-medium text-[#333333]">
        최대 참가 인원
        <div class="relative">
          <ChevronDown
            :size="16"
            class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5f6368]"
          />
          <select
            v-model.number="form.capacity"
            class="h-12 w-full appearance-none rounded-lg border border-[#dadce0] bg-white pl-10 pr-4 text-[15px] font-medium outline-none transition focus:border-[#03C75A]"
            required
          >
            <option v-for="n in CAPACITY_CHOICES" :key="n" :value="n">{{ n }}명</option>
          </select>
        </div>
        <span class="text-[12px] font-medium text-[#5f6368]">개설자(나) 포함 인원입니다.</span>
      </label>

      <button
        class="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350]"
        type="submit"
      >
        <Plus :size="18" />
        개설
      </button>
    </form>

    <!-- 장소 검색 모달 -->
    <div
      v-if="showSearch"
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      @click.self="showSearch = false"
    >
      <div class="absolute inset-0 bg-[#333333]/30" @click="showSearch = false"></div>
      <div class="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-white shadow-sm sm:rounded-xl">
        <div class="flex items-center justify-between border-b border-[#dadce0] px-4 py-3">
          <span class="text-[15px] font-semibold text-[#333333]">장소 검색</span>
          <button
            type="button"
            class="text-[#5f6368] transition hover:text-[#333333]"
            aria-label="닫기"
            @click="showSearch = false"
          >
            <X :size="18" />
          </button>
        </div>
        <form class="flex gap-2 p-4" @submit.prevent="runPlaceSearch">
          <input
            v-model="searchQuery"
            class="h-11 flex-1 rounded-lg border border-[#dadce0] px-4 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[#5f6368] focus:border-[#03C75A]"
            placeholder="예: 강남 스타벅스"
          />
          <button
            type="submit"
            class="focus-ring h-11 shrink-0 rounded bg-[#03C75A] px-4 text-sm font-semibold text-white transition hover:bg-[#02b350]"
          >
            검색
          </button>
        </form>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p v-if="searching" class="py-6 text-center text-[15px] text-[#5f6368]">검색 중입니다.</p>
          <p v-else-if="searchError" class="py-6 text-center text-[15px] font-semibold text-[#e74c3c]">
            {{ searchError }}
          </p>
          <p v-else-if="searchResults.length === 0" class="py-6 text-center text-[15px] text-[#5f6368]">
            카페·장소 이름으로 검색해보세요.
          </p>
          <ul v-else class="divide-y divide-[#dadce0]">
            <li v-for="(place, index) in searchResults" :key="index">
              <button
                type="button"
                class="w-full py-3 text-left transition hover:opacity-80"
                @click="selectPlace(place)"
              >
                <p class="text-[15px] font-semibold text-[#333333]">{{ place.placeName }}</p>
                <p class="mt-0.5 text-sm text-[#5f6368]">{{ place.roadAddress || place.address }}</p>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 개설 확인 팝업 -->
    <div
      v-if="showConfirm"
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      @click.self="showConfirm = false"
    >
      <div class="absolute inset-0 bg-[#333333]/30" @click="showConfirm = false"></div>
      <div class="relative z-10 w-full max-w-md rounded-t-xl bg-white p-5 shadow-sm sm:rounded-xl">
        <p class="text-[17px] font-bold text-[#333333]">이 내용으로 모임을 개설할까요?</p>
        <dl class="mt-4 grid gap-2.5 rounded-lg bg-[#f5f6f7] p-4 text-[14px]">
          <div class="flex gap-3">
            <dt class="w-8 shrink-0 font-semibold text-[#5f6368]">장소</dt>
            <dd class="min-w-0 break-keep font-medium text-[#333333]">{{ form.location }}</dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-8 shrink-0 font-semibold text-[#5f6368]">일시</dt>
            <dd class="font-medium text-[#333333]">{{ formatDate(form.scheduledAt) }}</dd>
          </div>
        </dl>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="focus-ring h-12 flex-1 rounded border border-[#dadce0] text-[15px] font-semibold text-[#333333] transition hover:bg-[#f5f6f7]"
            @click="showConfirm = false"
          >
            취소
          </button>
          <button
            type="button"
            class="focus-ring h-12 flex-1 rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-60"
            :disabled="creating"
            @click="createMeetup"
          >
            {{ creating ? '개설 중…' : '개설하기' }}
          </button>
        </div>
      </div>
    </div>

  </section>
</template>
