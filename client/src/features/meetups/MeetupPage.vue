<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CalendarDays, ChevronDown, Plus, Search, X } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/useMeetups.js';
import { useUpcomingMeetups } from '../../shared/useUpcomingMeetups.js';
import { useToast } from '../../shared/useToast.js';
import { useGuestGate } from '../../shared/useGuestGate.js';
import MeetupCard from '../../shared/MeetupCard.vue';
import RefreshSomoimButton from '../../shared/RefreshSomoimButton.vue';
import { MEETUP_LIMITS } from '../../../../shared/domain-constraints.js';

const toast = useToast();
const { isGuest, requireLogin } = useGuestGate();
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

const formOpen = ref(false);

onMounted(() => {
  void loadAll();
});

// 서버 한도는 100이지만, 셀렉트 박스에서 고르기 쉬운 현실적인 범위만 노출한다.
const CAPACITY_CHOICES = MEETUP_LIMITS.capacityChoiceCount;

const form = ref({
  title: '',
  description: '',
  location: '',
  lat: null,
  lng: null,
  scheduledAt: getDefaultScheduledAt(),
  capacity: MEETUP_LIMITS.defaultCapacity,
});

const minScheduledAt = computed(() => toLocalInputValue(new Date(Date.now() + MEETUP_LIMITS.minLeadMs)));

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

// --- 만들기 확인 팝업 ---
const showConfirm = ref(false);
const creating = ref(false);

