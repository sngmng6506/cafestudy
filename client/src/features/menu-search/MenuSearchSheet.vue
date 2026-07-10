<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { ArrowRight, LoaderCircle, Search, X } from '@lucide/vue';
import { searchMenus } from './menu-search.service.js';

const props = defineProps({
  features: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(['close', 'select']);

const query = ref('');
const loading = ref(false);
const searched = ref(false);
const mode = ref('hybrid');
const results = ref([]);
const inputRef = ref(null);
let requestId = 0;

const featureByName = computed(() => new Map(props.features.map((feature) => [feature.name, feature])));
const displayResults = computed(() => results.value
  .map((result) => ({ ...result, feature: featureByName.value.get(result.featureName) }))
  .filter((result) => result.feature));

onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
});

async function submitSearch() {
  const value = query.value.trim();
  if (!value || loading.value) return;

  const currentRequest = ++requestId;
  loading.value = true;
  searched.value = true;

  try {
    const response = await searchMenus(value, {
      onSemanticError(error) {
        console.warn('[menu-search] 의미 검색을 사용할 수 없어 키워드 검색으로 대체합니다.', error);
      },
    });
    if (currentRequest !== requestId) return;
    mode.value = response.mode;
    results.value = response.results;
  } catch (error) {
    console.error('[menu-search] 메뉴 검색 오류:', error);
    if (currentRequest !== requestId) return;
    mode.value = 'keyword';
    results.value = [];
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

function selectResult(name) {
  emit('select', name);
}
</script>

<template>
  <div
    class="fixed inset-0 z-[70] flex items-end justify-center bg-black/35"
    role="presentation"
    @click.self="emit('close')"
  >
    <section
      class="w-full max-w-md rounded-t-[24px] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-search-title"
    >
      <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-[#dadce0]" />

      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="menu-search-title" class="text-[20px] font-bold text-[#333333]">기능 찾기</h2>
          <p class="mt-1 text-[13px] text-[#767676]">하고 싶은 일을 자연어로 입력해 보세요.</p>
        </div>
        <button
          class="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#5f6368] transition hover:bg-[#f5f6f7]"
          type="button"
          aria-label="기능 검색 닫기"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </div>

      <form class="flex gap-2" @submit.prevent="submitSearch">
        <label class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#767676]" :size="18" />
          <input
            ref="inputRef"
            v-model="query"
            class="focus-ring h-11 w-full rounded-[10px] border border-[#dadce0] bg-white pl-10 pr-3 text-[14px] outline-none placeholder:text-[#999999] focus:border-[#03C75A]"
            type="search"
            maxlength="120"
            autocomplete="off"
            placeholder="예: 지난 모임 사진 보고 싶어"
          />
        </label>
        <button
          class="focus-ring flex h-11 min-w-[64px] items-center justify-center rounded-[10px] bg-[#03C75A] px-4 text-[14px] font-medium text-white transition hover:bg-[#02b350] disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          :disabled="!query.trim() || loading"
        >
          <LoaderCircle v-if="loading" class="animate-spin" :size="18" />
          <span v-else>검색</span>
        </button>
      </form>

      <div class="mt-5 min-h-[210px]">
        <div v-if="!searched" class="rounded-2xl bg-[#f5f6f7] px-4 py-5 text-[13px] leading-6 text-[#5f6368]">
          “사진 인증하고 싶어”, “전에 갔던 카페가 어디였지”처럼 메뉴 이름을 몰라도 찾을 수 있어요.
        </div>

        <div v-else-if="loading" class="flex min-h-[180px] flex-col items-center justify-center gap-3 text-[#767676]">
          <LoaderCircle class="animate-spin" :size="24" />
          <p class="text-[13px]">관련 기능을 찾는 중입니다.</p>
        </div>

        <div v-else-if="displayResults.length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-[13px] font-medium text-[#5f6368]">추천 기능</h3>
            <span v-if="mode === 'keyword'" class="text-[11px] text-[#999999]">기본 검색 결과</span>
          </div>

          <div class="overflow-hidden rounded-2xl bg-[#f5f6f7]">
            <button
              v-for="result in displayResults"
              :key="result.featureName"
              class="focus-ring flex w-full items-center gap-3 border-b border-[#e9ebee] px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[#eef0f2]"
              type="button"
              @click="selectResult(result.featureName)"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#03C75A]">
                <component :is="result.feature.icon" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-bold text-[#333333]">{{ result.feature.label }}</span>
                <span v-if="result.matchedText" class="mt-0.5 block truncate text-[12px] text-[#767676]">{{ result.matchedText }}</span>
              </span>
              <ArrowRight class="shrink-0 text-[#999999]" :size="18" />
            </button>
          </div>
        </div>

        <div v-else class="rounded-2xl bg-[#f5f6f7] px-4 py-5 text-center">
          <p class="text-[14px] font-medium text-[#333333]">관련 기능을 찾지 못했어요.</p>
          <p class="mt-1 text-[12px] text-[#767676]">조금 더 구체적으로 입력해 보세요.</p>
        </div>
      </div>
    </section>
  </div>
</template>
