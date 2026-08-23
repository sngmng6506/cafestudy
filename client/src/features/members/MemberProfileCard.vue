<script setup>
import { onMounted, ref } from 'vue';
import { Award, CalendarCheck, Camera, Crown, Users, X } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import UserAvatar from '../../shared/UserAvatar.vue';

const props = defineProps({
  member: { type: Object, required: true },
  // MembersPage가 이미 랭킹을 불러와 갖고 있으므로 재조회하지 않고 받는다.
  rank: { type: Object, default: null }, // { rank, points } | null
});

const emit = defineEmits(['close']);

const badges = ref([]);
const stats = ref(null);
const loading = ref(true);

onMounted(async () => {
  // 뱃지는 로그인해야 조회 가능(requireUser) — 실패해도 카드 자체는 보여준다.
  const [badgesBody, statsBody] = await Promise.all([
    apiFetch(`/api/badges/users/${props.member.id}`).catch(() => ({ data: [] })),
    apiFetch(`/api/members/${props.member.id}/stats`).catch(() => ({ data: null })),
  ]);
  badges.value = badgesBody.data ?? [];
  stats.value = statsBody.data;
  loading.value = false;
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')"></div>

    <div class="relative z-10 w-full max-w-sm rounded-xl bg-white px-5 pb-6 pt-5 shadow-lg">
      <button
        class="focus-ring absolute right-4 top-4 rounded p-1 text-[var(--ui-color-content-muted)] transition hover:text-[var(--ui-color-content)]"
        type="button"
        aria-label="닫기"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>

      <!-- 헤더: 아바타 + 이름 + 소개 -->
      <div class="flex items-center gap-3">
        <UserAvatar
          class="h-14 w-14 text-[20px]"
          :name="member.name"
          :image-url="member.activeBadgeImageUrl ?? ''"
        />
        <div class="min-w-0">
          <p class="flex items-center gap-1.5 text-[18px] font-bold text-[var(--ui-color-content)]">
            <span class="truncate">{{ member.name }}</span>
            <span
              v-if="rank?.rank === 1"
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ui-color-brand)]"
            >
              <Crown :size="11" class="text-white" />
            </span>
          </p>
          <p v-if="member.bio" class="truncate text-[13px] text-[var(--ui-color-content-muted)]">{{ member.bio }}</p>
        </div>
      </div>

      <!-- 활동 요약 -->
      <div class="mt-4 grid grid-cols-2 gap-2">
        <div class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2.5">
          <p class="text-[12px] font-medium text-[var(--ui-color-content-muted)]">포인트</p>
          <p class="mt-0.5 text-[15px] font-bold text-[var(--ui-color-brand)]">
            {{ rank ? `${rank.points}pt` : '-' }}
            <span v-if="rank" class="text-[12px] font-semibold text-[var(--ui-color-content-muted)]">{{ rank.rank }}위</span>
          </p>
        </div>
        <div class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2.5">
          <p class="flex items-center gap-1 text-[12px] font-medium text-[var(--ui-color-content-muted)]">
            <Camera :size="12" /> 스터디 인증
          </p>
          <p class="mt-0.5 text-[15px] font-bold text-[var(--ui-color-content)]">{{ stats ? `${stats.verifiedCount}회` : '-' }}</p>
        </div>
        <div class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2.5">
          <p class="flex items-center gap-1 text-[12px] font-medium text-[var(--ui-color-content-muted)]">
            <Users :size="12" /> 앱 모임 참여
          </p>
          <p class="mt-0.5 text-[15px] font-bold text-[var(--ui-color-content)]">{{ stats ? `${stats.meetupCount}회` : '-' }}</p>
        </div>
        <div class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2.5">
          <p class="flex items-center gap-1 text-[12px] font-medium text-[var(--ui-color-content-muted)]">
            <CalendarCheck :size="12" /> 정모 참석
          </p>
          <p class="mt-0.5 text-[15px] font-bold text-[var(--ui-color-content)]">{{ stats ? `${stats.somoimCount}회` : '-' }}</p>
        </div>
      </div>

      <!-- 뱃지 컬렉션 -->
      <div class="mt-4">
        <p class="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ui-color-content)]">
          <Award :size="14" class="text-[var(--ui-color-brand)]" /> 뱃지 컬렉션
          <span class="text-[var(--ui-color-content-muted)]">{{ loading ? '' : `${badges.length}/5` }}</span>
        </p>
        <p v-if="loading" class="text-[13px] text-[var(--ui-color-content-muted)]">불러오는 중...</p>
        <p v-else-if="badges.length === 0" class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-3 text-[13px] text-[var(--ui-color-content-muted)]">
          아직 모은 뱃지가 없어요.
        </p>
        <ul v-else class="grid grid-cols-5 gap-2">
          <li v-for="badge in badges" :key="badge.id" class="grid justify-items-center gap-1">
            <img
              class="aspect-square w-full rounded-lg border bg-[var(--ui-color-surface-subtle)] object-contain p-1"
              :class="badge.isActive ? 'border-[var(--ui-color-brand)] ring-1 ring-[var(--ui-color-brand)]' : 'border-[var(--ui-color-stroke)]'"
              :src="badge.imageViewUrl"
              :alt="badge.title"
              :title="badge.title"
            />
            <span class="w-full truncate text-center text-[10px] text-[var(--ui-color-content-muted)]">{{ badge.title }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
