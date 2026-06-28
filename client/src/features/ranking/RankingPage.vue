<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Crown, Trophy } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const now = new Date();
const CURRENT = { year: now.getFullYear(), month: now.getMonth() + 1 };

const mode = ref('monthly');
const rankings = ref([]);
const loading = ref(true);
const errorMessage = ref('');
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
});

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
    <div class="mb-1">
      <h1 class="text-[22px] font-bold leading-snug text-[#191F28]">랭킹</h1>
      <p class="mt-1 text-[14px] text-[#8B95A1]">포인트 기반 순위</p>
    </div>

    <section class="rounded-xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <Trophy :size="19" class="text-[#16A34A]" />
        <p class="text-[14px] text-[#8B95A1]">인증으로 쌓인 포인트를 기준으로 정렬합니다.</p>
      </div>

      <div class="mb-5 grid grid-cols-2 rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-1">
        <button
          class="h-11 rounded-lg text-[15px] font-semibold transition"
          :class="mode === 'monthly' ? 'bg-[#16A34A] text-white shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('monthly')"
        >
          월간
        </button>
        <button
          class="h-11 rounded-lg text-[15px] font-semibold transition"
          :class="mode === 'all-time' ? 'bg-[#16A34A] text-white shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('all-time')"
        >
          누적
        </button>
      </div>

      <div v-if="mode === 'monthly'" class="mb-5 flex items-center justify-center gap-2">
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
          type="button"
          aria-label="이전 달"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <span class="min-w-[100px] text-center text-[15px] font-semibold text-[#191F28]">{{ monthLabel }}</span>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8B95A1]"
          type="button"
          aria-label="다음 달"
          :disabled="isCurrentMonth"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <ol v-if="loading" class="divide-y divide-[#E5E8EB] animate-pulse">
        <li
          v-for="n in 5"
          :key="n"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div class="h-9 w-9 shrink-0 rounded-lg bg-[#F1F3F5]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-2/3 rounded bg-[#F1F3F5]"></div>
            <div class="h-3 w-1/3 rounded bg-[#F1F3F5]"></div>
          </div>
          <div class="h-5 w-10 shrink-0 rounded bg-[#F1F3F5]"></div>
        </li>
      </ol>
      <p v-else-if="errorMessage" class="py-8 text-center text-[15px] font-semibold text-[#F04452]">
        {{ errorMessage }}
      </p>
      <div v-else-if="rankings.length === 0" class="py-12 text-center">
        <p class="text-[14px] text-[#191F28]">이번 달 기록이 없습니다.</p>
      </div>

      <ol v-else class="divide-y divide-[#E5E8EB]">
        <li
          v-for="user in rankings"
          :key="user.id"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span
            v-if="user.rank === 1"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#16A34A] text-white"
          >
            <Crown :size="16" />
          </span>
          <span
            v-else
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            :class="user.rank <= 3 ? 'bg-[#16A34A] text-white' : 'bg-[#F9FAFB] text-[#8B95A1]'"
          >
            {{ user.rank }}
          </span>

          <div class="min-w-0 flex-1">
            <p
              class="truncate text-[#191F28]"
              :class="user.rank === 1 ? 'text-[17px] font-bold' : user.rank <= 3 ? 'text-[15px] font-semibold' : 'text-[14px] font-medium'"
            >
              {{ user.nickname }}
            </p>
            <p class="mt-0.5 text-[12px] font-medium text-[#8B95A1]">스터디 인증 포인트</p>
          </div>

          <strong
            class="shrink-0 font-bold"
            :class="user.rank === 1 ? 'text-[17px] text-[#16A34A]' : 'text-base text-[#191F28]'"
          >
            {{ user.points }}점
          </strong>
        </li>
      </ol>
    </section>
  </section>
</template>
