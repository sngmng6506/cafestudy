<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RotateCcw } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const SIZE = 4;

// 보드: 길이 16 배열, 0은 빈 칸. 각 타일은 { id, value } 객체거나 0.
const board = ref([]);
const score = ref(0);
const best = ref(0);
const won = ref(false);
const over = ref(false);
let nextId = 1;

const submitting = ref(false);
let submitted = false; // 한 판당 한 번만 제출

function emptyCells(cells) {
  const out = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === 0) out.push(i);
  return out;
}

function spawn(cells) {
  const empties = emptyCells(cells);
  if (empties.length === 0) return;
  const idx = empties[Math.floor(Math.random() * empties.length)];
  cells[idx] = { id: nextId++, value: Math.random() < 0.9 ? 2 : 4 };
}

function reset() {
  const cells = Array(SIZE * SIZE).fill(0);
  spawn(cells);
  spawn(cells);
  board.value = cells;
  score.value = 0;
  won.value = false;
  over.value = false;
  submitted = false;
}

// 한 줄(길이 4)을 왼쪽으로 밀고 병합. 병합된 점수를 반환.
function collapseRow(row) {
  const tiles = row.filter((c) => c !== 0);
  const result = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
      const merged = { id: tiles[i].id, value: tiles[i].value * 2 };
      result.push(merged);
      gained += merged.value;
      if (merged.value === 2048) won.value = true;
      i++; // 다음 타일은 이미 병합됨
    } else {
      result.push(tiles[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { row: result, gained };
}

// 방향별로 보드를 줄 단위로 뽑아 collapse 후 되돌린다.
function move(dir) {
  if (over.value) return;
  const cells = board.value.map((c) => c);
  let moved = false;
  let gained = 0;

  const lines = [];
  for (let i = 0; i < SIZE; i++) {
    const line = [];
    for (let j = 0; j < SIZE; j++) {
      let idx;
      if (dir === 'left') idx = i * SIZE + j;
      else if (dir === 'right') idx = i * SIZE + (SIZE - 1 - j);
      else if (dir === 'up') idx = j * SIZE + i;
      else idx = (SIZE - 1 - j) * SIZE + i; // down
      line.push(idx);
    }
    lines.push(line);
  }

  for (const line of lines) {
    const row = line.map((idx) => cells[idx]);
    const { row: collapsed, gained: g } = collapseRow(row);
    gained += g;
    for (let k = 0; k < SIZE; k++) {
      if (cells[line[k]] !== collapsed[k]) moved = true;
      cells[line[k]] = collapsed[k];
    }
  }

  if (!moved) return;
  spawn(cells);
  board.value = cells;
  score.value += gained;
  if (score.value > best.value) best.value = score.value;
  if (!hasMoves(cells)) {
    over.value = true;
    submitScore();
    clearSavedState();
  }
}

// 게임오버 시 점수를 서버에 제출하고 랭킹을 갱신. 한 판당 한 번만.
async function submitScore() {
  if (submitted || score.value <= 0) return;
  submitted = true;
  submitting.value = true;
  try {
    const { data } = await apiFetch('/api/game2048/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: score.value }),
    });
    if (typeof data?.bestScore === 'number') best.value = data.bestScore;
  } catch {
    // 제출 실패는 게임 흐름을 막지 않는다(로그인 안 됨 등). 조용히 무시.
  } finally {
    submitting.value = false;
  }
}

function hasMoves(cells) {
  if (emptyCells(cells).length > 0) return true;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const v = cells[i * SIZE + j].value;
      if (j + 1 < SIZE && cells[i * SIZE + j + 1].value === v) return true;
      if (i + 1 < SIZE && cells[(i + 1) * SIZE + j].value === v) return true;
    }
  }
  return false;
}

// 타일 색: 값이 커질수록 초록이 진해지는 브랜드 팔레트.
const TILE_STYLES = {
  2: { bg: '#eef7f0', fg: '#5f6368' },
  4: { bg: '#dcefe1', fg: '#5f6368' },
  8: { bg: '#a8e0bb', fg: '#1f5130' },
  16: { bg: '#7fd39c', fg: '#14351f' },
  32: { bg: '#57c67e', fg: '#0c2413' },
  64: { bg: '#2fb85f', fg: '#ffffff' },
  128: { bg: '#03c75a', fg: '#ffffff' },
  256: { bg: '#03b152', fg: '#ffffff' },
  512: { bg: '#029b48', fg: '#ffffff' },
  1024: { bg: '#02853e', fg: '#ffffff' },
  2048: { bg: '#016f34', fg: '#ffffff' },
};
function tileStyle(value) {
  const s = TILE_STYLES[value] || { bg: '#016f34', fg: '#ffffff' };
  const size = value >= 1024 ? '20px' : value >= 128 ? '24px' : '28px';
  return { background: s.bg, color: s.fg, fontSize: size };
}

// --- 입력: 키보드 + 터치 스와이프 ---
function onKey(e) {
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const dir = map[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
}

let touchX = 0;
let touchY = 0;
function onTouchStart(e) {
  touchX = e.changedTouches[0].clientX;
  touchY = e.changedTouches[0].clientY;
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 24) return; // 너무 작은 이동은 무시
  if (absX > absY) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
}

