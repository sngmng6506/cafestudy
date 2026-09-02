<script setup>
import { computed, onMounted, ref } from 'vue';
import { Crown, Search } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import UserAvatar from '../../shared/UserAvatar.vue';
import MemberProfileCard from './MemberProfileCard.vue';

const members = ref([]);
const rankData = ref({});
const loading = ref(true);
const errorMessage = ref('');
const query = ref('');
const selectedMember = ref(null);

// 크롤링해 온 소개글에는 "." 처럼 내용이 없는 값이 섞여 있다.
// 그대로 렌더하면 행마다 두 줄/한 줄이 뒤섞여 목록 리듬이 흐트러진다.
const EMPTY_BIO = /^[.,·・\-_~\s]*$/;

function displayBio(member) {
  const bio = (member.bio ?? '').trim();
  return EMPTY_BIO.test(bio) ? '' : bio;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter(
    (m) => m.name.toLowerCase().includes(q) || m.bio?.toLowerCase().includes(q),
  );
});

onMounted(async () => {
  try {
    const [membersBody, rankingBody] = await Promise.all([
      apiFetch('/api/members'),
      apiFetch('/api/ranking/all-time').catch(() => ({ data: [] })),
    ]);
    members.value = membersBody.data;
    const map = {};
    for (const entry of rankingBody.data) {
      map[entry.id] = { rank: entry.rank, points: entry.points };
    }
    rankData.value = map;
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
});

function avatarRingClass(memberId) {
  const rank = rankData.value[memberId]?.rank;
  if (rank === 1) return 'ring-2 ring-[var(--ui-color-brand)]';
  if (rank === 2) return 'ring-2 ring-[var(--ui-color-content-muted)]';
  if (rank === 3) return 'ring-2 ring-[var(--ui-color-content-disabled)]';
  return '';
}

// 검색어와 매칭되는 부분을 <mark>로 감싸 강조.
// name/bio는 크롤링된 외부 데이터이므로 원본을 먼저 HTML 이스케이프한 뒤
// (XSS 방지) 검색어만 <mark>로 감싼다. 검색어의 정규식 특수문자도 이스케이프.
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text) {
  const safe = escapeHtml(text ?? '');
  const q = query.value.trim();
  if (!q) return safe;
  const escaped = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="bg-[#DFF5E7] text-[var(--ui-color-content)]">$1</mark>',
  );
}
</script>

<template>
  <section class="grid gap-5">
    <!-- 검색 -->
    <div class="relative">
      <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-color-content-muted)]" />
      <input
        v-model="query"
        type="text"
        placeholder="이름으로 검색"
        class="h-11 w-full rounded-xl border border-[var(--ui-color-stroke)] bg-white pl-9 pr-4 text-[14px] text-[var(--ui-color-content)] placeholder:text-[var(--ui-color-content-muted)] focus:border-[var(--ui-color-brand)] focus:outline-none"
      />
    </div>

    <!-- 스켈레톤 -->
    <section v-if="loading" class="surface-card surface-card--flush">
      <ul class="divide-y divide-[var(--ui-color-stroke)]">
        <li
          v-for="n in 6"
          :key="n"
          class="flex animate-pulse items-center gap-3 px-4 py-3 first:pt-4 last:pb-4"
        >
          <div class="h-10 w-10 shrink-0 rounded-full bg-[var(--ui-color-surface-subtle)]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-1/2 rounded bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-3 w-3/4 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          </div>
          <div class="h-5 w-10 rounded bg-[var(--ui-color-surface-subtle)]"></div>
        </li>
      </ul>
    </section>

    <!-- 에러 -->
    <p v-else-if="errorMessage" class="py-12 text-center text-[15px] font-semibold text-[var(--ui-color-destructive)]">
      {{ errorMessage }}
    </p>

    <!-- 빈 결과 -->
    <div v-else-if="filtered.length === 0" class="py-12 text-center">
      <p class="text-[15px] text-[var(--ui-color-content)]">
        {{ query ? '검색 결과가 없어요.' : '아직 멤버가 없어요.' }}
      </p>
      <p class="mt-1 text-[13px] text-[var(--ui-color-content-muted)]">
        {{ query ? '다른 이름으로 검색해 보세요.' : '모임에 참여하면 멤버로 등록돼요.' }}
      </p>
    </div>

    <!-- 멤버 목록 -->
    <section v-else class="member-list-card surface-card surface-card--flush">
      <ul class="divide-y divide-[var(--ui-color-stroke)]">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="member-row flex cursor-pointer items-center gap-3 px-4 py-3 ui-transition-colors first:pt-4 last:pb-4 hover:bg-[var(--ui-color-surface-subtle)]"
          role="button"
          tabindex="0"
          :aria-label="`${member.name} 프로필 보기`"
          @click="selectedMember = member"
          @keydown.enter="selectedMember = member"
        >
          <UserAvatar
            class="h-10 w-10 text-[15px]"
            :class="avatarRingClass(member.id)"
            :name="member.name"
            :image-url="member.activeBadgeImageUrl ?? ''"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[var(--ui-color-content)]" v-html="highlight(member.name)"></p>
            <p v-if="displayBio(member)" class="truncate text-[13px] text-[var(--ui-color-content-muted)]" v-html="highlight(displayBio(member))"></p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="rankData[member.id]"
              class="text-[12px] font-bold text-[var(--ui-color-brand)]"
            >
              {{ rankData[member.id].points }}pt
            </span>
            <span
              v-if="rankData[member.id]?.rank === 1"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ui-color-brand)]"
            >
              <Crown :size="12" class="text-white" />
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 2"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ui-color-content-muted)] text-[11px] font-bold text-white"
            >
              2
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 3"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ui-color-content-disabled)] text-[11px] font-bold text-white"
            >
              3
            </span>
          </div>
        </li>
      </ul>
    </section>

    <!-- 멤버 프로필 카드 -->
    <Transition name="ui-modal">
      <MemberProfileCard
        v-if="selectedMember"
        :member="selectedMember"
        :rank="rankData[selectedMember.id] ?? null"
        @close="selectedMember = null"
      />
    </Transition>
  </section>
</template>
