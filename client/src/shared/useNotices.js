import { ref } from 'vue';
import { apiFetch } from './api.js';

const notices = ref([]);
const recentNotices = ref([]);
const unreadCount = ref(0);
const loading = ref(false);
const notificationLoading = ref(false);
const errorMessage = ref('');
const notificationErrorMessage = ref('');
const loaded = ref(false);
const hasMore = ref(false);
const nextOffset = ref(0);
let fullRequestGeneration = 0;
let notificationRequestGeneration = 0;

function setReadState(noticeId, isRead) {
  for (const collection of [notices.value, recentNotices.value]) {
    const notice = collection.find((item) => item.id === noticeId);
    if (notice) notice.isRead = isRead;
  }
}

function appendUnique(current, incoming) {
  const known = new Set(current.map((notice) => notice.id));
  return [...current, ...incoming.filter((notice) => !known.has(notice.id))];
}

export function useNotices() {
  async function loadNotices({ append = false, pageSize = 20 } = {}) {
    const generation = ++fullRequestGeneration;
    const offset = append ? nextOffset.value : 0;
    loading.value = true;
    if (!append) errorMessage.value = '';

    try {
      const body = await apiFetch(`/api/notices?limit=${pageSize}&offset=${offset}`);
      if (generation !== fullRequestGeneration) return;

      const page = body.data ?? { items: [], hasMore: false, nextOffset: offset };
      notices.value = append
        ? appendUnique(notices.value, page.items ?? [])
        : (page.items ?? []);
      hasMore.value = page.hasMore === true;
      nextOffset.value = page.nextOffset ?? notices.value.length;
      loaded.value = true;
    } catch (error) {
      if (generation === fullRequestGeneration) errorMessage.value = error.message;
      throw error;
    } finally {
      if (generation === fullRequestGeneration) loading.value = false;
    }
  }

  async function loadMoreNotices(pageSize = 20) {
    if (loading.value || !hasMore.value) return;
    return loadNotices({ append: true, pageSize });
  }

  async function loadNotificationSummary() {
    const generation = ++notificationRequestGeneration;
    notificationLoading.value = true;
    notificationErrorMessage.value = '';

    try {
      const [recentBody, countBody] = await Promise.all([
        apiFetch('/api/notices?limit=8&offset=0&summary=true'),
        apiFetch('/api/notices/unread-count'),
      ]);
      if (generation !== notificationRequestGeneration) return;

      recentNotices.value = recentBody.data?.items ?? [];
      unreadCount.value = countBody.data?.count ?? 0;
    } catch (error) {
      if (generation === notificationRequestGeneration) {
        notificationErrorMessage.value = error.message;
      }
      throw error;
    } finally {
      if (generation === notificationRequestGeneration) notificationLoading.value = false;
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
    fullRequestGeneration += 1;
    notificationRequestGeneration += 1;
    notices.value = [];
    recentNotices.value = [];
    unreadCount.value = 0;
    loading.value = false;
    notificationLoading.value = false;
    errorMessage.value = '';
    notificationErrorMessage.value = '';
    loaded.value = false;
    hasMore.value = false;
    nextOffset.value = 0;
  }

  return {
    notices,
    recentNotices,
    unreadCount,
    loading,
    notificationLoading,
    loaded,
    hasMore,
    errorMessage,
    notificationErrorMessage,
    loadNotices,
    loadMoreNotices,
    loadNotificationSummary,
    markRead,
    markAllRead,
    resetNotices,
  };
}