async function loadMyBest() {
  try {
    const { data } = await apiFetch('/api/game2048/my-best');
    if (typeof data?.bestScore === 'number') best.value = data.bestScore;
  } catch {
    // 로그인 안 됐거나 기록 없음 — 0 유지
  }
}

// 저장된 게임 상태가 있으면 복원, 없으면 새 게임. true면 복원됨.
async function restoreOrNew() {
  try {
    const { data } = await apiFetch('/api/game2048/state');
    const s = data?.savedState;
    if (s && Array.isArray(s.board) && s.board.length === 16) {
      board.value = s.board;
      score.value = s.score ?? 0;
      won.value = false;
      over.value = false;
      submitted = false;
      // 복원한 타일들의 id와 겹치지 않게 nextId를 최대값+1로 맞춘다.
      const maxId = s.board.reduce((m, c) => (c && c.id > m ? c.id : m), 0);
      nextId = maxId + 1;
      return true;
    }
  } catch {
    // 로그인 안 됨/저장 없음 — 새 게임으로
  }
  reset();
  return false;
}

// 진행 중인 게임 상태를 서버에 저장(페이지 이탈 시). 게임오버면 저장 안 함.
async function saveState() {
  if (over.value || score.value <= 0) return;
  try {
    await apiFetch('/api/game2048/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { board: board.value, score: score.value } }),
    });
  } catch {
    // 저장 실패는 무시(로그인 안 됨 등)
  }
}

// 저장 상태 삭제(게임오버 시 — 이어할 게 없으므로).
async function clearSavedState() {
  try {
    await apiFetch('/api/game2048/state', { method: 'DELETE' });
  } catch {
    // 무시
  }
}

// beforeunload: 탭 닫기/새로고침 시에도 저장 시도(sendBeacon은 인증 헤더가
// 안 실려 일반 fetch keepalive 사용).
function onBeforeUnload() {
  saveState();
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
  await restoreOrNew();
  loadMyBest();
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('beforeunload', onBeforeUnload);
  saveState(); // 탭 내 화면 전환 시 저장
});

const displayScore = computed(() => score.value.toLocaleString());
const displayBest = computed(() => best.value.toLocaleString());
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">2048</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">같은 숫자를 합쳐 2048을 만들어보세요.</p>
    </div>

    <section class="surface-card">
      <!-- 점수판 -->
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="flex gap-2">
          <div class="rounded-[10px] bg-[#f5f6f7] px-4 py-2 text-center">
            <div class="text-[11px] font-semibold text-[#999999]">점수</div>
            <div class="text-[18px] font-bold text-[#333333]">{{ displayScore }}</div>
          </div>
          <div class="rounded-[10px] bg-[#f5f6f7] px-4 py-2 text-center">
            <div class="text-[11px] font-semibold text-[#999999]">최고</div>
            <div class="text-[18px] font-bold text-[#03883f]">{{ displayBest }}</div>
          </div>
        </div>
        <button
          type="button"
          class="focus-ring inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#dadce0] bg-white px-3 text-[13px] font-semibold text-[#5f6368] transition hover:bg-[#f5f6f7]"
          @click="reset"
        >
          <RotateCcw :size="15" /> 새 게임
        </button>
      </div>

      <!-- 보드 -->
      <div
        class="relative mx-auto w-full max-w-[360px] touch-none select-none rounded-[12px] bg-[#eef0f2] p-2.5"
        @touchstart.passive="onTouchStart"
        @touchend="onTouchEnd"
      >
        <div class="grid grid-cols-4 gap-2.5">
          <div
            v-for="(cell, i) in board"
            :key="i"
            class="flex aspect-square items-center justify-center rounded-[8px] bg-[#f7f8f9]"
          >
            <div
              v-if="cell !== 0"
              class="flex h-full w-full items-center justify-center rounded-[8px] font-bold tile-pop"
              :style="tileStyle(cell.value)"
            >
              {{ cell.value }}
            </div>
          </div>
        </div>

        <!-- 게임 오버 / 승리 오버레이 -->
        <div
          v-if="over || won"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[12px] bg-white/85"
        >
          <p class="text-[20px] font-bold text-[#333333]">
            {{ won ? '2048 달성! 🎉' : '게임 오버' }}
          </p>
          <button
            type="button"
            class="focus-ring rounded-[10px] bg-[#03C75A] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#02b350]"
            @click="reset"
          >
            다시 하기
          </button>
          <button
            v-if="won"
            type="button"
            class="text-[13px] font-semibold text-[#5f6368] underline"
            @click="won = false"
          >
            계속 이어서 하기
          </button>
        </div>
      </div>

      <p class="mt-4 text-center text-[13px] text-[#999999]">
        방향키 또는 스와이프로 타일을 밀어보세요.
      </p>
    </section>
  </section>
</template>

<style scoped>
.tile-pop {
  animation: tile-pop 120ms ease-out;
}
@keyframes tile-pop {
  0% {
    transform: scale(0.85);
  }
  100% {
    transform: scale(1);
  }
}
</style>
