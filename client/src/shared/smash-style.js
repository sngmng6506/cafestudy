// 깨부수기 모드의 랜덤 파괴 스타일. 서버의 updated_at을 시드로 쓰는
// 결정적 난수라서 모든 사용자가 같은 파괴 패턴을 보고, 깨부술 때마다
// (updated_at이 바뀌므로) 새로운 패턴이 나온다.
// 순수 함수 — test/smash-style.test.js에서 회귀 검증.

// 문자열/숫자 시드 → 32bit 정수.
function hashSeed(input) {
  const str = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — 같은 시드면 같은 수열.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOT_COUNT = 10;

// CSS 커스텀 프로퍼티 객체를 만든다. styles.css의 .smashed 규칙이 참조한다.
export function smashStyleVars(seedInput) {
  const rand = mulberry32(hashSeed(seedInput));
  const spread = (range) => (rand() * 2 - 1) * range;

  const vars = {
    // 색 뒤틀림: 원색을 확실히 벗어나는 60~300도 회전 + 채도 요동
    '--sm-hue': `${Math.round(60 + rand() * 240)}deg`,
    '--sm-sat': (0.8 + rand() * 1.1).toFixed(2),
    '--sm-ls': `${(rand() * 4).toFixed(1)}px`,
  };

  for (let i = 1; i <= SLOT_COUNT; i += 1) {
    vars[`--sm-r${i}`] = `${(spread(4) + Math.sign(spread(1) || 1) * 1.2).toFixed(2)}deg`;
    vars[`--sm-x${i}`] = `${spread(12).toFixed(1)}px`;
    vars[`--sm-y${i}`] = `${spread(10).toFixed(1)}px`;
    vars[`--sm-k${i}`] = `${spread(2.5).toFixed(2)}deg`;
  }

  return vars;
}
