<script setup>
import { onMounted, ref } from 'vue';
import { Award, Check, Sparkles } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { useToast } from '../../shared/useToast.js';
import { useActiveBadge } from '../../shared/useActiveBadge.js';

const toast = useToast();
const { setActiveBadgeImageUrl } = useActiveBadge();

const prompt = ref('');
const title = ref('');
const badges = ref([]);
const preview = ref(null);
const loading = ref(true);
const generating = ref(false);
const applying = ref(false);
const activatingId = ref('');
const errorMessage = ref('');

onMounted(loadBadges);

async function loadBadges() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const body = await apiFetch('/api/badges/me');
    badges.value = body.data ?? [];
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function generateBadge() {
  const normalizedPrompt = prompt.value.trim();
  if (!normalizedPrompt) {
    toast.error('뱃지 프롬프트를 입력하세요.');
    return;
  }

  generating.value = true;
  preview.value = null;
  try {
    const body = await apiFetch('/api/badges/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: normalizedPrompt }),
    });
    preview.value = body.data;
    title.value = normalizedPrompt.slice(0, 40);
  } catch (error) {
    toast.error(error.message);
  } finally {
    generating.value = false;
  }
}

async function applyBadge() {
  if (!preview.value) return;

  applying.value = true;
  try {
    const body = await apiFetch(`/api/badges/generations/${preview.value.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.value }),
    });
    badges.value = [body.data, ...badges.value.map((badge) => ({ ...badge, isActive: false }))];
    setActiveBadgeImageUrl(body.data.imageViewUrl ?? '');
    preview.value = null;
    prompt.value = '';
    title.value = '';
    toast.success('뱃지를 추가했습니다.');
  } catch (error) {
    toast.error(error.message);
  } finally {
    applying.value = false;
  }
}

async function activateBadge(badge) {
  if (badge.isActive || activatingId.value) return;

  activatingId.value = badge.id;
  try {
    const body = await apiFetch(`/api/badges/${badge.id}/activate`, { method: 'POST' });
    badges.value = badges.value.map((item) => ({
      ...item,
      isActive: item.id === body.data.id,
    }));
    setActiveBadgeImageUrl(body.data.imageViewUrl ?? '');
    toast.success('대표 뱃지를 변경했습니다.');
  } catch (error) {
    toast.error(error.message);
  } finally {
    activatingId.value = '';
  }
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">AI 뱃지</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">프롬프트로 픽셀 뱃지를 만들고 내 프로필에 추가합니다.</p>
    </div>

    <section class="surface-card">
      <div class="mb-4 flex items-center gap-2">
        <Sparkles :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">뱃지 생성</h2>
        <span class="ml-auto rounded bg-[#f5f6f7] px-2 py-0.5 text-[12px] font-semibold text-[#5f6368]">0pt</span>
      </div>

      <label class="grid gap-1.5 text-[13px] font-medium text-[#333333]">
        프롬프트
        <textarea
          v-model="prompt"
          class="min-h-[92px] rounded-lg border border-[#dadce0] px-4 py-3 text-[15px] outline-none transition placeholder:text-[#5f6368] focus:border-[#03C75A]"
          maxlength="200"
          placeholder="예: 주말마다 카페에서 코딩하는 사람"
        ></textarea>
      </label>

      <button
        class="focus-ring mt-4 flex h-11 w-full items-center justify-center gap-2 rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-50"
        type="button"
        :disabled="generating"
        @click="generateBadge"
      >
        <Sparkles :size="17" />
        {{ generating ? '생성 중...' : '뱃지 만들기' }}
      </button>
    </section>

    <section v-if="preview" class="surface-card">
      <h2 class="mb-3 text-lg font-semibold text-[#333333]">미리보기</h2>
      <div class="grid gap-4">
        <img
          v-if="preview.imageViewUrl"
          class="mx-auto h-40 w-40 rounded-xl border border-[#dadce0] bg-[#f5f6f7] object-contain p-2"
          :src="preview.imageViewUrl"
          alt="생성된 뱃지"
        />
        <label class="grid gap-1.5 text-[13px] font-medium text-[#333333]">
          뱃지 이름
          <input
            v-model="title"
            class="h-11 rounded-lg border border-[#dadce0] px-4 text-[15px] outline-none transition focus:border-[#03C75A]"
            maxlength="40"
          />
        </label>
        <button
          class="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded bg-[#333333] text-[15px] font-semibold text-white transition hover:bg-[#111111] disabled:opacity-50"
          type="button"
          :disabled="applying"
          @click="applyBadge"
        >
          <Check :size="17" />
          {{ applying ? '적용 중...' : '내 뱃지에 적용' }}
        </button>
      </div>
    </section>

    <section class="surface-card surface-card--flush">
      <div class="flex items-center gap-2 px-5 py-4">
        <Award :size="18" class="text-[#03C75A]" />
        <h2 class="text-[15px] font-bold text-[#333333]">내 뱃지</h2>
      </div>
      <p v-if="loading" class="px-5 pb-5 text-[14px] text-[#5f6368]">불러오는 중...</p>
      <p v-else-if="errorMessage" class="px-5 pb-5 text-[14px] font-semibold text-[#e74c3c]">{{ errorMessage }}</p>
      <p v-else-if="badges.length === 0" class="px-5 pb-5 text-[14px] text-[#5f6368]">아직 적용한 뱃지가 없습니다.</p>
      <ul v-else class="divide-y divide-[#dadce0]">
        <li v-for="badge in badges" :key="badge.id" class="flex items-center gap-3 px-5 py-3">
          <img
            v-if="badge.imageViewUrl"
            class="h-12 w-12 shrink-0 rounded-lg border border-[#dadce0] bg-[#f5f6f7] object-contain p-1"
            :src="badge.imageViewUrl"
            :alt="badge.title"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#333333]">{{ badge.title }}</p>
            <p v-if="badge.description" class="truncate text-[13px] text-[#5f6368]">{{ badge.description }}</p>
          </div>
          <span
            v-if="badge.isActive"
            class="shrink-0 rounded bg-[#e9f8ef] px-2 py-1 text-[12px] font-bold text-[#03883f]"
          >
            적용중
          </span>
          <button
            v-else
            class="focus-ring h-8 shrink-0 rounded-[10px] border border-[#dadce0] px-2 text-[12px] font-semibold text-[#333333] transition hover:bg-[#f5f6f7] disabled:opacity-50"
            type="button"
            :disabled="!!activatingId"
            @click="activateBadge(badge)"
          >
            {{ activatingId === badge.id ? '변경중' : '적용' }}
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>
