<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Calendar, MapPin, Search, X } from '@lucide/vue';
import { apiFetch } from './api.js';
import { useToast } from './useToast.js';
import { useOverlay } from './useOverlay.js';
import { MEETUP_LIMITS } from '../../../shared/domain-constraints.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'created']);

const toast = useToast();

// 입력 순서를 언제 → 어디서 → 무엇으로 잡는다. 사람이 모임을 잡는 순서이기도 하고,
// 앞의 둘이 정해지면 제목을 채워줄 수 있어 빈 칸에서 시작하지 않아도 된다.
const scheduledAt = ref(defaultScheduledAt());
const location = ref('');
const placeName = ref('');
const placeId = ref(null);
const placeUrl = ref(null);
const lat = ref(null);
const lng = ref(null);
const title = ref('');
const titleTouched = ref(false);
const capacity = ref(MEETUP_LIMITS.defaultCapacity);
const creating = ref(false);

const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const searchError = ref('');
const searchInput = ref(null);
const dialogRef = ref(null);

useOverlay({
  containerRef: dialogRef,
  enabled: computed(() => props.open),
  onClose: () => emit('close'),
  initialFocusSelector: 'input[type="datetime-local"]',
});

const minScheduledAt = computed(() => toLocalInputValue(new Date(Date.now() + MEETUP_LIMITS.minLeadMs)));

// 정원은 select 대신 칩으로 고른다. 모바일에서 네이티브 피커를 띄우지 않고
// 한 번에 고를 수 있다. 벗어나는 값은 "직접"으로 받는다.
const CAPACITY_CHIPS = [4, 6, 8, 10];
const customCapacity = ref(false);

// 제목은 장소에서 만들어 준다. 손대기 전까지만 따라간다 — 한 글자라도 고치면
// 그 뒤로는 장소를 바꿔도 덮어쓰지 않는다.
watch(placeName, (name) => {
  if (!titleTouched.value) title.value = name ? `${name} 모각작` : '';
});

const summary = computed(() => {
  if (!location.value || !scheduledAt.value) return '';
  const when = new Date(scheduledAt.value);
  if (Number.isNaN(when.getTime())) return '';
  return `${formatWhen(when)} · ${placeName.value || location.value}`;
});

const canSubmit = computed(() => Boolean(title.value.trim() && location.value && scheduledAt.value));

watch(() => props.open, (open) => {
  if (open) return;
  // 닫으면 초기화한다. 다음에 열 때 지난 입력이 남아 있으면 헷갈린다.
  scheduledAt.value = defaultScheduledAt();
  location.value = '';
  placeName.value = '';
  placeId.value = null;
  placeUrl.value = null;
  lat.value = null;
  lng.value = null;
  title.value = '';
  titleTouched.value = false;
  capacity.value = MEETUP_LIMITS.defaultCapacity;
  customCapacity.value = false;
  searchQuery.value = '';
  searchResults.value = [];
  searchError.value = '';
  map?.remove();
  map = null;
});

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
  location.value = place.roadAddress
    ? `${place.placeName} (${place.roadAddress})`
    : place.placeName;
  placeName.value = place.placeName;
  // 카페 이력을 묶고, 소모임 정모의 지도 링크로 쓰는 값이다.
  placeId.value = place.placeId ?? null;
  placeUrl.value = place.placeUrl ?? null;
  lat.value = place.lat ?? null;
  lng.value = place.lng ?? null;
  searchResults.value = [];
  searchQuery.value = '';
  void renderMap();
}

function clearPlace() {
  location.value = '';
  placeName.value = '';
  placeId.value = null;
  placeUrl.value = null;
  lat.value = null;
  lng.value = null;
  void nextTick(() => searchInput.value?.focus());
}

// 지도는 고른 곳이 맞는지 확인하는 용도라 무겁게 두지 않는다. Leaflet은 장소를
// 고른 뒤에만 불러온다 — 팝업을 열 때마다 받아오면 만들기가 그만큼 느려진다.
const mapEl = ref(null);
let leaflet = null;
let map = null;
let marker = null;

async function renderMap() {
  if (lat.value == null || lng.value == null) return;
  if (!leaflet) {
    const mod = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    leaflet = mod.default;
  }
  await nextTick();
  if (!mapEl.value) return;

  const center = [lat.value, lng.value];
  if (!map) {
    map = leaflet.map(mapEl.value, { zoomControl: false, attributionControl: false }).setView(center, 16);
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    marker = leaflet.circleMarker(center, {
      radius: 8, color: '#03C75A', fillColor: '#03C75A', fillOpacity: 0.9, weight: 2,
    }).addTo(map);
  } else {
    map.setView(center, 16);
    marker.setLatLng(center);
  }
  // 스크롤되는 폼 안이라 컨테이너 크기가 한 박자 늦게 잡힌다. 그 전에 재면
  // Leaflet이 0x0으로 알고 타일을 안 그린다.
  map.invalidateSize();
  requestAnimationFrame(() => map?.invalidateSize());
}

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

