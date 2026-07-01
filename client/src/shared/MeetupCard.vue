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
  <li v-if="compact" class="grid gap-2 rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-3">
    <div>
      <p class="flex items-center gap-2 text-[15px] font-semibold text-[#333333]">
        {{ meetup.title }}
        <span
          v-if="meetup.state === 'done'"
          class="rounded bg-[#f5f6f7] px-1.5 py-0.5 text-xs font-semibold text-[#5f6368]"
        >
          완료
        </span>
      </p>
      <p class="mt-1 text-sm font-medium text-[#5f6368]">{{ formatTime(meetup.scheduledAt) }}</p>
      <p
        v-if="meetup.description"
        class="mt-0.5 whitespace-pre-line text-sm font-medium text-[#5f6368]"
      >
        {{ meetup.description }}
      </p>
    </div>
    <div v-if="meetup.state !== 'done'" class="flex items-center gap-3">
      <span class="text-sm font-medium text-[#5f6368]">
        참여 {{ meetup.participantCount }}/{{ meetup.capacity }}명
      </span>
      <span
        class="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold"
        :class="meetup.participantCount >= meetup.capacity ? 'bg-[#f5f6f7] text-[#5f6368]' : 'border border-[#03C75A] bg-white text-[#03C75A]'"
      >
        {{ meetup.participantCount >= meetup.capacity ? '마감' : '모집중' }}
      </span>
    </div>
  </li>

  <!-- Normal (list) variant -->
  <li v-else class="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
    <h4 class="text-[17px] font-bold tracking-[-0.34px] text-[#333333]">{{ meetup.title }}</h4>
    <p class="text-[12px] text-[#5f6368]">
      <time :datetime="meetup.scheduledAt">{{ formatDate(meetup.scheduledAt) }}</time>
    </p>
    <div class="flex items-center gap-1.5">
      <MapPin :size="16" class="shrink-0 text-[#5f6368]" />
      <span class="text-[13px] text-[#5f6368]">{{ meetup.location }}</span>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="inline-flex h-7 items-center rounded-full bg-[#f5f6f7] px-3 text-[12px] font-medium text-[#5f6368]"
      >
        {{ meetup.participantCount }}/{{ meetup.capacity }}명
      </span>
      <span
        class="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold"
        :class="
          meetup.participantCount >= meetup.capacity
            ? 'bg-[#f5f6f7] text-[#5f6368]'
            : 'border border-[#03C75A] bg-white text-[#03C75A]'
        "
      >
        {{ meetup.participantCount >= meetup.capacity ? '마감' : '모집중' }}
      </span>
    </div>
    <p v-if="meetup.attendees?.length" class="text-[13px] leading-relaxed text-[#5f6368]">
      참석자: {{ meetup.attendees.join(', ') }}
    </p>
    <div class="mt-auto flex flex-wrap items-center gap-2">
      <a
        class="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded border border-[#dadce0] px-3 text-sm font-semibold text-[#03C75A] transition hover:bg-[#f5f6f7]"
        :href="naverMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
      >
        네이버지도
        <ExternalLink :size="16" />
      </a>
      <a
        class="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded border border-[#dadce0] px-3 text-sm font-semibold text-[#03C75A] transition hover:bg-[#f5f6f7]"
        :href="googleMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
      >
        구글맵
        <ExternalLink :size="16" />
      </a>
      <div class="ml-auto flex items-center gap-2">
        <span v-if="meetup.readonly" class="text-sm font-semibold text-[#5f6368]">앱 동기화</span>
        <div v-else-if="meetup.isHost" class="flex items-center gap-2">
          <span class="text-sm font-semibold text-[#5f6368]">개설자</span>
          <button
            class="focus-ring h-9 shrink-0 rounded border border-[#e74c3c] px-3 text-sm font-semibold text-[#e74c3c] transition hover:bg-[#f5f6f7] disabled:opacity-50"
            type="button"
            :disabled="pendingId === meetup.id"
            @click="emit('cancel', meetup)"
          >
            모임 취소
          </button>
        </div>
        <button
          v-else-if="meetup.joined"
          class="focus-ring h-9 shrink-0 rounded border border-[#dadce0] px-4 text-sm font-semibold text-[#333333] transition hover:bg-[#f5f6f7] disabled:opacity-50"
          type="button"
          :disabled="pendingId === meetup.id"
          @click="emit('toggle-join', meetup)"
        >
          참여 취소
        </button>
        <button
          v-else
          class="focus-ring h-9 shrink-0 rounded bg-[#03C75A] px-4 text-sm font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-50"
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
