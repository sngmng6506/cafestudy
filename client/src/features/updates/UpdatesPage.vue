<script setup>
// 알려진 이슈 & 개선 예정 목록.
// 지금은 정적 데이터. 항목이 늘거나 상태가 바뀌면 이 배열만 수정하면 된다.
// (백엔드로 옮길 만큼 많아지면 그때 API로 승격)
const knownIssues = [
  {
    title: '같은 카페가 여러 개로 집계됨',
    status: 'planned', // planned | in-progress | done
    problem:
      '카페 이름이 "아비아채", "아비아채 지하1층"처럼 조금씩 다르게 입력되면 서로 다른 카페로 집계됩니다. 방문 통계와 코멘트가 갈라집니다.',
    plan: '며칠에 한 번 AI(Claude Haiku)가 카페 이름 목록을 보고 같은 곳끼리 묶어 대표 이름으로 정규화할 예정입니다. 원본 데이터는 그대로 두고 별칭 매핑만 관리해 안전하게 되돌릴 수 있게 합니다.',
  },
  {
    title: '자연어 기능 검색의 한국어 정확도 편차',
    status: 'in-progress',
    problem:
      'Ternlight는 영어 중심 임베딩 모델이라 한국어 문장끼리의 의미 유사도는 표현에 따라 흔들릴 수 있습니다. 첫 검색에서는 WASM 모델 로딩 때문에 기기와 네트워크에 따라 지연이 생길 수도 있습니다.',
    plan: '한국어 키워드 점수를 70%, Ternlight 의미 점수를 30%로 반영하고, 모델 로딩이나 실행이 실패하면 키워드 검색만 사용합니다. 실제 검색 문장을 수집해 메뉴별 예시와 가중치를 계속 조정할 예정입니다.',
  },
];

const statusMeta = {
  planned: { label: '개선 예정', cls: 'bg-[#EDE7FB] text-[#7C3AED]' },
  'in-progress': { label: '진행 중', cls: 'bg-[#e9f8ef] text-[#03883f]' },
  done: { label: '완료', cls: 'bg-[#f5f6f7] text-[#5f6368]' },
};
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">알려진 이슈 & 개선 예정</h1>
    </div>

    <ul class="grid gap-3">
      <li v-for="issue in knownIssues" :key="issue.title" class="surface-card">
        <div class="mb-3 flex items-start justify-between gap-3">
          <h2 class="text-[16px] font-semibold text-[#222222]">{{ issue.title }}</h2>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="statusMeta[issue.status].cls"
          >
            {{ statusMeta[issue.status].label }}
          </span>
        </div>

        <div class="grid gap-3">
          <div>
            <p class="mb-1 text-[12px] font-semibold text-[#999999]">문제</p>
            <p class="text-[14px] leading-relaxed text-[#5f6368]">{{ issue.problem }}</p>
          </div>
          <div>
            <p class="mb-1 text-[12px] font-semibold text-[#999999]">해결 계획</p>
            <p class="text-[14px] leading-relaxed text-[#5f6368]">{{ issue.plan }}</p>
          </div>
        </div>
      </li>
    </ul>

    <p class="px-1 text-[13px] text-[#999999]">
      다른 문제를 발견하면 팀에 알려주세요.
    </p>
  </section>
</template>
