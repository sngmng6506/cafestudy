<script setup>
import { computed, onMounted, ref } from 'vue';
import { CalendarCheck, Image as ImageIcon, MapPin } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/useMeetups.js';
import { avatarColor, initials } from '../../shared/useAvatar.js';
import { somoimEventToMeetup, attendeeStack } from '../../shared/useSomoimEvents.js';

const meetups = ref([]);
const somoimEvents = ref([]);
const photos = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const completedMeetups = computed(() => {
  const photoMap = photos.value.reduce((map, photo) => {
    if (!photo.photoViewUrl) return map;
    (map[photo.meetupId] ??= []).push(photo);
    return map;
  }, {});

  return [
    ...meetups.value
      .filter((meetup) => meetup.state === 'done')
      .map((meetup) => ({
        ...meetup,
        sourceLabel: '직접 개설',
        photos: photoMap[meetup.id] ?? [],
      })),
    ...somoimEvents.value
      .filter((event) => event.scheduledAt)
      .map(toHistoryFromSomoimEvent)
      .filter((meetup) => meetup.state === 'done'),
  ].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
});

onMounted(async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const [meetupsBody, eventsBody, photosBody] = await Promise.all([
      apiFetch('/api/meetups'),
      apiFetch('/api/members/events').catch(() => ({ data: [] })),
      apiFetch('/api/verifications/photos').catch(() => ({ data: [] })),
    ]);

    meetups.value = meetupsBody.data ?? [];
    somoimEvents.value = eventsBody.data ?? [];
    photos.value = photosBody.data ?? [];
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
});

function toHistoryFromSomoimEvent(event) {
  // 공통 변환 + 이력 화면 전용 필드(출처 라벨, 사진). 정모엔 인증 사진이 없음.
  return { ...somoimEventToMeetup(event), sourceLabel: '소모임', photos: [] };
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">모임 이력</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">완료된 모임과 인증 사진을 모아봅니다.</p>
    </div>

    <section class="rounded-xl border border-[#dadce0] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <CalendarCheck :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">완료된 모임</h2>
        <span
          v-if="!loading && !errorMessage"
          class="ml-1 rounded-lg bg-[#f5f6f7] px-2 py-0.5 text-sm font-semibold text-[#5f6368]"
        >
          {{ completedMeetups.length }}
        </span>
      </div>

      <ul v-if="loading" class="divide-y divide-[#dadce0]">
        <li v-for="n in 3" :key="n" class="animate-pulse py-4 first:pt-0 last:pb-0">
          <div class="h-5 w-3/4 rounded-md bg-[#f5f6f7]"></div>
          <div class="mt-2 h-3 w-1/2 rounded bg-[#f5f6f7]"></div>
          <div class="mt-3 h-20 rounded-lg bg-[#f5f6f7]"></div>
        </li>
      </ul>

      <p v-else-if="errorMessage" class="py-6 text-[15px] font-semibold text-[#e74c3c]">
        {{ errorMessage }}
      </p>

      <div v-else-if="completedMeetups.length === 0" class="py-12 text-center">
        <p class="text-[15px] font-semibold text-[#333333]">아직 완료된 모임이 없습니다.</p>
        <p class="mt-1 text-[13px] text-[#5f6368]">모임 시간이 지나면 이곳에 표시됩니다.</p>
      </div>

      <ul v-else class="divide-y divide-[#dadce0]">
        <li v-for="meetup in completedMeetups" :key="meetup.id" class="grid gap-3 py-4 first:pt-0 last:pb-0">
          <div>
            <div class="mb-1 flex items-start justify-between gap-3">
              <h3 class="min-w-0 flex-1 text-[17px] font-bold text-[#333333]">{{ meetup.title }}</h3>
              <span class="shrink-0 rounded-lg bg-[#f5f6f7] px-2 py-0.5 text-[12px] font-semibold text-[#5f6368]">
                {{ meetup.sourceLabel }}
              </span>
            </div>
            <p class="text-[12px] text-[#5f6368]">{{ formatDate(meetup.scheduledAt) }}</p>
            <div class="mt-2 flex items-center gap-1.5">
              <MapPin :size="16" class="shrink-0 text-[#5f6368]" />
              <span class="text-[13px] text-[#5f6368]">{{ meetup.location }}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex h-7 items-center rounded-full bg-[#f5f6f7] px-3 text-[12px] font-medium text-[#5f6368]">
              {{ meetup.participantCount }}/{{ meetup.capacity }}명
            </span>
            <span v-if="meetup.description" class="inline-flex h-7 items-center rounded-full bg-[#f5f6f7] px-3 text-[12px] font-medium text-[#5f6368]">
              {{ meetup.description }}
            </span>
          </div>

          <div v-if="attendeeStack(meetup.attendees).shown.length || attendeeStack(meetup.attendees).overflow" class="flex items-center gap-2">
            <span class="text-[12px] font-medium text-[#5f6368]">참석자</span>
            <div class="flex -space-x-1.5">
              <span
                v-for="name in attendeeStack(meetup.attendees).shown"
                :key="name"
                class="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white"
                :class="avatarColor(name)"
                :title="name"
              >
                {{ initials(name) }}
              </span>
              <span
                v-if="attendeeStack(meetup.attendees).overflow"
                class="flex h-6 items-center justify-center rounded-full bg-[#f5f6f7] px-2 text-[10px] font-bold text-[#5f6368] ring-2 ring-white"
              >
                +{{ attendeeStack(meetup.attendees).overflow }}
              </span>
            </div>
          </div>

          <div v-if="meetup.photos.length" class="grid grid-cols-3 gap-2">
            <img
              v-for="photo in meetup.photos"
              :key="photo.id"
              :src="photo.photoViewUrl"
              class="aspect-square rounded-lg bg-[#f5f6f7] object-cover"
              alt="인증 사진"
              loading="lazy"
            />
          </div>
          <div v-else class="flex items-center gap-2 rounded-lg bg-[#f5f6f7] px-3 py-2 text-[13px] text-[#5f6368]">
            <ImageIcon :size="16" />
            인증 사진이 올라오면 이곳에 표시됩니다.
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
