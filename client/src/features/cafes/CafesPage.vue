<script setup>
import { computed, onBeforeUnmount, onMounted, nextTick, reactive, ref } from 'vue';
import { Coffee, Map as MapIcon, MessageSquare } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/useMeetups.js';
import { useToast } from '../../shared/useToast.js';
import CafeDetailSheet from './CafeDetailSheet.vue';

const toast = useToast();

const cafes = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const commentInputs = reactive({});
const pendingLocation = ref('');
const selectedCafe = ref(null);

const mappedCafes = computed(() => cafes.value.filter((cafe) => cafe.lat != null && cafe.lng != null));
const unmappedCount = computed(() => cafes.value.length - mappedCafes.value.length);

onMounted(() => {
  void loadCafes();
});

async function loadCafes() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const body = await apiFetch('/api/cafes');
    cafes.value = body.data ?? [];
    for (const cafe of cafes.value) {
      commentInputs[cafe.location] = cafe.comments?.find((comment) => comment.isMine)?.body ?? '';
    }
    void renderMap();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

// --- 카페 지도 (Leaflet, MeetupPage와 같은 lazy-load 패턴) ---
const mapEl = ref(null);
let leaflet = null;
let map = null;

async function ensureLeaflet() {
  if (!leaflet) {
    const mod = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    leaflet = mod.default;
    // 클러스터 플러그인은 leaflet 로드 후에 붙어야 한다.
    await import('leaflet.markercluster');
    await import('leaflet.markercluster/dist/MarkerCluster.css');
  }
  return leaflet;
}

