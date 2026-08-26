# Design Guide

CafeStudy UI의 시각·컴포넌트·접근성 기준. 사용자 문구는 [WRITING_GUIDE.md](./WRITING_GUIDE.md)를 따른다.

전체 톤은 흰 배경, 초록 액센트, 회색 텍스트를 중심으로 한 명료한 모바일 UI다. 일반 카드는 그림자보다 배경 차이와 여백으로 구분한다.

## 구조

1. `client/src/styles.css`: 원시 팔레트(`--color-gray-300`처럼 색 이름만 담는다)와 기본 타이포
2. `client/src/semantic-tokens.css`: 역할 기반 `--ui-*` 토큰과 `.ui-*` 클래스. 원시값은 여기서만 참조한다
3. Vue 컴포넌트: semantic token과 공통 클래스로 화면 구성

원시 팔레트 이름은 "무슨 색인지"만, semantic 토큰 이름은 "어디 쓰는지"만 말한다.
컴포넌트가 `--color-*`를 직접 참조하면 이 분리가 깨진다.

컴포넌트에 새 hex 색상이나 `text-[#...]`, `bg-[#...]`를 직접 추가하지 않는다. 반복되는 도메인 색상도 token으로 승격한다.

## 색상

| 역할 | 값 | 용도 |
|---|---:|---|
| brand | `#03C75A` | 1차 CTA, 활성 상태 |
| brand-hover | `#02B350` | hover |
| brand-active | `#02A046` | pressed |
| surface | `#FFFFFF` | 카드, 입력, 탭바 |
| canvas | `#F7F8F9` | 페이지 배경 |
| surface-subtle | `#F5F6F7` | 내부 tint, 비활성 영역 |
| surface-hover | `#F1F3F4` | 무채색 hover |
| content | `#333333` | 제목, 본문 |
| content-muted | `#5F6368` | 보조 정보 |
| content-caption | `#767676` | 캡션 |
| content-disabled | `#999999` | 비활성, placeholder |
| stroke | `#DADCE0` | 기본 테두리 |
| stroke-subtle | `#E9EBEE` | 약한 구분선 |
| destructive | `#E74C3C` | 오류, 삭제 |
| destructive-surface | `#FFF1F2` | 오류 메시지 배경 |
| success-surface | `#E9F8EF` | 긍정·활성 상태 배경 (모집중, 인증 완료, 진행 중) |
| success-content | `#03883F` | 긍정·활성 상태 전경 |
| external | `#10B981` | 외부 출처(소모임) 강조선·점 |
| external-strong | `#059669` | 외부 출처 액션 버튼 |
| link | `#0068C3` | 저강도 텍스트 액션(모두 읽음, 수정)과 실제 링크 |

컴포넌트에서는 위 값을 직접 쓰지 말고 `text-[var(--ui-color-content)]`,
`bg-[var(--ui-color-surface-subtle)]`처럼 token 변수를 참조한다. `hover:`,
`placeholder:` 같은 variant와도 그대로 조합된다. 색 하나만 필요한 곳은
`.ui-text-muted` 같은 공통 클래스를 써도 된다.

아바타는 `client/src/shared/useAvatar.js`의 이름 해시 팔레트를 사용한다. 흰 텍스트 대비를 위해 임의로 밝게 바꾸지 않는다.

## 타이포그래피

폰트는 Pretendard, fallback은 system-ui다.

| 역할 | 크기 | 두께 |
|---|---:|---:|
| Display | 32px | 700 |
| Page title | 22px | 700 |
| Section title | 17px | 700 |
| Body large | 17px | 400 |
| Body | 14px | 400 |
| Caption | 12~13px | 400 |

사용 두께는 400/500/600/700으로 제한한다. 같은 위계에서 600과 700을 임의로 섞지 않는다. 페이지와 섹션 제목은 `.ui-page-title`, `.ui-section-title`을 우선 사용한다.

## 간격과 radius

- 간격: 4 / 8 / 12 / 16 / 20 / 24 / 32px
- badge: 4px (`--ui-radius-badge`)
- input: 4px (`--ui-radius-input`)
- button: 10px (`--ui-radius-control`)
- list item: 12px (`--ui-radius-item`)
- card: 16px (`--ui-radius-card`)
- modal/sheet: 20px (`--ui-radius-overlay`)
- pill/avatar: full (`--ui-radius-pill`)

Tailwind radius 단계를 감각적으로 고르지 말고 역할 token을 사용한다.

## 컴포넌트

기본 높이는 36/40/44px를 사용하며 모바일 핵심 터치 대상은 가능한 44px를 확보한다.

### 버튼

- Primary: brand 배경, 흰 텍스트
- Secondary: surface 배경, content 텍스트, stroke 테두리
- Danger: destructive 계열, 실제 위험 행동에만 사용
- radius는 control token 사용

버튼 문구 규칙은 `WRITING_GUIDE.md`를 따른다.

### 입력

표준 입력은 `.ui-input`을 사용한다. 높이 40px, input radius(4px), surface-subtle 배경,
stroke 테두리, placeholder는 content-disabled, focus 시 brand 테두리다.

`.ui-input`은 레이어 밖 규칙이라 Tailwind 유틸리티보다 우선한다. 좌측 아이콘이 붙는
검색 입력은 `pl-*` 대신 `.ui-input--with-icon`을 함께 쓴다.

입력 글자는 모바일 자동 확대 방지를 위해 16px 이상으로 유지한다.

### 카드

표준 카드는 `.surface-card`를 사용한다.

