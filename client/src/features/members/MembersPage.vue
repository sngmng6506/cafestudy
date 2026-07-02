<script setup>
import { computed, onMounted, ref } from 'vue';
import { Crown, Search } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { avatarColor, initials } from '../../shared/useAvatar.js';

const members = ref([]);
const rankData = ref({});
const loading = ref(true);
const errorMessage = ref('');
const query = ref('');

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
  if (rank === 1) return 'ring-2 ring-[#03C75A]';
  if (rank === 2) return 'ring-2 ring-[#5f6368]';
  if (rank === 3) return 'ring-2 ring-[#999999]';
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
    '<mark class="bg-[#DFF5E7] text-[#333333]">$1</mark>',
  );
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">모임 멤버</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">
        <template v-if="!loading">총 {{ members.length }}명</template>
        <template v-else>불러오는 중…</template>
      </p>
    </div>

    <!-- 검색 -->
    <div class="relative">
      <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6368]" />
      <input
        v-model="query"
        type="text"
        placeholder="이름으로 검색"
        class="h-11 w-full rounded-xl border border-[#dadce0] bg-white pl-9 pr-4 text-[14px] text-[#333333] placeholder:text-[#5f6368] focus:border-[#03C75A] focus:outline-none"
      />
    </div>

    <!-- 스켈레톤 -->
    <section v-if="loading" class="rounded-xl border border-[#dadce0] bg-white shadow-sm">
      <ul class="divide-y divide-[#dadce0]">
        <li
          v-for="n in 6"
          :key="n"
          class="flex animate-pulse items-center gap-3 px-4 py-3 first:pt-4 last:pb-4"
        >
          <div class="h-10 w-10 shrink-0 rounded-full bg-[#f5f6f7]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-1/2 rounded bg-[#f5f6f7]"></div>
            <div class="h-3 w-3/4 rounded bg-[#f5f6f7]"></div>
          </div>
          <div class="h-5 w-10 rounded bg-[#f5f6f7]"></div>
        </li>
      </ul>
    </section>

    <!-- 에러 -->
    <p v-else-if="errorMessage" class="py-12 text-center text-[15px] font-semibold text-[#e74c3c]">
      {{ errorMessage }}
    </p>

    <!-- 빈 결과 -->
    <div v-else-if="filtered.length === 0" class="py-12 text-center">
      <p class="text-[15px] text-[#333333]">
        {{ query ? '검색 결과가 없습니다.' : '등록된 멤버가 없습니다.' }}
      </p>
      <p class="mt-1 text-[13px] text-[#5f6368]">
        {{ query ? '다른 이름으로 검색해 보세요.' : '모임에 참여하면 멤버로 등록돼요.' }}
      </p>
    </div>

    <!-- 멤버 목록 -->
    <section v-else class="rounded-xl border border-[#dadce0] bg-white shadow-sm">
      <ul class="divide-y divide-[#dadce0]">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="flex items-center gap-3 px-4 py-3 first:pt-4 last:pb-4"
        >
          <img
            v-if="member.avatarUrl"
            :src="member.avatarUrl"
            :alt="member.name"
            class="h-10 w-10 shrink-0 rounded-full bg-[#f5f6f7] object-cover"
            :class="avatarRingClass(member.id)"
            loading="lazy"
            @error="member.avatarUrl = ''"
          />
          <span
            v-else
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            :class="[avatarColor(member.name), avatarRingClass(member.id)]"
          >
            {{ initials(member.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#333333]" v-html="highlight(member.name)"></p>
            <p v-if="member.bio" class="truncate text-[13px] text-[#5f6368]" v-html="highlight(member.bio)"></p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="rankData[member.id]"
              class="text-[12px] font-bold text-[#03C75A]"
            >
              {{ rankData[member.id].points }}pt
            </span>
            <span
              v-if="rankData[member.id]?.rank === 1"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#03C75A]"
            >
              <Crown :size="12" class="text-white" />
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 2"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#5f6368] text-[11px] font-bold text-white"
            >
              2
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 3"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#999999] text-[11px] font-bold text-white"
            >
              3
            </span>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
