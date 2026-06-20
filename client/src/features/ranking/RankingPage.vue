<script setup>
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, Trophy } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const mode = ref('all-time');
const rankings = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const title = computed(() => (mode.value === 'monthly' ? '월간 랭킹' : '누적 랭킹'));
const emptyMessage = computed(() => (
  mode.value === 'monthly'
    ? '이번 달 포인트 기록이 아직 없습니다.'
    : '아직 포인트를 얻은 사용자가 없습니다.'
));

onMounted(() => {
  void loadRanking();
});

async function switchMode(nextMode) {
  mode.value = nextMode;
  await loadRanking();
}

async function loadRanking() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const endpoint = mode.value === 'monthly' ? '/api/ranking/monthly' : '/api/ranking/all-time';
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
  <section class="mx-auto grid max-w-2xl gap-5">
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <Trophy :size="19" class="text-[#16A34A]" />
          <div>
            <h2 class="text-lg font-semibold text-[#191F28]">{{ title }}</h2>
            <p class="mt-1 text-sm font-medium text-[#8B95A1]">
              인증으로 쌓인 포인트를 기준으로 정렬합니다.
            </p>
          </div>
        </div>
        <button
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E8EB] text-[#8B95A1] transition hover:text-[#191F28]"
          type="button"
          aria-label="새로고침"
          @click="loadRanking"
        >
          <RefreshCw :size="17" />
        </button>
      </div>

      <div class="mb-5 grid grid-cols-2 rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-1">
        <button
          class="h-11 rounded-xl text-[15px] font-semibold transition"
          :class="mode === 'all-time' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('all-time')"
        >
          누적
        </button>
        <button
          class="h-11 rounded-xl text-[15px] font-semibold transition"
          :class="mode === 'monthly' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#8B95A1]'"
          type="button"
          @click="switchMode('monthly')"
        >
          월간
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
