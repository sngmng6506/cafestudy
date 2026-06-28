<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Crown, Dices, Trophy } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const now = new Date();
const CURRENT = { year: now.getFullYear(), month: now.getMonth() + 1 };

const mode = ref('monthly');
const rankings = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const diceRanking = ref([]);
const diceLoading = ref(true);
const cursor = ref({ ...CURRENT });

const title = computed(() => (mode.value === 'monthly' ? '월간 랭킹' : '누적 랭킹'));
const monthLabel = computed(() => `${cursor.value.year}년 ${cursor.value.month}월`);
const isCurrentMonth = computed(
  () => cursor.value.year === CURRENT.year && cursor.value.month === CURRENT.month,
);
const emptyMessage = computed(() =>
  mode.value === 'monthly'
    ? '이 달에 쌓인 포인트가 아직 없습니다.'
    : '아직 포인트를 얻은 사용자가 없습니다.',
);

onMounted(() => {
  void loadRanking();
  void loadDiceRanking();
});

async function loadDiceRanking() {
  diceLoading.value = true;
  try {
    const body = await apiFetch('/api/dice/ranking');
    diceRanking.value = body.data;
  } catch {
    diceRanking.value = [];
  } finally {
    diceLoading.value = false;
  }
}

async function switchMode(nextMode) {
  mode.value = nextMode;
  if (nextMode === 'monthly') cursor.value = { ...CURRENT };
  await loadRanking();
}

function shiftMonth(delta) {
  const date = new Date(cursor.value.year, cursor.value.month - 1 + delta, 1);
  const next = { year: date.getFullYear(), month: date.getMonth() + 1 };

  // Never navigate into the future.
  if (next.year > CURRENT.year || (next.year === CURRENT.year && next.month > CURRENT.month)) {
    return;
  }

  cursor.value = next;
  void loadRanking();
}

