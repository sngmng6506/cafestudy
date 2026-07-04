// 더보기 기능 휠(FeatureWheel)의 회전 수학. 렌더링과 분리된 순수 함수로,
// 스냅/정점 계산이 틀어지면 회귀 테스트(test/wheel-math.test.js)가 잡는다.
//
// 좌표 규약: 각도는 도(deg). 항목 i의 화면 각도 = i * step + rotation.
// 0°가 정점(12시, 수직 위치)이고 시계 방향이 양수다.

// 각도를 [-180, 180) 범위로 정규화.
export function normalizeAngle(angle) {
  const a = ((angle % 360) + 540) % 360;
  return a - 180;
}

// 회전이 멈출 때 자석처럼 끌려갈 목표 회전값:
// 어떤 항목이 정확히 정점(0°)에 오는, 현재와 가장 가까운 회전.
export function snapTarget(rotation, step) {
  return Math.round(rotation / step) * step;
}

// 현재 회전에서 정점(12시)에 가장 가까운 항목의 인덱스.
export function apexIndex(rotation, step, count) {
  const raw = Math.round(-rotation / step);
  return ((raw % count) + count) % count;
}

// 항목 i의 현재 화면 각도 (정점 기준, [-180, 180)).
export function itemAngle(index, rotation, step) {
  return normalizeAngle(index * step + rotation);
}
