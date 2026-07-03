<script setup>
import { computed, onMounted, ref } from 'vue';
import { Check, Search, X } from '@lucide/vue';
import { apiFetch } from './api.js';
import { useCurrentUser } from './useCurrentUser.js';
import { avatarColor, initials } from './useAvatar.js';

const props = defineProps({
  dismissable: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const { currentUserId, setCurrentUser } = useCurrentUser();
const members = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const query = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter((m) => m.name.toLowerCase().includes(q));
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

function select(member) {
  setCurrentUser(member.id, member.name);
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div
      class="absolute inset-0 bg-black/30"
      @click="dismissable ? emit('close') : undefined"
    ></div>

    <div
      class="relative z-10 w-full max-w-sm rounded-xl bg-white px-5 pb-6 pt-5 shadow-lg"
    >
      <button
        v-if="dismissable"
        class="focus-ring absolute right-4 top-4 rounded p-1 text-[#5f6368] transition hover:text-[#333333]"
        type="button"
        aria-label="닫기"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>

      <h2 class="text-[18px] font-bold text-[#333333]">나는 누구인가요?</h2>
      <p class="mt-1 text-[13px] text-[#5f6368]">
        본인 이름을 선택하면 이후 내 활동으로 표시돼요.
      </p>

      <!-- 검색 -->
      <div class="relative mt-4 mb-3">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6368]" />
        <input
          v-model="query"
          type="text"
          placeholder="이름으로 검색"
          class="h-10 w-full rounded border border-[#dadce0] bg-[#f5f6f7] pl-9 pr-4 text-[14px] text-[#333333] placeholder:text-[#999999] focus:border-[#03C75A] focus:bg-white focus:outline-none"
        />
      </div>

      <!-- 스켈레톤 -->
      <ul v-if="loading" class="divide-y divide-[#dadce0]">
        <li
          v-for="n in 5"
          :key="n"
          class="flex animate-pulse items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div class="h-10 w-10 shrink-0 rounded-full bg-[#f5f6f7]"></div>
          <div class="h-4 w-32 rounded bg-[#f5f6f7]"></div>
        </li>
      </ul>

      <!-- 에러 -->
      <p v-else-if="errorMessage" class="py-4 text-center text-[14px] font-semibold text-[#e74c3c]">
        {{ errorMessage }}
      </p>

      <!-- 멤버 목록 -->
      <p v-else-if="!loading && !errorMessage && filtered.length === 0" class="py-6 text-center text-[14px] text-[#5f6368]">
        검색 결과가 없습니다.
      </p>
      <ul v-else class="max-h-64 divide-y divide-[#dadce0] overflow-y-auto">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="focus-ring flex cursor-pointer items-center gap-3 rounded py-3 transition hover:bg-[#f5f6f7] first:pt-0 last:pb-0"
          tabindex="0"
          role="button"
          @click="select(member)"
          @keydown.enter="select(member)"
          @keydown.space.prevent="select(member)"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            :class="[avatarColor(member.name), member.id === currentUserId ? 'ring-2 ring-[#03C75A] ring-offset-1' : '']"
          >
            {{ initials(member.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#333333]">{{ member.name }}</p>
            <p v-if="member.bio" class="truncate text-[13px] text-[#5f6368]">{{ member.bio }}</p>
          </div>
          <Check
            v-if="member.id === currentUserId"
            :size="18"
            class="shrink-0 text-[#03C75A]"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
