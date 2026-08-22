import { ref } from 'vue';
import { apiFetch } from './api.js';
import { createLatestRequestGuard } from './latest-request.js';
import { jobFilterStatus } from './somoim-automation-status.js';

const PAGE_SIZE = 20;

const jobs = ref([]);
const loading = ref(false);
const creating = ref(false);
const hasMore = ref(false);
const nextOffset = ref(0);
const activeFilter = ref('all');
const guard = createLatestRequestGuard();

export function useSomoimAutomation() {
  async function loadJobs({ append = false, filter = activeFilter.value } = {}) {
    const requestId = guard.begin();
    const offset = append ? nextOffset.value : 0;
    activeFilter.value = filter;
    loading.value = true;

    try {
      const status = jobFilterStatus(filter);
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (status) query.set('status', status);

      const body = await apiFetch(`/api/somoim-automation/jobs?${query}`);
      if (!guard.isCurrent(requestId)) return;

      const page = body.data ?? { items: [], hasMore: false, nextOffset: offset };
      jobs.value = append ? [...jobs.value, ...(page.items ?? [])] : (page.items ?? []);
      hasMore.value = page.hasMore === true;
      nextOffset.value = page.nextOffset ?? jobs.value.length;
    } finally {
      if (guard.isCurrent(requestId)) loading.value = false;
    }
  }

  async function loadMoreJobs() {
    if (loading.value || !hasMore.value) return;
    return loadJobs({ append: true });
  }

  async function requestMeetup(input) {
    creating.value = true;
    try {
      await apiFetch('/api/somoim-automation/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await loadJobs();
    } finally {
      creating.value = false;
    }
  }

  return {
    jobs,
    loading,
    creating,
    hasMore,
    activeFilter,
    loadJobs,
    loadMoreJobs,
    requestMeetup,
  };
}
