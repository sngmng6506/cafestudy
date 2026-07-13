# Design Guide

CafeStudy의 UI 디자인 기준. 새 UI를 만들거나 기존 UI를 수정할 때 실제 제품과 이 문서를 함께 유지한다.

전체적인 톤: Naver 스타일 — 흰 배경 + 초록 액센트 하나, 회색 텍스트,
테두리·배경 tint로 구획을 나누고 그림자는 최소한으로. 밀도보다 명료함.

## 디자인 시스템 구조

디자인 값은 세 단계로 관리한다.

1. `client/src/styles.css`: 원시 팔레트와 기본 타이포 크기의 단일 원본
2. `client/src/semantic-tokens.css`: 역할에 따른 `--ui-*` 토큰과 공통 `.ui-*` 클래스
3. Vue 컴포넌트: semantic token 또는 공통 클래스를 사용해 화면 구성

컴포넌트에서 `text-[#333333]`, `bg-[#f5f6f7]`처럼 원시 색상을 새로 직접 쓰지 않는다.
기존 하드코딩은 화면을 수정할 때 점진적으로 semantic token으로 치환한다.

예외는 외부 소모임, 모집 상태, 순위처럼 도메인 의미가 명확한 전용 색상이다. 예외 색상도
여러 곳에서 반복되면 먼저 semantic token으로 승격한다.

## 색상

| semantic 역할 | 원시 값 | 용도 |
|---|---:|---|
| brand | `#03C75A` | 브랜드, 1차 CTA, 활성 상태 |
| brand-hover | `#02B350` | brand hover |
| brand-active | `#02A046` | brand pressed |
| surface | `#FFFFFF` | 카드, 탭바, 입력 배경 |
| canvas | `#F7F8F9` | 페이지 배경 |
| surface-subtle | `#F5F6F7` | 카드 내부 tint, 대체 행 배경 |
| surface-hover | `#F1F3F4` | 무채색 요소 hover |
| content | `#333333` | 본문, 제목. 순수 검정은 쓰지 않음 |
| content-muted | `#5F6368` | 메타데이터, 부가 설명 |
| content-caption | `#767676` | 캡션, 잔글씨 |
| content-disabled | `#999999` | 비활성 텍스트, placeholder |
| stroke | `#DADCE0` | 기본 테두리, 구분선 |
| stroke-subtle | `#E9EBEE` | 약한 섹션 구분선 |
| stroke-hover | `#BFC4C9` | outline 요소 hover |
| destructive | `#E74C3C` | 오류, 취소·삭제 액션 |
| link | `#0068C3` | 링크, 정보성 액션 |

### 소모임(외부 크롤링) 액센트 — 보라

크롤링해 온 읽기 전용 데이터와 외부 서비스 이동을 앱 자체 데이터와 구분하는 용도로만 쓴다.
일반 UI의 장식색으로 사용하지 않는다.

- `#7C3AED`: 배지 텍스트, 외부 CTA
- `#6D28D9`: 외부 CTA hover
- `#EDE7FB`: 외부 배지 배경
- `#FAF8FF`: 외부 카드 배경 tint
- `#8B5CF6`: 외부 카드 강조선, 아바타 팔레트

### 아바타 팔레트

`client/src/shared/useAvatar.js`의 이름 해시 팔레트를 사용한다.
전부 흰 텍스트 기준 WCAG AA 4.5:1을 충족하므로 임의로 밝게 바꾸지 않는다.

`#03A150` · `#0068C3` · `#7C3AED` · `#B45309` · `#BE185D`

## 타이포그래피

폰트는 Pretendard이며 system-ui 스택을 fallback으로 사용한다.

| 역할 | 크기 | 기본 두께 | 용도 |
|---|---:|---:|---|
| Display | 32px | 700 | 특별한 성취·게임 결과 등 제한적 사용 |
| Page title | 22px | 700 | 페이지 헤더 |
| Section title | 17px | 700 | 카드·섹션 제목 |
| Body large | 17px | 400 | 강조 본문 |
| Body | 14px | 400 | 일반 문장, 목록 행 |
| Caption | 12~13px | 400 | 타임스탬프, 메타데이터 |

사용 가능한 두께는 Regular 400, Medium 500, Semibold 600, Bold 700이다.

- 700: 페이지·섹션 제목, 핵심 수치
- 600: 좁은 공간의 보조 제목이나 목록 강조
- 500: 버튼, 탭, 라벨
- 400: 본문, 설명, 링크
- 동일한 위계에서 600과 700을 임의로 섞지 않는다.
- 새 페이지 제목과 섹션 제목은 각각 `.ui-page-title`, `.ui-section-title`을 우선 사용한다.

## Radius와 간격

