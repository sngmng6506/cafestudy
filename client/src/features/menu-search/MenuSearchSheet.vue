<script setup>
import { computed, ref } from 'vue';
import { ArrowRight, LoaderCircle, Search, X } from '@lucide/vue';
import { searchMenus } from './menu-search.service.js';
import { useOverlay } from '../../shared/useOverlay.js';

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
const dialogRef = ref(null);
let requestId = 0;

const featureByName = computed(() => new Map(props.features.map((feature) => [feature.name, feature])));
const displayResults = computed(() => results.value
  .map((result) => ({ ...result, feature: featureByName.value.get(result.featureName) }))
  .filter((result) => result.feature));

useOverlay({
  containerRef: dialogRef,
  initialFocusRef: inputRef,
  onClose: () => emit('close'),
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
    class="fixed inset-0 ui-layer-overlay flex items-end justify-center bg-black/35"
    role="presentation"
    @click.self="emit('close')"
  >
    <section
      ref="dialogRef"
      class="ui-sheet-panel w-full max-w-md rounded-t-[var(--ui-radius-overlay)] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-search-title"
      tabindex="-1"
    >
      <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--ui-color-stroke)]" />

      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="menu-search-title" class="text-[20px] font-bold text-[var(--ui-color-content)]">기능 찾기</h2>
          <p class="mt-1 text-[13px] text-[var(--ui-color-content-caption)]">하고 싶은 일을 자연어로 입력해 보세요.</p>
        </div>
        <button
          class="focus-ring ui-transition-colors flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ui-color-content-muted)] hover:bg-[var(--ui-color-surface-subtle)]"
          type="button"
          aria-label="기능 검색 닫기"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </div>

      <form class="flex gap-2" @submit.prevent="submitSearch">
        <label class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-color-content-caption)]" :size="18" />
          <input
            ref="inputRef"
            v-model="query"
            class="focus-ring h-11 w-full rounded-[10px] border border-[var(--ui-color-stroke)] bg-white pl-10 pr-3 text-[14px] outline-none placeholder:text-[var(--ui-color-content-disabled)] focus:border-[var(--ui-color-brand)]"
            type="search"
            maxlength="120"
            autocomplete="off"
            placeholder="예: 지난 모임 사진 보고 싶어"
          />
        </label>
        <button
          class="focus-ring flex h-11 min-w-[64px] items-center justify-center rounded-[10px] bg-[var(--ui-color-brand)] px-4 text-[14px] font-medium text-white transition hover:bg-[var(--ui-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          :disabled="!query.trim() || loading"
        >
          <LoaderCircle v-if="loading" class="animate-spin" :size="18" />
          <span v-else>검색</span>
        </button>
      </form>

      <div class="mt-5 min-h-[210px]">
        <div v-if="!searched" class="rounded-2xl bg-[var(--ui-color-surface-subtle)] px-4 py-5 text-[13px] leading-6 text-[var(--ui-color-content-muted)]">
          “사진 인증하고 싶어”, “전에 갔던 카페가 어디였지”처럼 메뉴 이름을 몰라도 찾을 수 있어요.
        </div>

        <div v-else-if="loading" class="flex min-h-[180px] flex-col items-center justify-center gap-3 text-[var(--ui-color-content-caption)]">
          <LoaderCircle class="animate-spin" :size="24" />
          <p class="text-[13px]">관련 기능을 찾는 중입니다.</p>
        </div>

        <div v-else-if="displayResults.length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-[13px] font-medium text-[var(--ui-color-content-muted)]">추천 기능</h3>
            <span v-if="mode === 'keyword'" class="text-[11px] text-[var(--ui-color-content-disabled)]">기본 검색 결과</span>
          </div>

          <div class="overflow-hidden rounded-2xl bg-[var(--ui-color-surface-subtle)]">
            <button
              v-for="result in displayResults"
              :key="result.featureName"
              class="focus-ring flex w-full items-center gap-3 border-b border-[var(--ui-color-stroke-subtle)] px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[#eef0f2]"
              type="button"
              @click="selectResult(result.featureName)"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--ui-color-brand)]">
                <component :is="result.feature.icon" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-bold text-[var(--ui-color-content)]">{{ result.feature.label }}</span>
                <span v-if="result.matchedText" class="mt-0.5 block truncate text-[12px] text-[var(--ui-color-content-caption)]">{{ result.matchedText }}</span>
              </span>
              <ArrowRight class="shrink-0 text-[var(--ui-color-content-disabled)]" :size="18" />
            </button>
          </div>
        </div>

        <div v-else class="rounded-2xl bg-[var(--ui-color-surface-subtle)] px-4 py-5 text-center">
          <p class="text-[14px] font-medium text-[var(--ui-color-content)]">관련 기능을 찾지 못했어요.</p>
          <p class="mt-1 text-[12px] text-[var(--ui-color-content-caption)]">조금 더 구체적으로 입력해 보세요.</p>
        </div>
      </div>
    </section>
  </div>
</template>
