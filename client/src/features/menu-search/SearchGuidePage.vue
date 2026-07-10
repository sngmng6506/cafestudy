<script setup>
const pipeline = [
  '사용자가 한국어로 원하는 기능을 입력합니다.',
  '한국어 메뉴명·설명·키워드·예시 문장을 기준으로 키워드 점수를 계산합니다.',
  '브라우저에서 @ternlight/mini를 필요할 때만 불러와 질의와 메뉴 문장을 임베딩합니다.',
  '키워드 점수 70%와 의미 유사도 점수 30%를 합쳐 상위 메뉴를 추천합니다.',
  'Ternlight 로딩이나 실행이 실패하면 한국어 키워드 검색만으로 계속 동작합니다.',
];

const limitations = [
  'Ternlight는 문장을 384차원 벡터로 바꾸는 초경량 임베딩 모델이며, 답변을 생성하는 챗봇은 아닙니다.',
  '영어 중심 교사 모델을 증류해 만든 모델이라 한국어 의미 검색 품질은 보장되지 않습니다.',
  '한국어 정확도를 보완하기 위해 현재는 키워드 점수를 더 높게 반영합니다.',
  '첫 의미 검색 시 WASM 모델을 내려받고 초기화하므로 기기와 네트워크에 따라 잠시 지연될 수 있습니다.',
  '메뉴 수가 적어 별도 모델 서버나 벡터 데이터베이스 없이 브라우저 메모리에서 비교합니다.',
];
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">자연어 기능 검색</h1>
      <p class="mt-1 text-[14px] leading-relaxed text-[#5f6368]">
        메뉴 이름을 몰라도 하고 싶은 일을 문장으로 입력해 관련 기능을 찾습니다.
      </p>
    </div>

    <article class="surface-card">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-[16px] font-semibold text-[#222222]">Ternlight란?</h2>
        <span class="rounded-full bg-[#e9f8ef] px-2.5 py-1 text-[11px] font-semibold text-[#03883f]">
          브라우저 실행
        </span>
      </div>
      <p class="text-[14px] leading-relaxed text-[#5f6368]">
        Ternlight는 문장의 의미를 작은 숫자 벡터로 바꾸는 경량 임베딩 모델입니다.
        CafeStudy는 <strong class="font-semibold text-[#333333]">@ternlight/mini</strong>를 브라우저에서
        실행하며, 검색 문장을 서버로 보내지 않고 메뉴 문장과의 코사인 유사도를 비교합니다.
      </p>
    </article>

    <article class="surface-card">
      <h2 class="mb-3 text-[16px] font-semibold text-[#222222]">현재 검색 파이프라인</h2>
      <ol class="grid gap-3">
        <li v-for="(step, index) in pipeline" :key="step" class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#03C75A] text-[11px] font-bold text-white">
            {{ index + 1 }}
          </span>
          <p class="pt-0.5 text-[14px] leading-relaxed text-[#5f6368]">{{ step }}</p>
        </li>
      </ol>
    </article>

    <article class="surface-card">
      <h2 class="mb-3 text-[16px] font-semibold text-[#222222]">현재 한계와 잠재 이슈</h2>
      <ul class="grid gap-2.5">
        <li v-for="item in limitations" :key="item" class="flex gap-2.5 text-[14px] leading-relaxed text-[#5f6368]">
          <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#999999]" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </article>

    <article class="rounded-2xl border border-[#dcefe4] bg-[#f5fcf8] p-4">
      <h2 class="text-[14px] font-semibold text-[#03883f]">예시</h2>
      <p class="mt-2 text-[14px] leading-relaxed text-[#5f6368]">
        “지난번 스터디 사진 보고 싶어” → 모임 이력<br />
        “사진 올리고 포인트 받고 싶어” → 인증<br />
        “친구에게 사이트 공유하고 싶어” → 접속 QR
      </p>
    </article>
  </section>
</template>