async function renderMap() {
  if (mappedCafes.value.length === 0) return;

  const L = await ensureLeaflet();
  await nextTick();
  if (!mapEl.value) return;

  if (map) {
    map.remove();
    map = null;
  }

  map = L.map(mapEl.value, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // 축소 상태에서는 가까운 카페들이 개수 숫자가 적힌 초록 원으로 뭉치고,
  // 확대하면 개별 마커로 흩어진다.
  const clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
    iconCreateFunction: (cluster) =>
      L.divIcon({
        html: `<div class="cafe-cluster">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [36, 36],
      }),
  });

  const bounds = [];
  for (const cafe of mappedCafes.value) {
    const point = [cafe.lat, cafe.lng];
    bounds.push(point);
    const marker = L.circleMarker(point, {
      radius: 9,
      color: '#03C75A',
      fillColor: '#03C75A',
      fillOpacity: 0.9,
      weight: 2,
    })
      .bindTooltip(cafe.placeName ?? cafe.location)
      .on('click', () => {
        selectedCafe.value = cafe;
      });
    clusterGroup.addLayer(marker);
  }
  map.addLayer(clusterGroup);

  if (bounds.length === 1) map.setView(bounds[0], 16);
  else map.fitBounds(bounds, { padding: [30, 30] });
  map.invalidateSize();
}

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

async function saveComment(cafe) {
  const body = (commentInputs[cafe.location] ?? '').trim();
  if (!body) {
    toast.error('코멘트를 입력해주세요.');
    return;
  }

  pendingLocation.value = cafe.location;
  try {
    await apiFetch('/api/cafes/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: cafe.location, body }),
    });
    toast.success('코멘트를 저장했습니다.');
    await loadCafes();
  } catch (error) {
    toast.error(error.message);
  } finally {
    pendingLocation.value = '';
  }
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">카페 정보</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">완료된 모임이 있었던 카페와 한줄 코멘트를 모아봅니다.</p>
    </div>

    <!-- 카페 지도 -->
    <section v-if="mappedCafes.length" class="surface-card">
      <div class="mb-4 flex items-center gap-2">
        <MapIcon :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">카페 지도</h2>
        <span class="ml-auto text-[12px] text-[#5f6368]">마커를 누르면 상세 정보</span>
      </div>
      <!-- relative z-0: Leaflet 내부 z-index(400~1000)를 이 안에 가둬서
           z-50 모달(카페 시트 등)이 지도 뒤로 깔리지 않게 한다. -->
      <div ref="mapEl" class="relative z-0 h-64 w-full overflow-hidden rounded-xl border border-[#dadce0]"></div>
      <p v-if="unmappedCount > 0" class="mt-2 text-[12px] text-[#5f6368]">
        위치를 찾지 못한 카페 {{ unmappedCount }}곳은 아래 목록에서만 표시됩니다.
      </p>
    </section>

    <section class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <Coffee :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">카페 이력</h2>
        <span
          v-if="!loading && !errorMessage"
          class="ml-1 rounded-lg bg-[#f5f6f7] px-2 py-0.5 text-sm font-semibold text-[#5f6368]"
        >
          {{ cafes.length }}
        </span>
      </div>

      <ul v-if="loading" class="divide-y divide-[#dadce0]">
        <li v-for="n in 3" :key="n" class="animate-pulse py-4 first:pt-0 last:pb-0">
          <div class="h-5 w-3/4 rounded-md bg-[#f5f6f7]"></div>
          <div class="mt-2 h-3 w-1/2 rounded bg-[#f5f6f7]"></div>
          <div class="mt-3 h-10 rounded-lg bg-[#f5f6f7]"></div>
        </li>
      </ul>

      <p v-else-if="errorMessage" class="py-6 text-[15px] font-semibold text-[#e74c3c]">
        {{ errorMessage }}
      </p>

      <div v-else-if="cafes.length === 0" class="py-12 text-center">
        <p class="text-[15px] font-semibold text-[#333333]">아직 카페 이력이 없습니다.</p>
        <p class="mt-1 text-[13px] text-[#5f6368]">완료된 모임 장소가 생기면 이곳에 표시됩니다.</p>
      </div>

      <ul v-else class="divide-y divide-[#dadce0]">
        <li v-for="cafe in cafes" :key="cafe.location" class="grid gap-3 py-4 first:pt-0 last:pb-0">
          <div>
            <h3 class="text-[17px] font-bold text-[#333333]">{{ cafe.location }}</h3>
            <p class="mt-1 text-[12px] text-[#5f6368]">
              {{ cafe.meetupCount }}회 방문 · 최근 {{ formatDate(cafe.lastVisitedAt) }}
            </p>
          </div>

          <div v-if="cafe.comments.length" class="grid gap-2">
            <div
              v-for="comment in cafe.comments"
              :key="comment.id"
              class="rounded-lg bg-[#f5f6f7] px-3 py-2"
            >
              <div class="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#5f6368]">
                <MessageSquare :size="14" />
                {{ comment.authorName }}
              </div>
              <p class="text-[13px] leading-relaxed text-[#333333]">{{ comment.body }}</p>
            </div>
          </div>
          <p v-else class="text-[13px] text-[#5f6368]">아직 남겨진 코멘트가 없습니다.</p>

          <form v-if="cafe.canComment" class="grid gap-1" @submit.prevent="saveComment(cafe)">
            <div class="flex gap-2">
              <input
                v-model="commentInputs[cafe.location]"
                class="h-10 min-w-0 flex-1 rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition placeholder:text-[#5f6368] focus:border-[#03C75A]"
                maxlength="120"
                placeholder="이 카페에 대한 한줄 코멘트"
              />
              <button
                class="focus-ring h-10 shrink-0 rounded bg-[#03C75A] px-3 text-sm font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-50"
                type="submit"
                :disabled="pendingLocation === cafe.location"
              >
                저장
              </button>
            </div>
            <span class="pr-1 text-right text-[11px] text-[#5f6368]">
              {{ (commentInputs[cafe.location] ?? '').length }}/120
            </span>
          </form>
          <p v-else class="text-[12px] text-[#5f6368]">
            참석 이력이 있는 카페에만 코멘트를 남길 수 있습니다.
          </p>
        </li>
      </ul>
    </section>

    <!-- 카페 상세 시트 -->
    <CafeDetailSheet v-if="selectedCafe" :cafe="selectedCafe" @close="selectedCafe = null" />
  </section>
</template>

<style>
/* Leaflet이 주입하는 클러스터 아이콘 — scoped가 적용되지 않아 전역으로 둔다. */
.cafe-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: #03c75a;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(51, 51, 51, 0.3);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
</style>
