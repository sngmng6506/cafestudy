<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Crown, Dices, Gamepad2, Trophy } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { createLatestRequestGuard } from '../../shared/latest-request.js';
import UserAvatar from '../../shared/UserAvatar.vue';

const now = new Date();
const CURRENT = { year: now.getFullYear(), month: now.getMonth() + 1 };

const mode = ref('monthly');
const rankings = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const diceRanking = ref([]);
const diceLoading = ref(true);
const game2048Ranking = ref([]);
const game2048Loading = ref(true);
const cursor = ref({ ...CURRENT });
const rankingRequestGuard = createLatestRequestGuard();

// 미니게임 랭킹 캐러셀: 좌우 스와이프(또는 점 탭)로 주사위 ↔ 2048 전환.
const miniGames = ['dice', 'game2048'];
const miniIndex = ref(0);
const currentMini = computed(() =>
  miniGames[miniIndex.value] === 'dice'
    ? {
        key: 'dice',
        title: '주사위 TOP 5',
        loading: diceLoading.value,
        rows: diceRanking.value,
        empty: ['아직 주사위를 굴린 사람이 없어요.', '더보기 → 주사위에서 굴려 보세요.'],
        valueOf: (u) => `${u.points}점`,
      }
    : {
        key: 'game2048',
        title: '2048 TOP 5',
        loading: game2048Loading.value,
        rows: game2048Ranking.value,
        empty: ['아직 2048 기록이 없어요.', '더보기 → 2048에서 도전해 보세요.'],
        valueOf: (u) => u.bestScore.toLocaleString(),
      },
);
function goMini(i) {
  miniIndex.value = (i + miniGames.length) % miniGames.length;
}
let miniTouchX = 0;
function onMiniTouchStart(e) {
  miniTouchX = e.changedTouches[0].clientX;
}
function onMiniTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - miniTouchX;
  if (Math.abs(dx) < 40) return;
  goMini(miniIndex.value + (dx < 0 ? 1 : -1));
}

const TITLES = { monthly: '월간 랭킹', 'all-time': '누적 랭킹', attendance: '정모 참석' };
const title = computed(() => TITLES[mode.value]);
// 참석은 소모임 앱의 기록이라 포인트와 집계 출처가 다르다. 어디서 온 숫자인지
// 밝혀두지 않으면 "인증했는데 왜 안 오르지"가 된다.
const subtitle = computed(() => (mode.value === 'attendance'
  ? '소모임 앱에 기록된 정모 참석 횟수예요.'
  : '인증으로 쌓은 포인트 순이에요.'));
// 참석 모드는 월을 고르지 않으면 전체 기간이다.
const showsMonthNav = computed(() => mode.value === 'monthly' || mode.value === 'attendance');
const monthLabel = computed(() => `${cursor.value.year}년 ${cursor.value.month}월`);
const isCurrentMonth = computed(
  () => cursor.value.year === CURRENT.year && cursor.value.month === CURRENT.month,
);
const emptyMessage = computed(() => {
  if (mode.value === 'attendance') return '이 달에 기록된 정모 참석이 없어요.';
  if (mode.value === 'monthly') return '이 달에 쌓은 포인트가 아직 없어요.';
  return '아직 포인트를 모은 멤버가 없어요.';
});

