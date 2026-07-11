<script setup>
import { computed, ref } from 'vue';
import { ChevronDown, ChevronUp, ExternalLink, MapPin, Map } from '@lucide/vue';
import { formatDate, formatTime, naverMapUrl, googleMapUrl } from './useMeetups.js';
import UserAvatar from './UserAvatar.vue';
import { attendeeStack as buildStack, somoimAppLink } from './useSomoimEvents.js';

const props = defineProps({
  meetup: { type: Object, required: true },
  pendingId: { type: String, required: true },
  compact: { type: Boolean, default: false },
  showReadonlyDot: { type: Boolean, default: true },
});

const emit = defineEmits(['toggle-join', 'cancel']);

const attendeesExpanded = ref(false);
const isFull = computed(() => props.meetup.participantCount >= props.meetup.capacity);

const attendees = computed(() =>
  [...(props.meetup.attendees ?? [])].sort((a, b) => Number(Boolean(b.isHost)) - Number(Boolean(a.isHost))),
);
const attendeeStack = computed(() => buildStack(attendees.value));

// 참석은 소모임 앱에서만 가능 → 모바일이면 앱 실행 링크. UA는 안 바뀌므로 1회 계산.
const somoimLink = somoimAppLink();
</script>

<template>
  <!-- Compact (calendar) variant -->
  <li
    v-if="compact"
    class="grid gap-2 rounded-lg border p-3"
    :class="meetup.readonly ? 'border-l-[3px] border-l-[#10B981] border-y-[#dadce0] border-r-[#dadce0] bg-[#F0FDF4]' : 'border-[#dadce0] bg-[#f5f6f7]'"
  >
    <div>
      <p class="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-[#333333]">
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
        :class="isFull ? 'bg-[#f5f6f7] text-[#5f6368]' : 'bg-[#e9f8ef] text-[#03883f]'"
      >
        {{ isFull ? '마감' : '모집중' }}
      </span>
    </div>
  </li>

  <!-- Normal (list) variant -->
  <li
    v-else
    class="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0"
    :class="meetup.readonly ? 'border-l-[3px] border-l-[#10B981] -ml-4 pl-4' : ''"
  >
    <div class="flex items-start gap-2">
      <h4 class="min-w-0 flex-1 text-[17px] font-bold tracking-[-0.34px] text-[#333333]">
        {{ meetup.title }}
      </h4>
      <span
        v-if="meetup.readonly && showReadonlyDot"
        class="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#10B981]"
        aria-label="소모임"
      ></span>
    </div>
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
        v-if="!meetup.readonly"
        class="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold"
        :class="isFull ? 'bg-[#f5f6f7] text-[#5f6368]' : 'bg-[#e9f8ef] text-[#03883f]'"
      >
        {{ isFull ? '마감' : '모집중' }}
      </span>
    </div>

    <!-- 참석자 아바타 스택. 주최자는 맨 앞에 고정하고 초록 링으로 강조한다. -->
    <div v-if="attendeeStack.shown.length || attendeeStack.overflow" class="grid gap-2">
      <div class="flex items-center gap-2">
        <div class="flex -space-x-1.5">
          <UserAvatar
            v-for="attendee in attendeeStack.shown"
            :key="attendee.id ?? attendee.name"
            class="h-7 w-7 text-[11px] ring-2"
            :class="attendee.isHost ? 'ring-[#03C75A]' : 'ring-white'"
            :name="attendee.name"
            :image-url="attendee.badgeUrl ?? ''"
            :title="attendee.name"
          />
          <span
            v-if="attendeeStack.overflow"
            class="flex h-7 items-center justify-center rounded-full bg-[#f5f6f7] px-2 text-[11px] font-bold text-[#5f6368] ring-2 ring-white"
          >
            +{{ attendeeStack.overflow }}
          </span>
        </div>
        <button
          v-if="attendees.length > 1"
          class="focus-ring inline-flex h-7 items-center gap-0.5 rounded-full px-2 text-[12px] font-semibold text-[#5f6368] transition hover:bg-[#f5f6f7] hover:text-[#333333]"
          type="button"
          :aria-expanded="attendeesExpanded"
          @click="attendeesExpanded = !attendeesExpanded"
        >
          {{ attendeesExpanded ? '접기' : '전체 보기' }}
          <ChevronUp v-if="attendeesExpanded" :size="14" />
          <ChevronDown v-else :size="14" />
        </button>
      </div>

      <ul v-if="attendeesExpanded" class="flex flex-wrap gap-1.5">
        <li
          v-for="attendee in attendees"
          :key="`name-${attendee.id ?? attendee.name}`"
          class="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium leading-tight"
          :class="attendee.isHost ? 'border-[#03C75A] bg-[#e9f8ef] text-[#03883f]' : 'border-transparent bg-[#f5f6f7] text-[#333333]'"
        >
          <span class="min-w-0 break-words">{{ attendee.name }}</span>
        </li>
      </ul>
    </div>

    <div class="mt-auto flex flex-wrap items-center gap-2">
      <!-- 지도: 기본 네이버 버튼 + 구글 아이콘 버튼으로 압축 -->
      <a
        class="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dadce0] text-[#03C75A] transition hover:bg-[#f5f6f7]"
        :href="naverMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
        aria-label="네이버지도에서 보기"
      >
        <MapPin :size="16" />
      </a>
      <a
        class="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dadce0] text-[#5f6368] transition hover:bg-[#f5f6f7]"
        :href="googleMapUrl(meetup)"
        target="_blank"
        rel="noreferrer"
        aria-label="구글맵에서 보기"
        title="구글맵"
      >
        <Map :size="16" />
      </a>

      <div class="ml-auto flex items-center gap-2">
        <a
          v-if="meetup.readonly"
          class="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#059669] text-white transition hover:bg-[#047857]"
          :href="somoimLink.href"
          :target="somoimLink.target"
          rel="noreferrer"
          aria-label="소모임 앱에서 참여하기"
        >
          <ExternalLink :size="16" />
        </a>
        <div v-else-if="meetup.isHost" class="flex items-center gap-2">
          <span class="text-sm font-semibold text-[#5f6368]">개설자</span>
          <button
            class="focus-ring h-9 shrink-0 rounded-[10px] border border-[#e74c3c] px-3 text-sm font-semibold text-[#e74c3c] transition hover:bg-[#f5f6f7] disabled:opacity-50"
            type="button"
            :disabled="pendingId === meetup.id"
            @click="emit('cancel', meetup)"
          >
            모임 취소
          </button>
        </div>
        <button
          v-else-if="meetup.joined"
          class="focus-ring h-9 shrink-0 rounded-[10px] border border-[#dadce0] px-4 text-sm font-semibold text-[#333333] transition hover:bg-[#f5f6f7] disabled:opacity-50"
          type="button"
          :disabled="pendingId === meetup.id"
          @click="emit('toggle-join', meetup)"
        >
          참여 취소
        </button>
        <!-- 마감: 버튼이 아니라 배지로 (누를 수 없음을 명확히) -->
        <span
          v-else-if="isFull"
          class="inline-flex h-9 items-center rounded-[10px] bg-[#f5f6f7] px-4 text-sm font-semibold text-[#5f6368]"
        >
          마감
        </span>
        <button
          v-else
          class="focus-ring h-9 shrink-0 rounded-[10px] bg-[#03C75A] px-4 text-sm font-semibold text-white transition hover:bg-[#02b350] disabled:opacity-50"
          type="button"
          :disabled="pendingId === meetup.id"
          @click="emit('toggle-join', meetup)"
        >
          참여하기
        </button>
      </div>
    </div>
  </li>
</template>
