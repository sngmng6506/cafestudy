# Design Guide

CafeStudy의 UI 디자인 기준. 실제 컴포넌트(`client/src/`)에서 쓰는 값만 담습니다.
값의 원본은 `client/src/styles.css`의 CSS 변수 — 이 문서와 어긋나면 styles.css가 정답입니다.

전체적인 톤: Naver 스타일 — 흰 배경 + 초록 액센트(`#03C75A`) 하나, 회색 텍스트,
테두리·배경 tint로 구획을 나누고 그림자는 최소한으로. 밀도보다 명료함.

## 색상

`styles.css`의 `:root` CSS 변수가 원본. Tailwind에서는 `text-[#333333]`처럼 직접 쓴다.

| 역할 | 값 | 용도 |
|------|-----|------|
| accent | `#03C75A` | 브랜드/1차 CTA/활성 상태. hover `#02b350`, active `#02a046` |
| bg | `#ffffff` | 페이지·카드 배경 |
| sub-bg | `#f5f6f7` | 카드 내부 tint, 대체 행 배경 |
| text | `#333333` | 본문·제목 (순수 검정 안 씀) |
| muted | `#5f6368` | 메타데이터, 부가 설명 |
| caption | `#767676` | 캡션, 잔글씨 |
| disabled | `#999999` | 비활성 텍스트, placeholder |
| border | `#dadce0` | 구분선, 카드 테두리 |
| border-subtle | `#e9ebee` | 섹션 구분선 |
| danger | `#e74c3c` | 에러, 취소 액션 |
| safe(link) | `#0068c3` | 링크, 정보성 |

### 소모임(외부 크롤링) 액센트 — 보라
크롤링해온 읽기전용 데이터(정모 등)를 앱 자체 데이터와 구분하는 용도로만 쓴다.
일반 UI에는 쓰지 않는다.
- `#7C3AED` 배지 텍스트·CTA 배경 / `#6D28D9` CTA hover / `#8B5CF6` 아바타 5번째 색
- `#EDE7FB` 배지 배경 / `#FAF8FF` 카드 배경 tint

### 아바타 팔레트 (`client/src/shared/useAvatar.js`)
이름 해시로 5색 순환. **전부 흰 텍스트 기준 WCAG AA(4.5:1) 충족** — 더 밝은 색으로
바꾸지 않는다(접근성 회귀).
`#03A150`(green) · `#0068c3`(blue) · `#7C3AED`(purple) · `#B45309`(amber) · `#BE185D`(pink)

## 타이포그래피

폰트: **Pretendard** (fallback: system-ui 스택). `styles.css`에서 전역 지정.

| 역할 | 크기 | 두께 | 비고 |
|------|------|------|------|
| Page title | 22px | 700 | 페이지 헤더 |
| Card title | 17px | 700 | 카드 제목 |
| Body large | 17px | 400 | 본문. `letter-spacing: -0.34px` (한글 리듬) |
| Body | 14px | 400 | 목록 행, 일반 텍스트 |
| Caption | 12~13px | 400 | 타임스탬프, 메타데이터 |

- 세 가지 두께로 충분: Regular(400) / Medium(500) / Bold(700)
- 제목은 700으로 앵커, 네비/링크는 400 유지 — 두께 대비가 위계 신호

## 컴포넌트

실제 컴포넌트에서 쓰는 패턴. 높이는 대부분 `h-9`(36px)/`h-10`(40px)/`h-11`(44px).

### 버튼
- **Primary**: `#03C75A` 배경, 흰 텍스트, `rounded`(4px), 700. hover `#02b350`.
  비활성 `disabled:opacity-50`
- **Secondary/Outline**: 흰 배경, `#333333` 텍스트, `1px solid #dadce0`, hover `#f5f6f7`
- **Danger**: `#e74c3c` 테두리·텍스트 (모임 취소 등)
- **소모임 CTA**: `#7C3AED` 배경, 흰 텍스트 ("소모임에서 신청" 등 외부 이동)

### 인풋
- 흰 배경, `1px solid #dadce0`, `rounded`(4px), 높이 40px, focus 시 `#03C75A` 테두리
- placeholder `#999999`

### 카드
- 흰 배경, `1px solid #dadce0` 또는 `#e9ebee`, radius 8~16px
- 소모임 정모 카드는 좌측 `border-l-[3px] border-l-[#8B5CF6]` + `#FAF8FF` 배경으로 구분

### 배지·칩
- Pill: `rounded-full`, 배경 `#f5f6f7`, 텍스트 `#333333`. 선택 시 `#03C75A` 배경 흰 텍스트
- 소모임 배지: `#EDE7FB` 배경 `#7C3AED` 텍스트
- 상태 배지(모집중/마감): 모집중 = `#03C75A` 테두리, 마감 = `#f5f6f7` 회색

### 아바타
- 원형(`rounded-full`), 24~40px. 이미지 없으면 이니셜 + 해시 색(위 팔레트)
- 랭킹 1~3위는 링(`ring-2`)으로 강조

## 레이아웃

- 간격 스케일: 4 / 8 / 12 / 16 / 20 / 24 / 32 (px)
- 모바일 우선: 컨테이너 `max-w-md`, 하단 탭바 + safe-area
- Border radius: 4px(버튼·인풋·배지) / 8px(카드) / 12~16px(큰 패널) / 9999px(pill·아바타)
- 그림자는 최소한 — 구분은 테두리·배경 tint로. 떠 있는 요소(모달·드롭다운)만 그림자:
  - subtle `0 1px 2px rgba(0,0,0,0.06)` / standard `0 2px 8px rgba(0,0,0,0.1)`

## 접근성

- 모든 인터랙티브 요소에 `focus-ring`(포커스 표시). 커스텀 버튼엔 `aria-label`
- 색상만으로 정보 전달하지 않기 — 상태는 텍스트/아이콘 병행
- 아바타·배지 색은 흰 텍스트 기준 WCAG AA 충족 값 사용 (위 팔레트)
- 크롤링/외부 텍스트를 `v-html`로 넣을 때 반드시 이스케이프 (XSS)

## 아이콘

- 라이브러리: **`@lucide/vue`** 하나만 사용 (섞지 않는다)
- 인라인 컴포넌트로, 크기 16px(인라인) / 18~20px(버튼) / 24px(독립)
- 색은 `currentColor` 상속 — fill/stroke 하드코딩 금지

## 이모지 금지

UI 요소·라벨·상태 표시에 이모지를 쓰지 않는다(플랫폼마다 렌더링이 달라 깨짐).
Lucide 아이콘으로 대체. 상태는 색 점이나 아이콘으로 표시.
