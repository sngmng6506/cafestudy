<script setup>
// 대표 뱃지 이미지가 있으면 이미지, 없거나 로드 실패하면 이니셜 원형으로
// 폴백하는 공용 아바타. 크기(h-*/w-*/text-*)는 호출부가 class로 지정한다.
// fallback=false면 이미지가 없을 때 아무것도 그리지 않는다(랭킹처럼
// 아바타 없이 뱃지만 곁들이는 자리용).
import { ref, watch } from 'vue';
import { avatarColor, initials } from './useAvatar.js';

const props = defineProps({
  name: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  fallback: { type: Boolean, default: true },
});

const failed = ref(false);
watch(() => props.imageUrl, () => {
  failed.value = false;
});
</script>

<template>
  <img
    v-if="imageUrl && !failed"
    class="shrink-0 rounded-full border border-[#dadce0] bg-[#f5f6f7] object-cover"
    :src="imageUrl"
    :alt="name"
    @error="failed = true"
  />
  <span
    v-else-if="fallback"
    class="flex shrink-0 items-center justify-center rounded-full font-bold"
    :class="avatarColor(name)"
  >
    {{ initials(name) }}
  </span>
</template>
