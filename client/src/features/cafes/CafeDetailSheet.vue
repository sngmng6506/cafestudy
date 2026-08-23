<script setup>
// 지도 마커(또는 목록)에서 연 카페 상세 모달: 장소 정보 + 코멘트 + 인증 사진.
// 사진은 요청자가 참여했던 모임의 것만 온다(서버에서 제한).
import { onMounted, ref } from 'vue';
import { Camera, MapPin, MessageSquare, X } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/useMeetups.js';

const props = defineProps({
  cafe: { type: Object, required: true },
});

const emit = defineEmits(['close']);

const photos = ref([]);
const photosLoading = ref(true);

onMounted(async () => {
  try {
    const body = await apiFetch(
      `/api/cafes/photos?location=${encodeURIComponent(props.cafe.location)}`,
    );
    photos.value = body.data ?? [];
  } catch {
    photos.value = [];
  } finally {
    photosLoading.value = false;
  }
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')"></div>

    <div class="relative z-10 max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white px-5 pb-6 pt-5 shadow-lg">
      <button
        class="focus-ring absolute right-4 top-4 rounded p-1 text-[var(--ui-color-content-muted)] transition hover:text-[var(--ui-color-content)]"
        type="button"
        aria-label="닫기"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>

      <h2 class="pr-8 text-[18px] font-bold text-[var(--ui-color-content)]">{{ cafe.placeName ?? cafe.location }}</h2>
      <p v-if="cafe.roadAddress" class="mt-1 flex items-center gap-1 text-[13px] text-[var(--ui-color-content-muted)]">
        <MapPin :size="13" class="shrink-0" /> {{ cafe.roadAddress }}
      </p>
      <p class="mt-1 text-[12px] text-[var(--ui-color-content-muted)]">
        {{ cafe.meetupCount }}회 방문 · 최근 {{ formatDate(cafe.lastVisitedAt) }}
      </p>

      <!-- 코멘트 -->
      <div class="mt-4">
        <p class="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ui-color-content)]">
          <MessageSquare :size="14" class="text-[var(--ui-color-brand)]" /> 한줄 코멘트
        </p>
        <div v-if="cafe.comments?.length" class="grid gap-2">
          <div
            v-for="comment in cafe.comments"
            :key="comment.id"
            class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2"
          >
            <p class="mb-0.5 text-[12px] font-semibold text-[var(--ui-color-content-muted)]">{{ comment.authorName }}</p>
            <p class="text-[13px] leading-relaxed text-[var(--ui-color-content)]">{{ comment.body }}</p>
          </div>
        </div>
        <p v-else class="text-[13px] text-[var(--ui-color-content-muted)]">아직 남긴 코멘트가 없어요.</p>
      </div>

      <!-- 인증 사진 (내가 참여한 모임의 사진만) -->
      <div class="mt-4">
        <p class="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ui-color-content)]">
          <Camera :size="14" class="text-[var(--ui-color-brand)]" /> 이 카페의 인증 사진
        </p>
        <p v-if="photosLoading" class="text-[13px] text-[var(--ui-color-content-muted)]">불러오는 중...</p>
        <div v-else-if="photos.length" class="grid grid-cols-3 gap-2">
          <img
            v-for="photo in photos"
            :key="photo.id"
            :src="photo.photoViewUrl"
            :alt="photo.meetupTitle"
            :title="photo.meetupTitle"
            class="aspect-square rounded-lg bg-[var(--ui-color-surface-subtle)] object-cover"
            loading="lazy"
          />
        </div>
        <p v-else class="rounded-lg bg-[var(--ui-color-surface-subtle)] px-3 py-2 text-[13px] text-[var(--ui-color-content-muted)]">
          내가 참여한 모임의 인증 사진이 아직 없어요.
        </p>
      </div>
    </div>
  </div>
</template>
