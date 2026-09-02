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
- 누르는 동안 `scale(0.97)` 정도의 짧은 피드백을 줄 수 있다. 색 변화와 함께 써도
  반응이 과장되지 않게 유지한다
- press 피드백은 `--ui-duration-press`와 `--ui-ease-out`을 사용한다

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
  검색과 `⋯`(더보기) 버튼이 한 줄이다. 더보기는 아이콘만 두므로 `aria-label`로
  이름을 준다. 만들기는 이동 수단이 아니라 행동이라 줄을 나눈다.
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

## 모션과 인터랙션

모션은 장식이 아니라 상태 변화와 공간 관계를 설명하고, 입력이 전달됐음을 확인하는
수단이다. 목적을 한 문장으로 설명할 수 없으면 추가하지 않는다. 사용 빈도가 높을수록
짧게 줄이고, 키보드로 반복 실행하는 동작에는 모션을 넣지 않는다.

### 적용 여부

| 사용 빈도·상황 | 기준 |
|---|---|
| 하루 수십 번 이상 반복하는 탐색·토글 | 없애거나 press/color 피드백만 사용 |
| 모달·시트·팝오버·토스트 | 상태와 출처를 설명하는 짧은 모션 허용 |
| 정산 차수·인증 사진처럼 목록이 변함 | 레이아웃 점프를 줄이는 모션 허용 |
| 온보딩·완료 축하·깨부수기처럼 드문 경험 | 기능을 방해하지 않는 범위에서 표현력 허용 |
| 로딩·제출 중 | 실제 처리를 늦추거나 완료된 것처럼 보이게 하는 연출 금지 |

애니메이션을 넣기 전에 목적을 **공간 연결**, **상태 표시**, **입력 피드백**,
**갑작스러운 변화 완화** 중 하나로 분류한다. 단지 재미있어 보인다는 이유는
반복되는 운영 화면에서 충분하지 않다.

### 시간과 easing

컴포넌트에 duration과 cubic-bezier를 직접 반복하지 않고 semantic token을 사용한다.

| 토큰 | 값 | 용도 |
|---|---:|---|
| `--ui-duration-press` | 120ms | 버튼·카드의 누름 피드백 |
| `--ui-duration-fast` | 160ms | tooltip·작은 popover·색 변화 |
| `--ui-duration-normal` | 220ms | 메뉴·toast·일반 상태 전환 |
| `--ui-duration-overlay` | 280ms | modal·bottom sheet |
| `--ui-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | 진입·퇴장과 즉각 반응해야 하는 전환 |
| `--ui-ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | 화면 안에서 위치·크기가 변하는 요소 |
| `--ui-ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | bottom sheet·drawer |

일반 UI 모션은 300ms를 넘기지 않는다. 사용자 입력 직후 천천히 출발하는
`ease-in`은 사용하지 않는다. 일정한 진행 표시만 `linear`를 쓴다.

### 컴포넌트별 기준

- 버튼·누를 수 있는 카드: 누르는 동안만 `scale(0.97)` 정도로 줄인다. 비활성 상태와
  loading 상태에는 적용하지 않는다.
- 더보기 메뉴·알림 팝오버: trigger 위치에서 열리는 것처럼 `transform-origin`을
  trigger 쪽에 둔다. 화면 중앙 modal은 예외로 center를 유지한다.
- modal: opacity와 `scale(0.95~0.98)`를 조합한다. `scale(0)`에서 시작하지 않는다.
- bottom sheet: 자기 높이를 기준으로 `translateY(100%)`에서 들어오며
  `--ui-ease-drawer`를 쓴다.
- toast: 나타난 방향과 사라지는 방향을 일치시킨다. 알림을 읽을 시간을 애니메이션
  duration으로 대신하지 않는다.
- 목록 추가·삭제: opacity와 작은 이동 또는 높이 변화를 함께 사용하되, stagger는
  첫 진입처럼 드문 장면에서만 30~80ms 간격으로 쓴다. 재정렬을 기다리게 하지 않는다.
- loading spinner: 회전은 `linear`로 유지하고, 화면 전체가 완료된 것처럼 먼저
  전환하지 않는다. reduced motion에서는 회전 대신 정적 아이콘과 `불러오는 중`
  텍스트 또는 짧은 opacity 변화로 진행 상태를 전달한다.
- 깨부수기: 의도적으로 과장할 수 있지만 복구 버튼은 즉시 조작 가능해야 한다.

### 구현 원칙

- 빠르게 다시 실행하거나 중간에 방향이 바뀔 수 있는 UI는 keyframe보다 중단·재지정이
  쉬운 CSS transition을 우선한다.
- `transition: all`을 쓰지 않고 `transform`, `opacity`, `background-color`처럼
  바뀌는 속성을 명시한다.
- 레이아웃을 계속 다시 계산하는 `top`, `left`, `width`, `height` 애니메이션보다
  `transform`과 `opacity`를 우선한다. 목록 높이 변화처럼 필요한 예외는 실제
  모바일 기기에서 끊김을 확인한다.
- blur는 두 상태가 겹치는 짧은 crossfade를 다듬을 때만 작게 사용한다. 큰 blur와
  장시간 filter 애니메이션은 특히 모바일 Safari에서 피한다.
- 애니메이션이 끝날 때까지 클릭·스크롤·뒤로 가기를 막지 않는다.
- hover 모션은 `@media (hover: hover) and (pointer: fine)` 안에 둬 터치의 가짜
  hover를 막는다.

### Reduced motion

`prefers-reduced-motion: reduce`에서는 위치 이동, 확대·축소, 회전, stagger를 제거한다.
상태 이해에 필요한 짧은 opacity·색상 전환은 유지할 수 있다. reduced motion을
`transition: none` 하나로 처리해 상태 변화까지 갑자기 끊기게 하지 않는다.

### 모션 리뷰 형식

모션을 추가하거나 수정한 PR은 판단을 비교할 수 있도록 필요할 때 아래 표로 남긴다.

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transform var(--ui-duration-fast) var(--ui-ease-out)` | 바뀌는 속성을 제한하고 반응을 빠르게 한다 |
| `scale(0)`에서 modal 진입 | opacity + `scale(0.96)` | 요소가 무에서 튀어나오는 느낌을 피한다 |
| reduced motion 처리 없음 | 위치 이동 제거, opacity 유지 | 움직임 민감도를 존중하면서 상태 변화는 전달한다 |

DevTools에서 2~5배 느리게 재생해 방향, origin, 속성 간 timing을 확인한 뒤 실제
모바일 기기에서도 터치·스크롤·뒤로 가기를 방해하지 않는지 확인한다.

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
- 모션의 목적과 사용 빈도를 설명할 수 있고 300ms 이내인가
- `transition: all`, `ease-in`, `scale(0)` 같은 금지 패턴을 추가하지 않았는가
- 터치 크기, 포커스, ARIA, reduced motion을 지켰는가
- 실제 모바일 기기에서 모션 중에도 조작과 스크롤이 가능한가
- 실제 디자인 규칙을 바꿨다면 이 문서도 함께 갱신했는가
