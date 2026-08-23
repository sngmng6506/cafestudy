import { ref } from 'vue';

// 현재 열린 탭. 셸(App.vue)과 화면 안의 이동 버튼이 같은 상태를 봐야 하므로
// 모듈 스코프에 둔다.
const activeFeatureName = ref('home');

export function useFeatureNav() {
  function goToFeature(name) {
    activeFeatureName.value = name;
  }

  return { activeFeatureName, goToFeature };
}
