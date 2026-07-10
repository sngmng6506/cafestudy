export const menuSearchMetadata = [
  {
    featureName: 'home',
    description: '오늘 일정과 다가오는 모임을 한눈에 확인합니다.',
    searchTerms: ['오늘 일정', '달력', '다가오는 모임', '예정된 모임', '메인 화면'],
    examples: ['오늘 모임 있어?', '다가오는 일정 보고 싶어'],
  },
  {
    featureName: 'meetups',
    description: '새 모임을 만들거나 모집 중인 모임에 참여하고 취소합니다.',
    searchTerms: ['모임 만들기', '스터디 개설', '모임 참여', '신청', '참여 취소'],
    examples: ['새 스터디 만들고 싶어', '참여할 모임 찾아줘', '모임 신청을 취소하고 싶어'],
  },
  {
    featureName: 'verifications',
    description: '모임 참여 사진을 올리고 인증 포인트를 받습니다.',
    searchTerms: ['사진 인증', '참여 인증', '사진 올리기', '포인트 받기'],
    examples: ['오늘 모임 인증할래', '사진 올리고 포인트 받고 싶어'],
  },
  {
    featureName: 'ranking',
    description: '누적 포인트와 월간 활동 순위를 확인합니다.',
    searchTerms: ['순위', '포인트 순위', '월간 랭킹', '누가 1등', '내 등수'],
    examples: ['이번 달 1등 누구야', '내 순위 보고 싶어'],
  },
  {
    featureName: 'members',
    description: '소모임 멤버와 각 멤버의 활동 정보 및 프로필을 확인합니다.',
    searchTerms: ['회원', '사람 찾기', '프로필', '멤버 검색', '누가 있어'],
    examples: ['모임에 누가 있어?', '회원 프로필 보고 싶어'],
  },
  {
    featureName: 'dice',
    description: '주사위를 굴려 무작위 포인트를 받습니다.',
    searchTerms: ['랜덤 포인트', '운', '주사위 굴리기'],
    examples: ['포인트 랜덤으로 받아볼래', '주사위 굴리고 싶어'],
  },
  {
    featureName: 'badges',
    description: 'AI 뱃지를 만들고 보유 뱃지와 대표 뱃지를 관리합니다.',
    searchTerms: ['프로필 꾸미기', 'AI 이미지', '대표 뱃지', '뱃지 만들기', '뱃지 삭제'],
    examples: ['프로필 아이콘 만들고 싶어', '대표 뱃지를 바꾸고 싶어'],
  },
  {
    featureName: 'cafes',
    description: '방문한 카페와 카페 위치, 코멘트 및 인증 사진을 확인합니다.',
    searchTerms: ['방문 카페', '카페 지도', '카페 후기', '카페 위치', '갔던 곳'],
    examples: ['전에 갔던 카페가 어디였지', '카페 지도 보고 싶어'],
  },
  {
    featureName: 'meetup-history',
    description: '완료된 모임과 과거 참석 기록 및 인증 사진을 확인합니다.',
    searchTerms: ['지난 모임', '과거 기록', '예전 사진', '완료된 일정', '참석 이력'],
    examples: ['지난번 스터디 사진 보고 싶어', '내가 참여했던 모임 보여줘'],
  },
  {
    featureName: 'updates',
    description: '서비스의 알려진 문제와 최근 업데이트 내용을 확인합니다.',
    searchTerms: ['오류', '버그', '문제', '업데이트', '공지', '안 되는 기능'],
    examples: ['지금 안 되는 기능이 있어?', '최근에 뭐가 바뀌었어?'],
  },
  {
    featureName: 'search-guide',
    description: '자연어 기능 검색의 동작 방식과 Ternlight 모델 및 한계를 설명합니다.',
    searchTerms: ['검색 안내', '자연어 검색', 'Ternlight', '임베딩', '검색 원리', '검색 한계'],
    examples: ['검색은 어떻게 동작해?', 'Ternlight가 뭐야?', '자연어 메뉴 검색 설명 보여줘'],
  },
  {
    featureName: 'qr',
    description: '모바일 접속 주소와 QR 코드를 확인하고 공유합니다.',
    searchTerms: ['공유', '접속 주소', 'QR 코드', '링크 복사', '친구에게 보내기'],
    examples: ['친구에게 사이트 공유하고 싶어', '접속 QR 보여줘'],
  },
];

export function buildMenuSearchEntries(metadata = menuSearchMetadata) {
  return metadata.flatMap((item) => [
    { featureName: item.featureName, type: 'description', text: item.description },
    ...item.searchTerms.map((text) => ({ featureName: item.featureName, type: 'term', text })),
    ...item.examples.map((text) => ({ featureName: item.featureName, type: 'example', text })),
  ]);
}
