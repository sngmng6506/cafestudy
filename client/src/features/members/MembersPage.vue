<script setup>
import { computed, onMounted, ref } from 'vue';
import { Search, Users } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';

const members = ref([]);
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
    const body = await apiFetch('/api/members');
    members.value = body.data;
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

    <!-- 로딩 -->
    <p v-if="loading" class="py-12 text-center text-[15px] text-[#8B95A1]">불러오는 중입니다.</p>

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
            :class="avatarColor(member.name)"
          >
            {{ initials(member.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#191F28]">{{ member.name }}</p>
            <p v-if="member.bio" class="truncate text-[13px] text-[#8B95A1]">{{ member.bio }}</p>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
