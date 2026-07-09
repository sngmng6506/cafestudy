<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { apiFetch } from './api.js';

const emit = defineEmits(['refreshed']);

const loading = ref(false);
const remainingMs = ref(0);
const errorMessage = ref('');
let ticker = null;

const onCooldown = computed(() => remainingMs.value > 0);
const disabled = computed(() => loading.value || onCooldown.value);

// mm:ss 포맷 (쿨타임 남은 시간)
const countdown = computed(() => {
  const total = Math.ceil(remainingMs.value / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

const label = computed(() => {
  if (loading.value) return '갱신 중…';
  if (onCooldown.value) return `${countdown.value} 후 가능`;
  return '정모 새로고침';
});

// 남은 시간을 1초마다 깎는 로컬 타이머. 서버가 준 remainingMs를 기준으로 시작.
function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    remainingMs.value = Math.max(0, remainingMs.value - 1000);
    if (remainingMs.value === 0) stopTicker();
  }, 1000);
}
function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function loadStatus() {
  try {
    const { data } = await apiFetch('/api/members/refresh-status');
    remainingMs.value = data.remainingMs ?? 0;
    if (onCooldown.value) startTicker();
  } catch {
    // 상태 조회 실패는 조용히 무시 (버튼은 활성 상태로 둠)
  }
}

async function refresh() {
  if (disabled.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data } = await apiFetch('/api/members/refresh', { method: 'POST' });
    remainingMs.value = data.remainingMs ?? 0;
    if (onCooldown.value) startTicker();

    if (data.status === 'ok') {
      emit('refreshed'); // 부모가 정모 목록 다시 불러오게
    } else if (data.status === 'cooldown') {
      errorMessage.value = '잠시 후 다시 시도해주세요.';
    } else if (data.status === 'in_progress') {
      errorMessage.value = '이미 갱신 중입니다.';
    }
  } catch (err) {
    errorMessage.value = err.message ?? '갱신에 실패했습니다.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadStatus);
onUnmounted(stopTicker);
</script>

<template>
  <div class="flex flex-col items-end gap-1">
    <button
      type="button"
      class="focus-ring inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#dadce0] bg-white px-3 text-[13px] font-semibold text-[#5f6368] transition hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      @click="refresh"
    >
      <RefreshCw :size="15" :class="loading ? 'animate-spin' : ''" />
      {{ label }}
    </button>
    <p v-if="errorMessage" class="text-[11px] text-[#e74c3c]">{{ errorMessage }}</p>
  </div>
</template>
