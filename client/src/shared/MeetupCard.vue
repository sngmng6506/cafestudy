<script setup>
import { ExternalLink, MapPin } from '@lucide/vue';
import { formatDate, formatTime, naverMapUrl, googleMapUrl } from './useMeetups.js';

const props = defineProps({
  meetup: { type: Object, required: true },
  pendingId: { type: String, required: true },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-join', 'cancel']);
</script>

<template>
  <!-- Compact (calendar) variant -->
  <li v-if="compact" class="grid gap-2 rounded-lg border border-[#E5E8EB] bg-[#F9FAFB] p-3">
    <div>
      <p class="flex items-center gap-2 text-[15px] font-semibold text-[#191F28]">
        {{ meetup.title }}
        <span
          v-if="meetup.state === 'done'"
          class="rounded bg-[#F1F3F5] px-1.5 py-0.5 text-xs font-semibold text-[#8B95A1]"
        >
          완료
        </span>
      </p>
      <p class="mt-1 text-sm font-medium text-[#8B95A1]">{{ formatTime(meetup.scheduledAt) }}</p>
      <p
        v-if="meetup.description"
        class="mt-0.5 whitespace-pre-line text-sm font-medium text-[#8B95A1]"
      >
        {{ meetup.description }}
      </p>
    </div>
    <div v-if="meetup.state !== 'done'" class="flex items-center gap-3">
      <span class="text-sm font-medium text-[#8B95A1]">
        참여 {{ meetup.participantCount }}/{{ meetup.capacity }}명
      </span>
      <span
        class="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold"
        :class="meetup.participantCount >= meetup.capacity ? 'bg-[#F1F3F5] text-[#8B95A1]' : 'bg-[#DCFCE7] text-[#16A34A]'"
      >
        {{ meetup.participantCount >= meetup.capacity ? '마감' : '모집중' }}
      </span>
    </div>
  </li>

  <!-- Normal (list) variant -->
  <li v-else class="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
    <h4 class="text-[17px] font-bold text-[#191F28]">{{ meetup.title }}</h4>
    <p class="text-[12px] text-[#8B95A1]">
      <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
    </p>
    <div class="flex items-center gap-1.5">
      <MapPin :size="13" class="shrink-0 text-[#8B95A1]" />
      <span class="text-[13px] text-[#8B95A1]">{{ meetup.location }}</span>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="inline-flex h-7 items-center rounded-full bg-[#F1F3F5] px-3 text-[12px] font-medium text-[#8B95A1]"
      >
        {{ meetup.participantCount }}/{{ meetup.capacity }}명
      </span>
      <span
        class="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold"
        :class="
          meetup.participantCount >= meetup.capacity
            ? 'bg-[#F1F3F5] text-[#8B95A1]'
            : 'bg-[#DCFCE7] text-[#16A34A]'
        "
      >
        {{ meetup.participantCount >= meetup.capacity ? '마감' : '모집중' }}
      </span>
    </div>
    <div class="mt-auto flex flex-wrap items-center gap-2">
      <a
        class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]"
        :href="naverMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
      >
        네이버지도
        <ExternalLink :size="14" />
      </a>
      <a
        class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#F9FAFB]"
        :href="googleMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
      >
        구글맵
        <ExternalLink :size="14" />
      </a>
      <div class="ml-auto flex items-center gap-2">
        <div v-if="meetup.isHost" class="flex items-center gap-2">
          <span class="text-sm font-semibold text-[#8B95A1]">개설자</span>
          <button
            class="h-9 shrink-0 rounded-lg border border-[#F04452] px-3 text-sm font-semibold text-[#F04452] transition hover:bg-[#FFF1F2] disabled:opacity-50"
            type="button"
            :disabled="pendingId === meetup.id"
            @click="emit('cancel', meetup)"
          >
            모임 취소
          </button>
        </div>
        <button
          v-else-if="meetup.joined"
          class="h-9 shrink-0 rounded-lg border border-[#E5E8EB] px-4 text-sm font-semibold text-[#191F28] transition hover:bg-[#F9FAFB] disabled:opacity-50"
          type="button"
          :disabled="pendingId === meetup.id"
          @click="emit('toggle-join', meetup)"
        >
          참여 취소
        </button>
        <button
          v-else
          class="h-9 shrink-0 rounded-lg bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          type="button"
          :disabled="pendingId === meetup.id || meetup.participantCount >= meetup.capacity"
          @click="emit('toggle-join', meetup)"
        >
          {{ meetup.participantCount >= meetup.capacity ? '마감' : '참여하기' }}
        </button>
      </div>
    </div>
  </li>
</template>
