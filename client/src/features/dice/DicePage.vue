<script setup>
import { ref } from 'vue';
import { Dices } from '@lucide/vue';

// Throwaway demo feature: a real-looking 3D dice via CSS transforms (no libs).
// It has no `primary` flag in the registry, so it lands in the 더보기 sheet.
const SIZE = 112;
const HALF = SIZE / 2;

// 3x3 pip slots filled per value (slots 0..8, left-to-right, top-to-bottom).
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// The six faces of the cube: which value they show + their placement transform.
// Opposite faces sum to 7, like a real die.
const FACES = [
  { value: 1, transform: `translateZ(${HALF}px)` },
  { value: 6, transform: `rotateY(180deg) translateZ(${HALF}px)` },
  { value: 3, transform: `rotateY(90deg) translateZ(${HALF}px)` },
  { value: 4, transform: `rotateY(-90deg) translateZ(${HALF}px)` },
  { value: 2, transform: `rotateX(90deg) translateZ(${HALF}px)` },
  { value: 5, transform: `rotateX(-90deg) translateZ(${HALF}px)` },
];

// Cube rotation (inverse of each face transform) that brings a value to the front.
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

// Spin counters only ever increase, so the cube always tumbles forward and
// settles on a multiple of 360 plus the target face — landing on the right value.
let spinX = 0;
let spinY = 0;

function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function roll() {
  if (rolling.value) return;
  rolling.value = true;

  const value = rand(1, 6);
  const rest = REST[value];
  spinX += rand(3, 5);
  spinY += rand(4, 6);
  rotX.value = rest.x + 360 * spinX;
  rotY.value = rest.y + 360 * spinY;
  result.value = value;

  setTimeout(() => {
    rolling.value = false;
  }, 1200);
}

function isFilled(value, slot) {
  return PIPS[value].includes(slot);
}
</script>

<template>
  <section class="grid gap-5">
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-4 flex items-center gap-2">
        <Dices :size="18" class="text-[#16A34A]" />
        <h3 class="text-lg font-semibold text-[#191F28]">주사위</h3>
      </div>
      <p class="mb-8 text-[15px] leading-7 text-[#8B95A1]">
        더보기로 들어가는 예시 기능입니다. 레지스트리에 <code>primary</code> 플래그가 없으면
        핵심 탭을 밀어내지 않고 여기로 모입니다.
      </p>

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

        <p class="text-[15px] font-semibold text-[#8B95A1]">
          결과 <span class="ml-1 text-lg text-[#191F28]">{{ rolling ? '…' : result }}</span>
        </p>

        <button
          class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-[15px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          type="button"
          :disabled="rolling"
          @click="roll"
        >
          <Dices :size="18" />
          굴리기
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
  /* Faces are grown 2px past the cube edges so neighbours overlap, hiding the
     tiny gaps that rounded corners would otherwise leave at each cube vertex. */
  inset: -2px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  padding: 14px;
  border: 1px solid #e5e8eb;
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
  background: #191f28;
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
