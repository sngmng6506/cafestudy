import { ref } from 'vue';
import { apiFetch } from './api.js';

const meetups = ref([]);
const loading = ref(false);
const pendingId = ref('');
const errorMessage = ref('');
const actionError = ref('');

export function useMeetups() {
  async function loadMeetups() {
    loading.value = true;
    errorMessage.value = '';
    try {
      const body = await apiFetch('/api/meetups');
      meetups.value = body.data;
    } catch (error) {
      errorMessage.value = error.message;
    } finally {
      loading.value = false;
    }
  }

  async function toggleJoin(meetup) {
    pendingId.value = meetup.id;
    actionError.value = '';
    try {
      const body = await apiFetch(`/api/meetups/${meetup.id}/join`, {
        method: meetup.joined ? 'DELETE' : 'POST',
      });
      const target = meetups.value.find((m) => m.id === meetup.id);
      if (target) {
        target.joined = body.data.joined;
        target.participantCount = body.data.participantCount;
      }
    } catch (error) {
      actionError.value = error.message;
    } finally {
      pendingId.value = '';
    }
  }

  async function cancelMeetup(meetup) {
    if (!window.confirm('이 모임을 취소할까요? 목록과 캘린더에서 사라집니다.')) return;
    pendingId.value = meetup.id;
    actionError.value = '';
    try {
      await apiFetch(`/api/meetups/${meetup.id}`, { method: 'DELETE' });
      meetups.value = meetups.value.filter((m) => m.id !== meetup.id);
    } catch (error) {
      actionError.value = error.message;
    } finally {
      pendingId.value = '';
    }
  }

  return {
    meetups,
    loading,
    pendingId,
    errorMessage,
    actionError,
    loadMeetups,
    toggleJoin,
    cancelMeetup,
  };
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short' }).format(new Date(value));
}

export function naverMapUrl(meetup) {
  return `https://map.naver.com/p/search/${encodeURIComponent(meetup.location)}`;
}

export function googleMapUrl(meetup) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetup.location)}`;
}