- 간격 스케일: 4 / 8 / 12 / 16 / 20 / 24 / 32px
- 작은 상태 배지: 4px (`--ui-radius-badge`)
- 버튼·입력: 10px (`--ui-radius-control`)
- 목록 행·검색 트리거: 12px (`--ui-radius-item`)
- 카드: 16px (`--ui-radius-card`)
- 모달·바텀시트: 20px (`--ui-radius-overlay`)
- pill·아바타: full (`--ui-radius-pill`)

`rounded`, `rounded-lg`, `rounded-xl`을 모양 감각으로 임의 선택하지 않는다. 역할에 맞는 semantic
radius를 사용한다. 기존 화면은 수정할 때 점진적으로 치환한다.

## 컴포넌트

컴포넌트 높이는 주로 36px, 40px, 44px를 사용한다. 모바일의 핵심 터치 대상은 가능한 44px를 확보한다.

### 버튼

- Primary: brand 배경, 흰 텍스트, control radius, 500
- Secondary: surface 배경, content 텍스트, stroke 테두리, control radius
- Danger: destructive 텍스트·테두리. 실제 위험 행동에만 사용
- 외부 소모임 CTA: 보라색 배경. 문구에 외부 서비스 이름을 포함
- `확인`, `계속` 같은 모호한 라벨 대신 결과가 예상되는 행동형 문구를 사용한다.

### 입력

- surface 배경, stroke 테두리, control radius, 높이 40px
- focus 시 brand 테두리 또는 공통 focus ring
- placeholder는 content-disabled
- 터치 기기에서 16px 미만 입력 글자 때문에 자동 확대가 발생하지 않도록 전역 규칙을 유지한다.

### 카드

표준 카드는 `.surface-card`를 사용한다.

- surface 배경
- radius 16px
- padding 20px
- 테두리·그림자 없음
- canvas 위에서 여백으로 구획

내부 요소가 자체 패딩을 갖는 리스트·아코디언은 `.surface-card--flush`를 사용한다.
외부 소모임 카드는 보라색 강조선과 `#FAF8FF` tint로 구분한다.

### 배지·칩

- 선택형 pill: surface-subtle 배경, content 텍스트. 선택 시 brand 배경과 흰 텍스트
- 외부 소모임 배지: `#EDE7FB` 배경과 `#7C3AED` 텍스트
- 모집 중: `#E9F8EF` 배경과 `#03883F` 텍스트
- 마감: surface-subtle 배경과 content-muted 텍스트
- 색상만으로 상태를 전달하지 않고 텍스트를 병행한다.

### 아바타

- 원형, 24~40px
- 이미지가 없으면 이니셜과 해시 팔레트 사용
- 랭킹 1~3위는 ring으로 강조하되 순위 숫자도 함께 제공

## 레이아웃과 그림자

- 모바일 우선, 기본 컨테이너 `max-w-md`
- 하단 탭바는 safe-area를 고려
- 그림자는 모달·드롭다운·고정 탭바처럼 실제로 떠 있는 요소에만 사용
- 일반 카드는 그림자 대신 배경 차이와 간격으로 구분
- subtle: `0 1px 2px rgba(0,0,0,0.06)`
- standard: `0 2px 8px rgba(0,0,0,0.1)`

## 접근성

- 모든 `button`, `a`, `[role="button"]`에는 키보드 포커스가 보여야 한다. 커스텀 요소는 `focus-ring` 사용
- 아이콘만 있는 버튼에는 동작을 설명하는 `aria-label` 제공
- toggle·accordion에는 `aria-expanded`, 선택 상태에는 `aria-pressed` 등 상태 속성 제공
- 색상만으로 정보를 전달하지 않음
- 외부 텍스트를 `v-html`로 렌더링할 때 반드시 이스케이프
- 애니메이션은 `prefers-reduced-motion`을 지원

## 아이콘과 이모지

- 아이콘 라이브러리는 `@lucide/vue` 하나만 사용
- 16px: 인라인, 18~20px: 버튼, 24px: 독립 아이콘
- 색상은 `currentColor` 상속. fill·stroke를 직접 하드코딩하지 않음
- UI 라벨과 상태 표시에 이모지를 사용하지 않음. Lucide 아이콘이나 텍스트 상태로 대체

## 변경 체크리스트

UI 변경 PR에서는 다음을 확인한다.

- 새 원시 색상값을 컴포넌트에 직접 추가하지 않았는가
- 동일 역할에 같은 semantic token과 타이포 위계를 사용했는가
- 버튼 문구만 보고 다음 결과를 예상할 수 있는가
- 빈 상태와 오류가 다음 행동을 알려 주는가
- 포커스·ARIA·reduced motion 규칙을 지켰는가
- 실제 제품을 바꿨다면 이 가이드도 함께 갱신했는가

사용자 문구의 목소리와 용어 기준은 [WRITING_GUIDE.md](./WRITING_GUIDE.md)를 따른다.