onMounted(() => {
  void loadRanking();
  void loadDiceRanking();
  void loadGame2048Ranking();
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

async function loadGame2048Ranking() {
  game2048Loading.value = true;
  try {
    const body = await apiFetch('/api/game2048/ranking');
    game2048Ranking.value = (body.data ?? []).slice(0, 5);
  } catch {
    game2048Ranking.value = [];
  } finally {
    game2048Loading.value = false;
  }
}

async function switchMode(nextMode) {
  mode.value = nextMode;
  if (nextMode !== 'all-time') cursor.value = { ...CURRENT };
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
  const requestId = rankingRequestGuard.begin();
  loading.value = true;
  errorMessage.value = '';

  try {
    const month = `year=${cursor.value.year}&month=${cursor.value.month}`;
    const endpoint = {
      monthly: `/api/ranking/monthly?${month}`,
      attendance: `/api/ranking/attendance?${month}`,
      'all-time': '/api/ranking/all-time',
    }[mode.value];
    const body = await apiFetch(endpoint);
    if (!rankingRequestGuard.isCurrent(requestId)) return;
    rankings.value = body.data;
  } catch (error) {
    if (!rankingRequestGuard.isCurrent(requestId)) return;
    errorMessage.value = error.message;
  } finally {
    if (rankingRequestGuard.isCurrent(requestId)) loading.value = false;
  }
}
</script>

<template>
  <section class="grid gap-5">
    <section class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <Trophy :size="18" class="text-[var(--ui-color-brand)]" />
        <p class="text-[14px] text-[var(--ui-color-content-muted)]">{{ subtitle }}</p>
      </div>

      <div class="mb-5 grid grid-cols-3 rounded-xl border border-[var(--ui-color-stroke)] bg-[var(--ui-color-surface-subtle)] p-1">
        <button
          class="focus-ring h-11 rounded text-[15px] font-semibold ui-transition-colors"
          :class="mode === 'monthly' ? 'bg-[var(--ui-color-brand)] text-white shadow-sm' : 'text-[var(--ui-color-content-muted)]'"
          type="button"
          @click="switchMode('monthly')"
        >
          월간
        </button>
        <button
          class="focus-ring h-11 rounded text-[15px] font-semibold ui-transition-colors"
          :class="mode === 'all-time' ? 'bg-[var(--ui-color-brand)] text-white shadow-sm' : 'text-[var(--ui-color-content-muted)]'"
          type="button"
          @click="switchMode('all-time')"
        >
          누적
        </button>
        <button
          class="focus-ring h-11 rounded text-[15px] font-semibold ui-transition-colors"
          :class="mode === 'attendance' ? 'bg-[var(--ui-color-brand)] text-white shadow-sm' : 'text-[var(--ui-color-content-muted)]'"
          type="button"
          @click="switchMode('attendance')"
        >
          참석
        </button>
      </div>

      <div v-if="showsMonthNav" class="mb-5 flex items-center justify-center gap-2">
        <button
          class="focus-ring flex h-11 w-11 items-center justify-center rounded text-[var(--ui-color-content-muted)] ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)]"
          type="button"
          aria-label="이전 달"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <span class="min-w-[100px] text-center text-[15px] font-semibold text-[var(--ui-color-content)]">{{ monthLabel }}</span>
        <button
          class="focus-ring flex h-11 w-11 items-center justify-center rounded text-[var(--ui-color-content-muted)] ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)] hover:text-[var(--ui-color-content)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ui-color-content-muted)]"
          type="button"
          aria-label="다음 달"
          :disabled="isCurrentMonth"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <ol v-if="loading" class="divide-y divide-[var(--ui-color-stroke)] animate-pulse">
        <li
          v-for="n in 5"
          :key="n"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div class="h-9 w-9 shrink-0 rounded-lg bg-[var(--ui-color-surface-subtle)]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-2/3 rounded bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-3 w-1/3 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          </div>
          <div class="h-5 w-10 shrink-0 rounded bg-[var(--ui-color-surface-subtle)]"></div>
        </li>
      </ol>
      <p v-else-if="errorMessage" class="py-8 text-center text-[15px] font-semibold text-[var(--ui-color-destructive)]">
        {{ errorMessage }}
      </p>
      <div v-else-if="rankings.length === 0" class="py-12 text-center">
        <p class="text-[15px] text-[var(--ui-color-content)]">{{ emptyMessage }}</p>
        <p class="mt-1 text-[13px] text-[var(--ui-color-content-muted)]">모임에 참여하고 인증하면 포인트가 쌓여요.</p>
      </div>

      <ol v-else class="divide-y divide-[var(--ui-color-stroke)]">
        <li
          v-for="user in rankings"
          :key="user.id"
          class="flex min-h-[56px] items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span
            v-if="user.rank === 1"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-color-brand)] text-white"
          >
            <Crown :size="16" />
          </span>
          <span
            v-else
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            :class="user.rank <= 3 ? 'bg-[var(--ui-color-brand)] text-white' : 'bg-[var(--ui-color-surface-subtle)] text-[var(--ui-color-content-muted)]'"
          >
            {{ user.rank }}
          </span>

          <div class="min-w-0 flex-1">
            <p
              class="flex items-center gap-1.5 truncate text-[var(--ui-color-content)]"
              :class="user.rank === 1 ? 'text-[17px] font-bold' : user.rank <= 3 ? 'text-[15px] font-semibold' : 'text-[14px] font-medium'"
            >
              <UserAvatar
                class="h-6 w-6"
                :name="user.nickname"
                :image-url="user.activeBadgeImageUrl ?? ''"
                :fallback="false"
              />
              <span class="truncate">{{ user.nickname }}</span>
            </p>
            <p class="mt-0.5 text-[12px] font-medium text-[var(--ui-color-content-muted)]">스터디 인증 포인트</p>
          </div>

          <strong
            class="shrink-0 font-bold"
            :class="user.rank === 1 ? 'text-[17px] text-[var(--ui-color-brand)]' : 'text-base text-[var(--ui-color-content)]'"
          >
            {{ mode === 'attendance' ? `${user.attendedCount}회` : `${user.points}점` }}
          </strong>
        </li>
      </ol>
    </section>

    <!-- 미니게임 랭킹 (좌우 스와이프로 주사위 ↔ 2048 전환) -->
    <section class="surface-card">
      <div class="mb-5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Dices v-if="currentMini.key === 'dice'" :size="18" class="text-[var(--ui-color-brand)]" />
          <Gamepad2 v-else :size="18" class="text-[var(--ui-color-brand)]" />
          <h3 class="text-[15px] font-semibold text-[var(--ui-color-content)]">{{ currentMini.title }}</h3>
        </div>
        <!-- 페이지 인디케이터 (탭도 가능) -->
        <div class="flex items-center gap-1.5">
          <button
            v-for="(g, i) in miniGames"
            :key="g"
            type="button"
            class="ui-indicator-transition h-2 rounded-full"
            :class="i === miniIndex ? 'w-5 bg-[var(--ui-color-brand)]' : 'w-2 bg-[var(--ui-color-stroke)]'"
            :aria-label="`${i + 1}번째 랭킹`"
            @click="goMini(i)"
          ></button>
        </div>
      </div>

      <div @touchstart.passive="onMiniTouchStart" @touchend="onMiniTouchEnd">
        <ol v-if="currentMini.loading" class="divide-y divide-[var(--ui-color-stroke)] animate-pulse">
          <li v-for="n in 5" :key="n" class="flex min-h-[52px] items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div class="h-8 w-8 shrink-0 rounded-lg bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-4 flex-1 rounded bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-4 w-12 shrink-0 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          </li>
        </ol>

        <div v-else-if="currentMini.rows.length === 0" class="py-8 text-center">
          <p class="text-[15px] text-[var(--ui-color-content)]">{{ currentMini.empty[0] }}</p>
          <p class="mt-1 text-[13px] text-[var(--ui-color-content-muted)]">{{ currentMini.empty[1] }}</p>
        </div>

        <ol v-else class="divide-y divide-[var(--ui-color-stroke)]">
          <li
            v-for="user in currentMini.rows"
            :key="user.id"
            class="flex min-h-[52px] items-center gap-4 py-3 first:pt-0 last:pb-0"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold"
              :class="user.rank === 1 ? 'bg-[var(--ui-color-brand)] text-white' : user.rank <= 3 ? 'bg-[var(--ui-color-success-surface)] text-[var(--ui-color-brand-hover)]' : 'bg-[var(--ui-color-surface-subtle)] text-[var(--ui-color-content-muted)]'"
            >
              <Crown v-if="user.rank === 1" :size="14" />
              <template v-else>{{ user.rank }}</template>
            </span>

            <p class="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[14px] font-medium text-[var(--ui-color-content)]">
              <UserAvatar
                class="h-6 w-6"
                :name="user.nickname"
                :image-url="user.activeBadgeImageUrl ?? ''"
                :fallback="false"
              />
              <span class="truncate">{{ user.nickname }}</span>
            </p>

            <strong class="shrink-0 text-[14px] font-bold" :class="user.rank === 1 ? 'text-[var(--ui-color-brand)]' : 'text-[var(--ui-color-content)]'">
              {{ currentMini.valueOf(user) }}
            </strong>
          </li>
        </ol>
      </div>
    </section>
  </section>
</template>