function pickCapacity(value) {
  capacity.value = value;
  customCapacity.value = false;
}

async function submit() {
  if (creating.value) return;

  const when = new Date(scheduledAt.value);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + MEETUP_LIMITS.minLeadMs) {
    toast.error('모임은 지금부터 30분 이후 시간으로만 만들 수 있어요.');
    return;
  }
  const size = Number(capacity.value);
  if (!Number.isInteger(size) || size < 1 || size > MEETUP_LIMITS.maxCapacity) {
    toast.error(`최대 참가 인원은 1~${MEETUP_LIMITS.maxCapacity}명 사이로 골라 주세요.`);
    return;
  }
  if (!location.value) {
    toast.error('카페·장소를 검색해서 선택해 주세요.');
    return;
  }

  creating.value = true;
  try {
    await apiFetch('/api/meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.value.trim(),
        description: null,
        location: location.value.trim(),
        scheduledAt: when.toISOString(),
        capacity: size,
        placeId: placeId.value,
        placeUrl: placeUrl.value,
      }),
    });
    toast.success('새 모임을 만들었어요.');
    emit('created');
    emit('close');
  } catch (error) {
    toast.error(error.message);
  } finally {
    creating.value = false;
  }
}

function defaultScheduledAt() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return toLocalInputValue(date);
}

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatWhen(date) {
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const hour = date.getHours();
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday}) ${period} ${hour12}:${minute}`;
}
</script>

<template>
  <Transition name="ui-modal">
    <div
      v-if="open"
      class="fixed inset-0 ui-layer-overlay flex items-center justify-center px-4"
      @click.self="emit('close')"
    >
      <div class="absolute inset-0 bg-[var(--ui-color-content)]/30" @click="emit('close')"></div>

      <div
        ref="dialogRef"
        class="ui-modal-panel ui-bg-surface ui-radius-overlay relative z-10 flex max-h-[85vh] w-full max-w-md flex-col shadow-sm"
        role="dialog"
        aria-modal="true"
        aria-label="모임 만들기"
        tabindex="-1"
      >
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-color-stroke-subtle)] px-5 py-4">
        <h2 class="text-[17px] font-bold text-[var(--ui-color-content)]">모임 만들기</h2>
        <button
          class="focus-ring ui-transition-colors flex h-11 w-11 items-center justify-center rounded-full text-[var(--ui-color-content-muted)] hover:bg-[var(--ui-color-surface-subtle)]"
          type="button"
          aria-label="닫기"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <form class="min-h-0 flex-1 overflow-y-auto px-5 py-4" @submit.prevent="submit">
        <!-- 언제 -->
        <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
          <span class="flex items-center gap-1.5"><Calendar :size="14" class="ui-text-brand" /> 언제</span>
          <input
            v-model="scheduledAt"
            class="h-12 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none ui-transition-colors focus:border-[var(--ui-color-brand)]"
            type="datetime-local"
            :min="minScheduledAt"
            required
          />
        </label>

        <!-- 어디서: 검색을 이 팝업 안에서 끝낸다. 시트를 또 띄우면 팝업 위에 팝업이 된다. -->
        <div class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
          <span class="flex items-center gap-1.5"><MapPin :size="14" class="ui-text-brand" /> 어디서</span>

          <div v-if="location" class="flex items-center justify-between gap-2 rounded-lg border border-[var(--ui-color-brand)] px-4 py-3">
            <span class="min-w-0 flex-1 break-keep text-[15px] font-medium text-[var(--ui-color-content)]">{{ location }}</span>
            <button
              class="focus-ring shrink-0 rounded px-2 py-1 text-[12px] font-semibold text-[var(--ui-color-content-muted)] ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)]"
              type="button"
              @click="clearPlace"
            >
              변경
            </button>
          </div>

          <template v-else>
            <div class="flex min-w-0 items-center gap-2">
              <input
                ref="searchInput"
                v-model="searchQuery"
                class="h-12 min-w-0 flex-1 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none ui-transition-colors placeholder:text-[14px] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)]"
                placeholder="카페 이름"
                @keydown.enter.prevent="runPlaceSearch"
              />
              <button
                class="focus-ring ui-pressable ui-radius-control flex h-12 shrink-0 items-center gap-1.5 bg-[var(--ui-color-brand)] px-4 text-[14px] font-semibold text-white ui-transition-colors hover:bg-[var(--ui-color-brand-hover)] disabled:opacity-60"
                type="button"
                :disabled="searching || !searchQuery.trim()"
                @click="runPlaceSearch"
              >
                <Search :size="16" />
                검색
              </button>
            </div>
            <p v-if="searching" class="px-1 text-[13px] text-[var(--ui-color-content-muted)]">찾는 중이에요…</p>
            <p v-else-if="searchError" class="px-1 text-[13px] font-semibold text-[var(--ui-color-destructive)]">{{ searchError }}</p>
            <ul v-else-if="searchResults.length" class="max-h-52 overflow-y-auto rounded-lg border border-[var(--ui-color-stroke)]">
              <li v-for="place in searchResults" :key="place.placeId ?? `${place.placeName}-${place.roadAddress}`" class="border-b border-[var(--ui-color-stroke-subtle)] last:border-b-0">
                <button
                  class="focus-ring w-full px-4 py-3 text-left ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)]"
                  type="button"
                  @click="selectPlace(place)"
                >
                  <p class="text-[15px] font-semibold text-[var(--ui-color-content)]">{{ place.placeName }}</p>
                  <p class="mt-0.5 text-[13px] text-[var(--ui-color-content-muted)]">{{ place.roadAddress || place.address }}</p>
                </button>
              </li>
            </ul>
          </template>
        </div>

        <!-- 무엇을: 장소가 정해지면 제목이 채워져 있다. -->
        <label class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
          제목
          <input
            v-model="title"
            class="h-12 rounded-lg border border-[var(--ui-color-stroke)] px-4 text-[15px] font-medium outline-none ui-transition-colors placeholder:text-[14px] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)]"
            placeholder="예: 모여서 각자 코딩"
            required
            @input="titleTouched = true"
          />
        </label>

        <div class="mb-4 grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
          정원
          <div class="flex flex-wrap gap-2">
            <button
              v-for="size in CAPACITY_CHIPS"
              :key="size"
              class="focus-ring ui-radius-pill h-10 min-w-[3.25rem] border px-3 text-[14px] font-semibold ui-transition-colors"
              :class="!customCapacity && capacity === size
                ? 'ui-border-brand ui-bg-success ui-text-success'
                : 'ui-border ui-text-muted hover:bg-[var(--ui-color-surface-subtle)]'"
              type="button"
              @click="pickCapacity(size)"
            >
              {{ size }}명
            </button>
            <button
              class="focus-ring ui-radius-pill h-10 border px-3 text-[14px] font-semibold ui-transition-colors"
              :class="customCapacity
                ? 'ui-border-brand ui-bg-success ui-text-success'
                : 'ui-border ui-text-muted hover:bg-[var(--ui-color-surface-subtle)]'"
              type="button"
              @click="customCapacity = true"
            >
              직접
            </button>
            <input
              v-if="customCapacity"
              v-model.number="capacity"
              class="h-10 w-20 rounded-lg border border-[var(--ui-color-stroke)] px-3 text-[14px] font-semibold outline-none focus:border-[var(--ui-color-brand)]"
              type="number"
              min="1"
              :max="MEETUP_LIMITS.maxCapacity"
              aria-label="최대 참가 인원"
            />
          </div>
        </div>


        <!-- 고른 곳이 맞는지 눈으로 확인하는 용도. 장소를 고르기 전에는 자리를
             차지하지 않는다. -->
        <div v-if="lat != null" class="grid gap-1.5 text-[13px] font-medium text-[var(--ui-color-content)]">
          위치
          <div ref="mapEl" class="ui-border h-40 w-full overflow-hidden rounded-lg border"></div>
        </div>
      </form>

      <!-- 확인 팝업 대신 요약 한 줄. 팝업 위에 팝업을 띄우지 않는다. -->
      <div class="shrink-0 border-t border-[var(--ui-color-stroke-subtle)] px-5 py-4">
        <p v-if="summary" class="mb-3 break-keep text-center text-[13px] font-semibold text-[var(--ui-color-content-muted)]">
          {{ summary }}
        </p>
        <button
          class="focus-ring ui-pressable ui-radius-control h-12 w-full bg-[var(--ui-color-brand)] text-[15px] font-semibold text-white ui-transition-colors hover:bg-[var(--ui-color-brand-hover)] disabled:opacity-60"
          type="button"
          :disabled="creating || !canSubmit"
          @click="submit"
        >
          {{ creating ? '만드는 중…' : '모임 만들기' }}
        </button>
      </div>
      </div>
    </div>
  </Transition>
</template>