async function loadRanking() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const endpoint =
      mode.value === 'monthly'
        ? `/api/ranking/monthly?year=${cursor.value.year}&month=${cursor.value.month}`
        : '/api/ranking/all-time';
    const body = await apiFetch(endpoint);
    rankings.value = body.data;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">랭킹</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">포인트 기반 순위</p>
    </div>

    <section class="rounded-xl border border-[#dadce0] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <Trophy :size="18" class="text-[#03C75A]" />
        <p class="text-[14px] text-[#5f6368]">인증으로 쌓인 포인트를 기준으로 정렬합니다.</p>
      </div>

      <div class="mb-5 grid grid-cols-2 rounded-xl border border-[#dadce0] bg-[#f5f6f7] p-1">
        <button
          class="focus-ring h-11 rounded text-[15px] font-semibold transition"
          :class="mode === 'monthly' ? 'bg-[#03C75A] text-white shadow-sm' : 'text-[#5f6368]'"
          type="button"
          @click="switchMode('monthly')"
        >
          월간
        </button>
        <button
          class="focus-ring h-11 rounded text-[15px] font-semibold transition"
          :class="mode === 'all-time' ? 'bg-[#03C75A] text-white shadow-sm' : 'text-[#5f6368]'"
          type="button"
          @click="switchMode('all-time')"
        >
          누적
        </button>
      </div>

      <div v-if="mode === 'monthly'" class="mb-5 flex items-center justify-center gap-2">
        <button
          class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
          type="button"
          aria-label="이전 달"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <span class="min-w-[100px] text-center text-[15px] font-semibold text-[#333333]">{{ monthLabel }}</span>
        <button
          class="focus-ring flex h-9 w-9 items-center justify-center rounded text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#5f6368]"
          type="button"
          aria-label="다음 달"
          :disabled="isCurrentMonth"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <ol v-if="loading" class="divide-y divide-[#dadce0] animate-pulse">
        <li
          v-for="n in 5"
          :key="n"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div class="h-9 w-9 shrink-0 rounded-lg bg-[#f5f6f7]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-2/3 rounded bg-[#f5f6f7]"></div>
            <div class="h-3 w-1/3 rounded bg-[#f5f6f7]"></div>
          </div>
          <div class="h-5 w-10 shrink-0 rounded bg-[#f5f6f7]"></div>
        </li>
      </ol>
      <p v-else-if="errorMessage" class="py-8 text-center text-[15px] font-semibold text-[#e74c3c]">
        {{ errorMessage }}
      </p>
      <div v-else-if="rankings.length === 0" class="py-12 text-center">
        <p class="text-[15px] text-[#333333]">{{ emptyMessage }}</p>
        <p class="mt-1 text-[13px] text-[#5f6368]">모임에 참여하고 인증하면 포인트가 쌓여요.</p>
      </div>

      <ol v-else class="divide-y divide-[#dadce0]">
        <li
          v-for="user in rankings"
          :key="user.id"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span
            v-if="user.rank === 1"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#03C75A] text-white"
          >
            <Crown :size="16" />
          </span>
          <span
            v-else
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            :class="user.rank <= 3 ? 'bg-[#03C75A] text-white' : 'bg-[#f5f6f7] text-[#5f6368]'"
          >
            {{ user.rank }}
          </span>

          <div class="min-w-0 flex-1">
            <p
              class="truncate text-[#333333]"
              :class="user.rank === 1 ? 'text-[17px] font-bold' : user.rank <= 3 ? 'text-[15px] font-semibold' : 'text-[14px] font-medium'"
            >
              {{ user.nickname }}
            </p>
            <p class="mt-0.5 text-[12px] font-medium text-[#5f6368]">스터디 인증 포인트</p>
          </div>

          <strong
            class="shrink-0 font-bold"
            :class="user.rank === 1 ? 'text-[17px] text-[#03C75A]' : 'text-base text-[#333333]'"
          >
            {{ user.points }}점
          </strong>
        </li>
      </ol>
    </section>

    <!-- 주사위 TOP 5 -->
    <section class="rounded-xl border border-[#dadce0] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <Dices :size="18" class="text-[#03C75A]" />
        <h3 class="text-[15px] font-semibold text-[#333333]">주사위 TOP 5</h3>
      </div>

      <ol v-if="diceLoading" class="divide-y divide-[#dadce0] animate-pulse">
        <li v-for="n in 5" :key="n" class="flex min-h-[52px] items-center gap-4 py-3 first:pt-0 last:pb-0">
          <div class="h-8 w-8 shrink-0 rounded-lg bg-[#f5f6f7]"></div>
          <div class="h-4 flex-1 rounded bg-[#f5f6f7]"></div>
          <div class="h-4 w-12 shrink-0 rounded bg-[#f5f6f7]"></div>
        </li>
      </ol>

      <div v-else-if="diceRanking.length === 0" class="py-8 text-center">
        <p class="text-[15px] text-[#333333]">아직 주사위를 굴린 사람이 없습니다.</p>
        <p class="mt-1 text-[13px] text-[#5f6368]">더보기 → 주사위에서 굴려보세요!</p>
      </div>

      <ol v-else class="divide-y divide-[#dadce0]">
        <li
          v-for="user in diceRanking"
          :key="user.id"
          class="flex min-h-[52px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold"
            :class="user.rank === 1 ? 'bg-[#03C75A] text-white' : user.rank <= 3 ? 'bg-[#03C75A]/15 text-[#02b350]' : 'bg-[#f5f6f7] text-[#5f6368]'"
          >
            <Crown v-if="user.rank === 1" :size="14" />
            <template v-else>{{ user.rank }}</template>
          </span>

          <p class="min-w-0 flex-1 truncate text-[14px] font-medium text-[#333333]">{{ user.nickname }}</p>

          <strong class="shrink-0 text-[14px] font-bold" :class="user.rank === 1 ? 'text-[#03C75A]' : 'text-[#333333]'">
            {{ user.points }}점
          </strong>
        </li>
      </ol>
    </section>
  </section>
</template>
