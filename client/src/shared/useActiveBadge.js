import { ref, watch } from 'vue';
import { apiFetch } from './api.js';
import { useCurrentUser } from './useCurrentUser.js';

// 대표 뱃지 이미지는 앱 전역 상태(헤더 아바타). fetch/갱신 로직을 이 composable
// 하나가 소유하고, 뱃지를 바꾸는 화면은 setActiveBadgeImageUrl만 호출한다.
const { currentUserId } = useCurrentUser();
const activeBadgeImageUrl = ref('');

// 사용자 전환 직후 이전 사용자의 응답이 늦게 도착해 덮어쓰는 것을 막는 시퀀스.
let loadSequence = 0;

async function loadActiveBadge() {
  const requestSeq = ++loadSequence;

  if (!currentUserId.value) {
    activeBadgeImageUrl.value = '';
    return;
  }

  try {
    const body = await apiFetch('/api/badges/active');
    if (requestSeq !== loadSequence) return;
    activeBadgeImageUrl.value = body.data?.imageViewUrl ?? '';
  } catch {
    if (requestSeq !== loadSequence) return;
    activeBadgeImageUrl.value = '';
  }
}

function setActiveBadgeImageUrl(url = '') {
  loadSequence += 1;
  activeBadgeImageUrl.value = url;
}

// 같은 멤버 재선택 시에는 발화하지 않으므로 기존 뱃지가 그대로 유지된다
// (같은 사용자의 뱃지라 여전히 유효). id가 실제로 바뀔 때만 다시 불러온다.
watch(currentUserId, () => {
  // 새 사용자의 뱃지가 로드될 때까지 이전 사용자의 뱃지를 보여주지 않는다.
  setActiveBadgeImageUrl('');
  void loadActiveBadge();
}, { immediate: true });

export function useActiveBadge() {
  return { activeBadgeImageUrl, loadActiveBadge, setActiveBadgeImageUrl };
}
