<script setup>
// 더보기 기능 휠: 탭바 위로 반원이 펼쳐지고, 전체 기능이 호를 따라 배열된다.
// 드래그(마우스)/스와이프(터치)로 룰렛처럼 관성 회전하고, 돌아가는 중에
// 손을 대면 그 순간 멈추며, 멈출 때는 가장 가까운 항목이 정점(12시)으로
// 자석처럼 끌려가 정렬된다. 정점이든 아니든 항목을 탭하면 그 기능으로 이동.
// 회전 수학은 wheel-math.js(단위 테스트 있음), 여기는 입력/애니메이션만.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { normalizeAngle, snapTarget, apexIndex, itemAngle } from './wheel-math.js';

const props = defineProps({
  features: { type: Array, required: true },
  activeName: { type: String, default: '' },
});

const emit = defineEmits(['select', 'close']);

const MIN_RADIUS = 118;      // 항목이 놓이는 호의 최소 반지름(px)
const MIN_ARC_GAP = 62;      // 이웃 항목 사이 최소 호 길이(px) — 아이콘 겹침 방지
const VISIBLE_LIMIT = 98;    // 이 각도(절대값)를 넘으면 숨김
const FRICTION = 2.4;        // 관성 감속 계수(클수록 빨리 멈춤)
const SNAP_MS = 260;

const wheelEl = ref(null);
const rotation = ref(0);

// 각도 간격과 반지름 모두 기능 수에 따라 동적으로 정해진다.
// 기능이 늘어 간격이 좁아지면(호 길이 < MIN_ARC_GAP) 반지름을 키워
// 이웃 항목 사이 거리를 유지한다.
const step = computed(() => 360 / props.features.length);
const radius = computed(() => {
  const stepRad = (step.value * Math.PI) / 180;
  return Math.max(MIN_RADIUS, Math.ceil(MIN_ARC_GAP / stepRad));
});
// 반지름이 커지면 휠 영역과 배경판도 함께 커진다.
const zoneStyle = computed(() => ({ height: `${radius.value + 72}px` }));
const plateStyle = computed(() => {
  const size = 2 * (radius.value + 52);
  return { width: `${size}px`, height: `${size}px` };
});
const apexIdx = computed(() => apexIndex(rotation.value, step.value, props.features.length));

const items = computed(() =>
  props.features.map((feature, i) => {
    const angle = itemAngle(i, rotation.value, step.value);
    const rad = (angle * Math.PI) / 180;
    const visible = Math.abs(angle) <= VISIBLE_LIMIT;
    // 정점 강조는 아이콘 원에만 적용한다. 버튼과 기능명 크기는 고정해
    // 인접 항목의 흰 아이콘 배경이 라벨 위를 덮지 않게 한다.
    const nearApex = Math.max(0, 1 - Math.abs(angle) / step.value);
    const fade = Math.max(0.2, 1 - Math.max(0, Math.abs(angle) - 55) / 45);
    return {
      feature,
      isApex: i === apexIdx.value,
      style: {
        transform:
          `translate(-50%, -50%) ` +
          `translate(${(radius.value * Math.sin(rad)).toFixed(1)}px, ${(-radius.value * Math.cos(rad)).toFixed(1)}px)`,
        opacity: visible ? String(fade) : '0',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? String(Math.round(100 - Math.abs(angle))) : '0',
      },
      iconStyle: {
        transform: `scale(${(1 + 0.22 * nearApex).toFixed(3)})`,
      },
    };
  }),
);

onMounted(() => {
  // 현재 탭이 정점에서 시작하도록 초기 회전
  const idx = props.features.findIndex((f) => f.name === props.activeName);
  if (idx > 0) rotation.value = -idx * step.value;
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  stopAnimation();
  window.removeEventListener('keydown', onKeydown);
});

function onKeydown(event) {
  if (event.key === 'Escape') emit('close');
}

const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── 포인터 회전 (마우스/터치 공통) ──────────────────────────────
let dragging = false;
let lastPointerAngle = 0;
let lastMoveTime = 0;
let velocity = 0; // deg/s
let movedTotal = 0;
let downTime = 0;
let rafId = 0;

