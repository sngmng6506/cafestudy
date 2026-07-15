import { ref } from 'vue';
import { apiFetch } from './api.js';

const notices = ref([]);
const recentNotices = ref([]);
const unreadCount = ref(0);
const loading = ref(false);
const notificationLoading = ref(false);
const errorMessage = ref('');
const loaded = ref(false);

function setReadState(noticeId, isRead) {
  for (const collection of [notices.value, recentNotices.value]) {
    const notice = collection.find((item) => item.id === noticeId);
    if (notice) notice.isRead = isRead;
  }
}

export function useNotices() {
  async function loadNotices() {
    loading.value = true;
    errorMessage.value = '';
    try {
      const body = await apiFetch('/api/notices');
      notices.value = body.data ?? [];
      unreadCount.value = notices.value.filter((notice) => !notice.isRead).length;
      loaded.value = true;
    } catch (error) {
      errorMessage.value = error.message;
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function loadNotificationSummary() {
    notificationLoading.value = true;
    errorMessage.value = '';
    try {
      const [recentBody, countBody] = await Promise.all([
        apiFetch('/api/notices?limit=8&summary=true'),
        apiFetch('/api/notices/unread-count'),
      ]);
      recentNotices.value = recentBody.data ?? [];
      unreadCount.value = countBody.data?.count ?? 0;
    } catch (error) {
      errorMessage.value = error.message;
      throw error;
    } finally {
      notificationLoading.value = false;
    }
  }

  async function markRead(notice) {
    if (notice.isRead) return;
    await apiFetch(`/api/notices/${notice.id}/read`, { method: 'POST' });
    setReadState(notice.id, true);
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }

  async function markAllRead() {
    if (unreadCount.value === 0 && !notices.value.some((notice) => !notice.isRead)) return;
    await apiFetch('/api/notices/read-all', { method: 'POST' });
    notices.value.forEach((notice) => { notice.isRead = true; });
    recentNotices.value.forEach((notice) => { notice.isRead = true; });
    unreadCount.value = 0;
  }

  function resetNotices() {
    notices.value = [];
    recentNotices.value = [];
    unreadCount.value = 0;
    errorMessage.value = '';
    loaded.value = false;
  }

  return {
    notices,
    recentNotices,
    unreadCount,
    loading,
    notificationLoading,
    loaded,
    errorMessage,
    loadNotices,
    loadNotificationSummary,
    markRead,
    markAllRead,
    resetNotices,
  };
}
