import { ref } from 'vue';

// '깨부수기' 장난 모드. 켜면 앱 전체 UI가 깨진 것처럼 뒤틀리고(styles.css의
// .smashed 규칙), 더보기 휠의 항목 이름이 '원래대로'로 바뀐다.
// 새로고침해도 깨진 채 유지되도록 localStorage에 저장 — 그래야 라벨과
// 상태가 어긋나지 않는다.
const STORAGE_KEY = 'cafestudy_smashed';

const smashed = ref(localStorage.getItem(STORAGE_KEY) === 'true');

export function useSmash() {
  function toggleSmash() {
    smashed.value = !smashed.value;
    localStorage.setItem(STORAGE_KEY, smashed.value ? 'true' : 'false');
  }

  return { smashed, toggleSmash };
}
