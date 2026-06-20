<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Trophy } from '@lucide/vue';
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
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <Trophy :size="19" class="text-[#16A34A]" />
        <div>
          <h2 class="text-lg font-semibold text-[#191F28]">{{ title }}</h2>
          <p class="mt-1 text-sm font-medium text-[#8B95A1]">
            인증으로 쌓인 포인트를 기준으로 정렬합니다.
          </p>
        </div>
      </div>

      <div class="mb-5 grid grid-cols-2 rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-1">
        <button
          class="h-11 rounded-xl text-[15px] font-semibold transition"
          :class="mode === 'monthly' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('monthly')"
        >
          월간
        </button>
        <button
          class="h-11 rounded-xl text-[15px] font-semibold transition"
          :class="mode === 'all-time' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('all-time')"
        >
          누적
        </button>
      </div>

      <div v-if="mode === 'monthly'" class="mb-5 flex items-center justify-center gap-2">
        <button
          class="flex h-9 w-9 items-center justify-center rounded-xl text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
          type="button"
          aria-label="이전 달"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <span class="min-w-[100px] text-center text-[15px] font-semibold text-[#191F28]">{{ monthLabel }}</span>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-xl text-[#8B95A1] transition hover:bg-[#F9FAFB] hover:text-[#191F28] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8B95A1]"
          type="button"
          aria-label="다음 달"
          :disabled="isCurrentMonth"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <p v-if="loading" class="py-8 text-center text-[15px] text-[#8B95A1]">불러오는 중입니다.</p>
      <p v-else-if="errorMessage" class="py-8 text-center text-[15px] font-semibold text-[#F04452]">
        {{ errorMessage }}
      </p>
      <p v-else-if="rankings.length === 0" class="py-8 text-center text-[15px] text-[#8B95A1]">
        {{ emptyMessage }}
      </p>

      <ol v-else class="divide-y divide-[#E5E8EB]">
        <li
          v-for="user in rankings"
          :key="user.id"
          class="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
            :class="user.rank <= 3 ? 'bg-[#16A34A] text-white' : 'bg-[#F9FAFB] text-[#8B95A1]'"
          >
            {{ user.rank }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#191F28]">{{ user.nickname }}</p>
            <p class="mt-1 text-sm font-medium text-[#8B95A1]">스터디 인증 포인트</p>
          </div>

          <strong class="shrink-0 text-base font-bold text-[#191F28]">
            {{ user.points }}점
          </strong>
        </li>
      </ol>
    </section>
  </section>
</template>
