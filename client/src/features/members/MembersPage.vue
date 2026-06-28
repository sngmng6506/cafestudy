<script setup>
import { computed, onMounted, ref } from 'vue';
import { Crown, Search, Users } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

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

function initials(name) {
  return name.slice(0, 1).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-[#16A34A] text-white',
  'bg-[#1B64DA] text-white',
  'bg-[#8B5CF6] text-white',
  'bg-[#F59E0B] text-white',
  'bg-[#EC4899] text-white',
];

function avatarColor(name) {
  let code = 0;
  for (const c of name) code += c.charCodeAt(0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function avatarRingClass(memberId) {
  const rank = rankData.value[memberId]?.rank;
  if (rank === 1) return 'ring-2 ring-[#16A34A]';
  if (rank === 2) return 'ring-2 ring-[#8B95A1]';
  if (rank === 3) return 'ring-2 ring-[#F59E0B]';
  return '';
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1">
      <h1 class="text-[22px] font-bold leading-snug text-[#191F28]">모임 멤버</h1>
      <p class="mt-1 text-[14px] text-[#8B95A1]">
        <template v-if="!loading">총 {{ members.length }}명</template>
        <template v-else>불러오는 중…</template>
      </p>
    </div>

    <!-- 검색 -->
    <div class="relative">
      <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
      <input
        v-model="query"
        type="text"
        placeholder="이름으로 검색"
        class="h-11 w-full rounded-xl border border-[#E5E8EB] bg-white pl-9 pr-4 text-[14px] text-[#191F28] placeholder:text-[#8B95A1] focus:border-[#16A34A] focus:outline-none"
      />
    </div>

    <!-- 스켈레톤 -->
    <section v-if="loading" class="rounded-xl border border-[#E5E8EB] bg-white shadow-sm">
      <ul class="divide-y divide-[#E5E8EB]">
        <li
          v-for="n in 6"
          :key="n"
          class="flex animate-pulse items-center gap-3 px-4 py-3 first:pt-4 last:pb-4"
        >
          <div class="h-10 w-10 shrink-0 rounded-full bg-[#F1F3F5]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-1/2 rounded bg-[#F1F3F5]"></div>
            <div class="h-3 w-3/4 rounded bg-[#F1F3F5]"></div>
          </div>
          <div class="h-5 w-10 rounded bg-[#F1F3F5]"></div>
        </li>
      </ul>
    </section>

    <!-- 에러 -->
    <p v-else-if="errorMessage" class="py-12 text-center text-[15px] font-semibold text-[#F04452]">
      {{ errorMessage }}
    </p>

    <!-- 빈 결과 -->
    <div v-else-if="filtered.length === 0" class="py-12 text-center">
      <Users :size="40" class="mx-auto mb-3 text-[#E5E8EB]" />
      <p class="text-[14px] text-[#8B95A1]">
        {{ query ? '검색 결과가 없습니다.' : '등록된 멤버가 없습니다.' }}
      </p>
    </div>

    <!-- 멤버 목록 -->
    <section v-else class="rounded-xl border border-[#E5E8EB] bg-white shadow-sm">
      <ul class="divide-y divide-[#E5E8EB]">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="flex items-center gap-3 px-4 py-3 first:pt-4 last:pb-4"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            :class="[avatarColor(member.name), avatarRingClass(member.id)]"
          >
            {{ initials(member.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#191F28]">{{ member.name }}</p>
            <p v-if="member.bio" class="truncate text-[13px] text-[#8B95A1]">{{ member.bio }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="rankData[member.id]"
              class="text-[12px] font-bold text-[#16A34A]"
            >
              {{ rankData[member.id].points }}pt
            </span>
            <span
              v-if="rankData[member.id]?.rank === 1"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#16A34A]"
            >
              <Crown :size="12" class="text-white" />
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 2"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#8B95A1] text-[11px] font-bold text-white"
            >
              2
            </span>
            <span
              v-else-if="rankData[member.id]?.rank === 3"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[#F59E0B] text-[11px] font-bold text-white"
            >
              3
            </span>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
