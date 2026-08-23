import { computed, ref } from 'vue';
import { apiFetch } from './api.js';
import { useMeetups } from './useMeetups.js';
import { somoimEventToMeetup } from './useSomoimEvents.js';

// 앱 모임과 소모임 정모를 하나의 예정 목록으로 합친다.
// 홈(달력)과 모임 탭(목록)이 같은 데이터를 봐야 해서 모듈 스코프 상태를 공유한다.
const somoimEvents = ref([]);
const somoimLoading = ref(false);

export function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useUpcomingMeetups() {
  const meetupState = useMeetups();

  async function loadSomoimEvents() {
    somoimLoading.value = true;
    try {
      const body = await apiFetch('/api/members/events');
      somoimEvents.value = body.data ?? [];
    } catch (_error) {
      somoimEvents.value = [];
    } finally {
      somoimLoading.value = false;
    }
  }

  async function loadAll() {
    await Promise.allSettled([meetupState.loadMeetups(), loadSomoimEvents()]);
  }

  const allMeetups = computed(() => [
    ...meetupState.meetups.value,
    // 날짜 파싱에 실패한(scheduledAt null) 정모는 제외 — now()로 대체하면
    // "오늘 예정"으로 둔갑해 혼란을 준다.
    ...somoimEvents.value
      .filter((event) => event.scheduledAt)
      // 정모는 읽기전용이라 참여·개설 상태가 없다.
      .map((event) => ({ ...somoimEventToMeetup(event), joined: false, isHost: false })),
  ]);

  const activeMeetups = computed(() =>
    allMeetups.value.filter((meetup) => meetup.state !== 'done'),
  );

  const upcomingMeetups = computed(() =>
    [...activeMeetups.value].sort((a, b) => sortTime(a.scheduledAt) - sortTime(b.scheduledAt)),
  );

  const meetupsByDay = computed(() => {
    const map = {};
    for (const meetup of activeMeetups.value) {
      const key = dayKey(new Date(meetup.scheduledAt));
      (map[key] ??= []).push(meetup);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    }
    return map;
  });

  const loadingAny = computed(() => meetupState.loading.value || somoimLoading.value);

  return {
    ...meetupState,
    somoimLoading,
    loadingAny,
    loadAll,
    loadSomoimEvents,
    upcomingMeetups,
    meetupsByDay,
  };
}

function sortTime(value) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}