// 만들기 버튼: 입력 검증만 통과하면 바로 만들지 않고 장소·일시 확인 팝업을 띄운다.
function requestCreateMeetup() {
  if (isGuest.value) {
    requireLogin('모임 만들기는 로그인하면 쓸 수 있어요.');
    return;
  }

  const scheduled = new Date(form.value.scheduledAt);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + MEETUP_LIMITS.minLeadMs) {
    toast.error('모임은 지금부터 30분 이후 시간으로만 만들 수 있어요.');
    return;
  }

  const capacity = Number(form.value.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MEETUP_LIMITS.maxCapacity) {
    toast.error(`최대 참가 인원은 1~${MEETUP_LIMITS.maxCapacity}명 사이로 골라 주세요.`);
    return;
  }

  if (!form.value.location) {
    toast.error('카페·장소를 검색해서 선택해 주세요.');
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
    form.value.capacity = MEETUP_LIMITS.defaultCapacity;
    formOpen.value = false;

    toast.success('새 모임을 만들었어요.');
    await loadAll();
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
    <button
      class="focus-ring ui-radius-control flex h-12 w-full items-center justify-center gap-2 bg-[var(--ui-color-brand)] text-[15px] font-semibold text-white transition"
      type="button"
      :aria-expanded="formOpen"
      @click="formOpen = !formOpen"
    >
      <Plus v-if="!formOpen" :size="18" />
      <X v-else :size="18" />
      {{ formOpen ? '만들기 접기' : '모임 만들기' }}
    </button>

    <form v-if="formOpen" class="surface-card" @submit.prevent="requestCreateMeetup">
      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
        제목
        <input
          v-model="form.title"
          class="h-12 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)]"
          placeholder="예: 모여서 각자 코딩"
          required
        />
      </label>

      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
        내용
        <textarea
          v-model="form.description"
          class="min-h-[88px] rounded-lg border border-[var(--ui-color-stroke)] px-4 py-3 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)]"
          placeholder="호스트는 무엇을 할지 간단히 적어주세요 (예: 사이드 프로젝트, 바이브 코딩)"
          rows="3"
        ></textarea>
      </label>

      <div class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
        위치
        <button
          type="button"
          class="focus-ring flex h-12 items-center justify-between gap-2 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium transition hover:border-[var(--ui-color-brand)]"
          @click="openPlaceSearch"
        >
          <span :class="form.location ? 'text-[var(--ui-color-content)]' : 'text-[14px] text-[var(--ui-color-content-muted)]'">
            {{ form.location || '카페·장소를 검색하세요' }}
          </span>
          <Search :size="16" class="shrink-0 text-[var(--ui-color-content-muted)]" />
        </button>
      </div>

      <div v-if="form.lat != null" class="mb-4 overflow-hidden rounded-lg border border-[var(--ui-color-stroke)]">
        <!-- relative z-0: Leaflet 내부 z-index가 오버레이 레이어의 모달을 덮지 않게 가둔다. -->
        <div ref="mapEl" class="relative z-0 h-44 w-full"></div>
      </div>

      <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
        일정
        <input
          v-model="form.scheduledAt"
          class="h-12 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none transition focus:border-[var(--ui-color-brand)]"
          type="datetime-local"
          :min="minScheduledAt"
          required
        />
      </label>

      <label class="mb-5 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
        최대 참가 인원
        <div class="relative">
          <ChevronDown
            :size="16"
            class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ui-color-content-muted)]"
          />
          <select
            v-model.number="form.capacity"
            class="h-12 w-full appearance-none rounded-lg border border-[var(--ui-color-stroke)] bg-white pl-10 pr-4 text-[15px] font-medium outline-none transition focus:border-[var(--ui-color-brand)]"
            required
          >
            <option v-for="n in CAPACITY_CHOICES" :key="n" :value="n">{{ n }}명</option>
          </select>
        </div>
        <span class="text-[12px] font-medium text-[var(--ui-color-content-muted)]">나를 포함한 인원이에요.</span>
      </label>

      <button
        class="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded bg-[var(--ui-color-brand)] text-[15px] font-semibold text-white transition hover:bg-[var(--ui-color-brand-hover)]"
        type="submit"
      >
        <Plus :size="18" />
        모임 만들기
      </button>
    </form>

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
        <p class="ui-text-muted mt-1 text-[13px]">위에서 새 모임을 만들어 보세요.</p>
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

    <!-- 장소 검색 모달 -->
    <div
      v-if="showSearch"
      class="fixed inset-0 ui-layer-overlay flex items-end justify-center sm:items-center"
      @click.self="showSearch = false"
    >
      <div class="absolute inset-0 bg-[var(--ui-color-content)]/30" @click="showSearch = false"></div>
      <div class="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-white shadow-sm sm:rounded-xl">
        <div class="flex items-center justify-between border-b border-[var(--ui-color-stroke)] px-4 py-3">
          <span class="text-[15px] font-semibold text-[var(--ui-color-content)]">장소 검색</span>
          <button
            type="button"
            class="text-[var(--ui-color-content-muted)] transition hover:text-[var(--ui-color-content)]"
            aria-label="닫기"
            @click="showSearch = false"
          >
            <X :size="18" />
          </button>
        </div>
        <form class="flex gap-2 p-4" @submit.prevent="runPlaceSearch">
          <input
            v-model="searchQuery"
            class="h-11 flex-1 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none transition placeholder:text-[14px] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)]"
            placeholder="예: 강남 스타벅스"
          />
          <button
            type="submit"
            class="focus-ring h-11 shrink-0 rounded bg-[var(--ui-color-brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--ui-color-brand-hover)]"
          >
            검색
          </button>
        </form>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p v-if="searching" class="py-6 text-center text-[15px] text-[var(--ui-color-content-muted)]">검색 중입니다.</p>
          <p v-else-if="searchError" class="py-6 text-center text-[15px] font-semibold text-[var(--ui-color-destructive)]">
            {{ searchError }}
          </p>
          <p v-else-if="searchResults.length === 0" class="py-6 text-center text-[15px] text-[var(--ui-color-content-muted)]">
            카페·장소 이름으로 검색해보세요.
          </p>
          <ul v-else class="divide-y divide-[var(--ui-color-stroke)]">
            <li v-for="(place, index) in searchResults" :key="index">
              <button
                type="button"
                class="w-full py-3 text-left transition hover:opacity-80"
                @click="selectPlace(place)"
              >
                <p class="text-[15px] font-semibold text-[var(--ui-color-content)]">{{ place.placeName }}</p>
                <p class="mt-0.5 text-sm text-[var(--ui-color-content-muted)]">{{ place.roadAddress || place.address }}</p>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 개설 확인 팝업 -->
    <div
      v-if="showConfirm"
      class="fixed inset-0 ui-layer-overlay flex items-center justify-center px-4"
      @click.self="showConfirm = false"
    >
      <div class="absolute inset-0 bg-[var(--ui-color-content)]/30" @click="showConfirm = false"></div>
      <!-- 확인 팝업은 가운데에 띄운다. 아래에 붙이면 고정 탭바와 같은 자리에서
           겹쳐 버튼을 누르기 어렵다. 장소 검색 시트와 달리 목록을 훑는 화면이
           아니라 높이도 필요 없다. -->
      <div class="ui-bg-surface relative z-10 w-full max-w-md rounded-xl p-5 shadow-sm">
        <p class="text-[17px] font-bold text-[var(--ui-color-content)]">이 내용으로 모임을 만들까요?</p>
        <dl class="mt-4 grid gap-2.5 rounded-lg bg-[var(--ui-color-surface-subtle)] p-4 text-[14px]">
          <div class="flex gap-3">
            <dt class="w-8 shrink-0 font-semibold text-[var(--ui-color-content-muted)]">장소</dt>
            <dd class="min-w-0 break-keep font-medium text-[var(--ui-color-content)]">{{ form.location }}</dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-8 shrink-0 font-semibold text-[var(--ui-color-content-muted)]">일시</dt>
            <dd class="font-medium text-[var(--ui-color-content)]">{{ formatDate(form.scheduledAt) }}</dd>
          </div>
        </dl>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="focus-ring h-12 flex-1 rounded border border-[var(--ui-color-stroke)] text-[15px] font-semibold text-[var(--ui-color-content)] transition hover:bg-[var(--ui-color-surface-subtle)]"
            @click="showConfirm = false"
          >
            돌아가기
          </button>
          <button
            type="button"
            class="focus-ring h-12 flex-1 rounded bg-[var(--ui-color-brand)] text-[15px] font-semibold text-white transition hover:bg-[var(--ui-color-brand-hover)] disabled:opacity-60"
            :disabled="creating"
            @click="createMeetup"
          >
            {{ creating ? '만드는 중…' : '모임 만들기' }}
          </button>
        </div>
      </div>
    </div>

  </section>
</template>