// 휠의 회전 중심: 반원 영역의 하단 중앙.
function pointerAngle(event) {
  const rect = wheelEl.value.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.bottom;
  return (Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180) / Math.PI;
}

function onPointerDown(event) {
  stopAnimation(); // 돌던 휠은 손을 대는 순간 즉시 멈춘다
  dragging = true;
  movedTotal = 0;
  velocity = 0;
  downTime = performance.now();
  lastMoveTime = downTime;
  lastPointerAngle = pointerAngle(event);
  wheelEl.value.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!dragging) return;
  const now = performance.now();
  const angle = pointerAngle(event);
  const delta = normalizeAngle(angle - lastPointerAngle);
  lastPointerAngle = angle;
  rotation.value += delta;
  movedTotal += Math.abs(delta);
  const dt = (now - lastMoveTime) / 1000;
  if (dt > 0) velocity = 0.75 * velocity + 0.25 * (delta / dt);
  lastMoveTime = now;
}

function onPointerUp(event) {
  if (!dragging) return;
  dragging = false;

  // 거의 안 움직였으면 탭 → 포인터 아래 항목으로 이동
  if (movedTotal < 4 && performance.now() - downTime < 500) {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-feature]');
    if (target) {
      emit('select', target.dataset.feature);
      return;
    }
  }

  // 잡고 멈춘 채로 놓았다면(마지막 움직임이 오래됐다면) 관성 없음
  if (performance.now() - lastMoveTime > 120) velocity = 0;

  if (reduceMotion) {
    rotation.value = snapTarget(rotation.value, step.value);
    return;
  }
  if (Math.abs(velocity) > 60) startInertia();
  else startSnap();
}

function startInertia() {
  velocity = Math.max(-1100, Math.min(1100, velocity));
  let last = performance.now();
  const frame = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    rotation.value += velocity * dt;
    velocity *= Math.exp(-FRICTION * dt);
    if (Math.abs(velocity) < 30) {
      startSnap();
      return;
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function startSnap() {
  const from = rotation.value;
  const to = snapTarget(from, step.value);
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / SNAP_MS);
    // easeOutBack: 자석에 끌려가며 살짝 지나쳤다 돌아오는 느낌
    const c = 1.4;
    const p = t - 1;
    const eased = 1 + (c + 1) * p * p * p + c * p * p;
    rotation.value = from + (to - from) * eased;
    if (t < 1) rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function stopAnimation() {
  cancelAnimationFrame(rafId);
}
</script>

<template>
  <div class="fixed inset-0 z-[60]">
    <div class="absolute inset-0 bg-[#333333]/20" @click="emit('close')"></div>

    <!-- 휠 영역: 하단 중앙이 회전 중심. overflow-hidden으로 원의 아래 반을 잘라 반원만 보인다. -->
    <div
      ref="wheelEl"
      class="absolute bottom-[68px] left-1/2 w-full max-w-md -translate-x-1/2 touch-none select-none overflow-hidden"
      :style="zoneStyle"
      role="menu"
      aria-label="기능 휠"
      @pointerdown.prevent="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <!-- 반원 배경판 -->
      <div
        class="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#dadce0] bg-white shadow-sm"
        :style="plateStyle"
      ></div>
      <!-- 정점(12시) 표시 눈금 -->
      <div class="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#03C75A]"></div>

      <button
        v-for="item in items"
        :key="item.feature.name"
        class="absolute left-1/2 top-full flex h-[68px] w-20 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] transition-colors"
        :class="item.isApex ? 'font-bold text-[#03C75A]' : 'font-medium text-[#5f6368]'"
        :style="item.style"
        :data-feature="item.feature.name"
        type="button"
        role="menuitem"
        @click="emit('select', item.feature.name)"
      >
        <span
          class="flex h-11 w-11 shrink-0 origin-center items-center justify-center rounded-full border transition-[transform,border-color,background-color] duration-150"
          :class="item.isApex ? 'border-[#03C75A] bg-[#e9f8ef]' : 'border-[#dadce0] bg-white'"
          :style="item.iconStyle"
        >
          <component :is="item.feature.icon" :size="20" />
        </span>
        <span class="relative z-10 block w-full truncate whitespace-nowrap px-0.5 leading-4">
          {{ item.feature.label }}
        </span>
      </button>
    </div>
  </div>
</template>
