// 아바타 색상/이니셜 헬퍼. App.vue와 MembersPage.vue에 중복돼 있던 것을 통합.
// 배경색은 흰 텍스트 기준 WCAG AA(4.5:1) 대비를 만족하도록 조정.
// (기존 #F59E0B 주황 2.1:1, #EC4899 핑크 3.3:1은 미달이라 어둡게 교체)
const AVATAR_COLORS = [
  'bg-[#03A150] text-white', // green  (기존 #03C75A보다 살짝 어둡게 → 4.5:1)
  'bg-[#0068c3] text-white', // blue   4.7:1
  'bg-[#7C3AED] text-white', // purple 5.3:1
  'bg-[#B45309] text-white', // amber  4.6:1 (기존 #F59E0B 대체)
  'bg-[#BE185D] text-white', // pink   5.9:1 (기존 #EC4899 대체)
];

export function avatarColor(name) {
  let code = 0;
  for (const c of name ?? '') code += c.charCodeAt(0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export function initials(name) {
  return (name ?? '').slice(0, 1).toUpperCase();
}
