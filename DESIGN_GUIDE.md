# Design Guide

CafeStudy UI의 시각·컴포넌트·접근성 기준. 사용자 문구는 [WRITING_GUIDE.md](./WRITING_GUIDE.md)를 따른다.

전체 톤은 흰 배경, 초록 액센트, 회색 텍스트를 중심으로 한 명료한 모바일 UI다. 일반 카드는 그림자보다 배경 차이와 여백으로 구분한다.

## 구조

1. `client/src/styles.css`: 원시 팔레트와 기본 타이포
2. `client/src/semantic-tokens.css`: 역할 기반 `--ui-*` 토큰과 `.ui-*` 클래스
3. Vue 컴포넌트: semantic token과 공통 클래스로 화면 구성

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
| link | `#0068C3` | 링크, 정보성 액션 |

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
- button/input: 10px (`--ui-radius-control`)
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

- surface 배경, stroke 테두리, 높이 40px
- focus 시 brand 테두리 또는 공통 focus ring
- placeholder는 content-disabled
- 모바일 자동 확대 방지를 위해 입력 글자 16px 이상 유지

### 카드

표준 카드는 `.surface-card`를 사용한다.

- surface 배경
- card radius
- padding 20px
- 기본적으로 테두리·그림자 없음

자체 패딩이 있는 리스트·아코디언은 `.surface-card--flush`를 사용한다.

### 배지·칩

- 선택형 pill: surface-subtle, 선택 시 brand와 흰 텍스트
- 모집 중: `#E9F8EF` / `#03883F`
- 마감: surface-subtle / content-muted
- 색상만으로 상태를 구분하지 않고 텍스트를 함께 제공

### 아바타

- 원형, 24~40px
- 이미지가 없으면 이니셜과 해시 팔레트
- 랭킹 강조는 ring과 순위 숫자를 함께 사용

## 레이아웃과 그림자

- 모바일 우선, 기본 컨테이너 `max-w-md`
- 하단 탭바는 safe-area 고려
- 그림자는 모달·드롭다운·고정 탭바처럼 떠 있는 요소에만 사용
- subtle: `0 1px 2px rgba(0,0,0,0.06)`
- standard: `0 2px 8px rgba(0,0,0,0.1)`

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