- surface 배경
- card radius
- padding 20px
- 기본적으로 테두리·그림자 없음

자체 패딩이 있는 리스트·아코디언은 `.surface-card--flush`를 사용한다.

### 배지·칩

- 선택형 pill: surface-subtle, 선택 시 brand와 흰 텍스트
- 모집 중 등 긍정 상태: `.ui-badge-success`
- 마감 등 중립 상태: `.ui-badge-neutral`
- 색상만으로 상태를 구분하지 않고 텍스트를 함께 제공

### 외부 출처 표시

소모임에서 가져온 읽기 전용 모임은 브랜드 그린이 아니라 external 계열로 구분한다.

- 카드: `.ui-external-surface`와 왼쪽 강조선
- 표시 점: `.ui-external-accent`
- 소모임 앱으로 나가는 버튼: `.ui-button-external`

### 잠금 상태

로그인이 필요해 쓸 수 없는 탭·버튼은 숨기지 않고 잠금으로 표시해 기능의 존재를 알린다.

- 흐리게(`opacity` 40~45%) + 아이콘에 자물쇠 배지를 함께 사용한다.
  투명도만으로 상태를 표현하지 않는다.
- `disabled` 대신 `aria-disabled`를 쓴다. 키보드 포커스를 유지해야 이유를 안내할 수 있다.
- 눌렀을 때 아무 반응이 없으면 고장으로 읽힌다. 왜 막혔는지 알리고 로그인으로 이어준다.

### 아바타

- 원형, 24~40px
- 이미지가 없으면 이니셜과 해시 팔레트
- 랭킹 강조는 ring과 순위 숫자를 함께 사용

## 레이아웃과 그림자

- 모바일 우선, 기본 컨테이너 `max-w-md`
- 하단 바는 safe-area 고려. 탭은 없다 — 구분선 위에 `모임 만들기`, 아래에 기능
  검색과 `더보기`가 한 줄이다. 만들기는 이동 수단이 아니라 행동이라 줄을 나눈다.
  검색·더보기와 한 칸에 섞으면 셋이 같은 무게로 보인다.
- 하단 바 위에 뜨는 것(더보기 메뉴 등)은 바 높이를 상수로 박지 말고
  `--ui-bottom-bar-height`를 쓴다. `App.vue`가 실제 높이를 재서 넣는다 — 예전에
  한 줄짜리 탭바 높이를 박아 뒀다가 바가 두 줄이 되자 메뉴가 바 뒤로 들어갔다. 화면 이동은 전부 `더보기` 메뉴로 하고, 홈이 `order: 0`이라
  그 목록 맨 위에 온다.
- `모임 만들기`는 셸이 소유한다(`App.vue`의 `CreateMeetupDialog`). 어느 화면에서도
  같은 자리에 있어야 해서 화면 하나에 매달지 않는다. 화면 안에 만들기 폼을 또 두면
  같은 입력이 두 벌이 되어 갈라진다.
- 그림자는 모달·드롭다운·고정 탭바처럼 떠 있는 요소에만 사용
- subtle: `0 1px 2px rgba(0,0,0,0.06)`
- standard: `0 2px 8px rgba(0,0,0,0.1)`

### 쌓임 레이어

`z-50` 같은 숫자를 화면에 직접 쓰지 않는다. 셸(`App.vue`)이 고정 탭바를 소유하고
페이지보다 나중에 그려지므로, 같은 값을 쓰면 화면 안에서 띄운 팝업이 탭바 밑으로
들어가 버튼을 누를 수 없다. 아래 유틸리티를 쓴다.

| 클래스 | 값 | 용도 |
|---|---|---|
| `ui-layer-menu` | 40 | 탭바에서 펼치는 메뉴. 탭바가 계속 보여야 해 아래에 둔다 |
| `ui-layer-shell` | 50 | 고정 탭바 등 셸이 소유한 크롬 |
| `ui-layer-overlay` | 60 | 시트·모달과 배경막. 셸 위에 온다 |
| `ui-layer-toast` | 80 | 오버레이 위에도 보여야 하는 알림 |

부모 안에 갇힌 `absolute` 드롭다운(예: 알림 종)은 자기 스택 컨텍스트 안에서만
겨루므로 해당되지 않는다.

확인 팝업은 가운데(`items-center`)에 띄운다. 아래에 붙이면 탭바와 같은 자리에서
겹친다. 목록을 훑는 선택 시트만 바텀시트로 둔다.

## 접근성

- 모든 인터랙티브 요소에 키보드 포커스 표시
- 아이콘 버튼에 동작을 설명하는 `aria-label`
- toggle/accordion에 `aria-expanded`, 선택 상태에 `aria-pressed`
- 색상만으로 정보 전달 금지
- 외부 텍스트를 `v-html`로 렌더링할 때 이스케이프
- 애니메이션은 `prefers-reduced-motion` 지원

## 아이콘

- `@lucide/vue`만 사용
- 16px 인라인, 18~20px 버튼, 24px 독립 아이콘
- `currentColor` 상속, fill/stroke 직접 하드코딩 금지
- UI 라벨과 상태 표시에 이모지 사용 금지

## UI 변경 체크

- 새 원시 색상이나 임의 radius를 추가하지 않았는가
- 동일 역할에 같은 token과 타이포 위계를 사용했는가
- 터치 크기, 포커스, ARIA, reduced motion을 지켰는가
- 실제 디자인 규칙을 바꿨다면 이 문서도 함께 갱신했는가
