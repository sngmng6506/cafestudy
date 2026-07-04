<script setup>
import { onMounted, ref } from 'vue';
import { Dices } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { useCurrentUser } from '../../shared/useCurrentUser.js';

const { currentUserId } = useCurrentUser();

const SIZE = 112;
const HALF = SIZE / 2;

const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const FACES = [
  { value: 1, transform: `translateZ(${HALF}px)` },
  { value: 6, transform: `rotateY(180deg) translateZ(${HALF}px)` },
  { value: 3, transform: `rotateY(90deg) translateZ(${HALF}px)` },
  { value: 4, transform: `rotateY(-90deg) translateZ(${HALF}px)` },
  { value: 2, transform: `rotateX(90deg) translateZ(${HALF}px)` },
  { value: 5, transform: `rotateX(-90deg) translateZ(${HALF}px)` },
];

const REST = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: -180 },
};

const result = ref(1);
const rolling = ref(false);
const rotX = ref(0);
const rotY = ref(0);
const myPoints = ref(null);
const lastEarned = ref(null);
const apiPending = ref(false);
const rollError = ref('');

let spinX = 0;
let spinY = 0;
let rollTimer = null;

onMounted(async () => {
  if (currentUserId.value) {
    try {
      const body = await apiFetch('/api/dice/my-points');
      myPoints.value = body.data.points;
    } catch {
      // 포인트 로드 실패는 무시
    }
  }
});

function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function roll() {
  if (rolling.value || apiPending.value) return;

  lastEarned.value = null;
  rollError.value = '';
  rolling.value = true;
  apiPending.value = true;

  let serverValue = rand(1, 6);
  let nextPoints = myPoints.value;
  let nextEarned = null;
  let nextError = '';
  try {
    const body = await apiFetch('/api/dice/roll', { method: 'POST' });
    serverValue = body.data.value;
    nextPoints = body.data.totalPoints;
    nextEarned = body.data.earned;
  } catch (err) {
    nextError = err.message ?? '포인트 적립에 실패했습니다.';
  } finally {
    apiPending.value = false;
  }

  const rest = REST[serverValue];
  spinX += rand(3, 5);
  spinY += rand(4, 6);
  rotX.value = rest.x + 360 * spinX;
  rotY.value = rest.y + 360 * spinY;
  result.value = serverValue;

  clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    myPoints.value = nextPoints;
    lastEarned.value = nextEarned;
    rollError.value = nextError;
    rolling.value = false;
  }, 1200);
}

function isFilled(value, slot) {
  return PIPS[value].includes(slot);
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">주사위</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">굴릴수록 포인트가 쌓입니다</p>
    </div>

    <section class="surface-card">
      <div class="flex flex-col items-center gap-8 pb-2">
        <div class="scene">
          <div
            class="cube"
            :class="{ rolling }"
            :style="{ transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }"
          >
            <div v-for="face in FACES" :key="face.value" class="face" :style="{ transform: face.transform }">
              <span v-for="slot in 9" :key="slot" class="pip-slot">
                <span v-if="isFilled(face.value, slot - 1)" class="pip"></span>
              </span>
            </div>
          </div>
          <div class="floor-shadow" :class="{ rolling }"></div>
        </div>

        <!-- 결과 + 획득 포인트 -->
        <div class="flex flex-col items-center gap-1">
          <p class="text-[15px] font-semibold text-[#5f6368]">
            결과 <span class="ml-1 text-lg text-[#333333]">{{ rolling ? '…' : result }}</span>
          </p>
          <p v-if="lastEarned !== null && !rolling" class="text-[13px] font-semibold text-[#03C75A]">
            +{{ lastEarned }}점 획득!
          </p>
          <p v-else-if="rollError && !rolling" class="text-[13px] font-semibold text-[#e74c3c]">
            {{ rollError }}
          </p>
        </div>

        <!-- 내 누적 주사위 포인트 -->
        <div v-if="myPoints !== null" class="w-full rounded-lg bg-[#f5f6f7] px-4 py-3 text-center">
          <p class="text-[13px] text-[#5f6368]">내 주사위 포인트</p>
          <p class="mt-0.5 text-[22px] font-bold text-[#333333]">{{ myPoints }}<span class="ml-1 text-[14px] font-medium text-[#5f6368]">점</span></p>
        </div>

        <button
          class="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-50"
          type="button"
          :disabled="rolling || apiPending"
          @click="roll"
        >
          <Dices :size="18" />
          {{ rolling ? '굴리는 중…' : '굴리기' }}
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.scene {
  position: relative;
  width: 112px;
  height: 112px;
  perspective: 700px;
}

.cube {
  position: relative;
  width: 112px;
  height: 112px;
  transform-style: preserve-3d;
  transition: transform 1.15s cubic-bezier(0.22, 0.85, 0.28, 1);
  will-change: transform;
}

.face {
  position: absolute;
  inset: -2px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  padding: 14px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: inset 0 0 14px rgba(25, 31, 40, 0.08);
}

.pip-slot {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pip {
  width: 17px;
  height: 17px;
  border-radius: 9999px;
  background: #333333;
  box-shadow: inset 0 -2px 2px rgba(25, 31, 40, 0.35);
}

.floor-shadow {
  position: absolute;
  left: 50%;
  bottom: -22px;
  width: 96px;
  height: 18px;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: rgba(25, 31, 40, 0.18);
  filter: blur(7px);
  transition: opacity 1.15s ease, width 1.15s ease;
}

.floor-shadow.rolling {
  width: 70px;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .cube {
    transition: none;
  }
}
</style>
