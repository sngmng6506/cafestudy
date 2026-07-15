import { computed, ref } from 'vue';
import { apiFetch } from './api.js';

const notices = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const loaded = ref(false);

export function useNotices() {
  const unreadCount = computed(() => notices.value.filter((notice) => !notice.isRead).length);

  async function loadNotices() {
    loading.value = true;
    errorMessage.value = '';
    try {
      const body = await apiFetch('/api/notices');
      notices.value = body.data ?? [];
      loaded.value = true;
    } catch (error) {
      errorMessage.value = error.message;
    } finally {
      loading.value = false;
    }
  }

  async function markRead(notice) {
    if (notice.isRead) return;
    await apiFetch(`/api/notices/${notice.id}/read`, { method: 'POST' });
    notice.isRead = true;
  }

  async function markAllRead() {
    await apiFetch('/api/notices/read-all', { method: 'POST' });
    notices.value.forEach((notice) => { notice.isRead = true; });
  }

  return { notices, loading, loaded, errorMessage, unreadCount, loadNotices, markRead, markAllRead };
}
