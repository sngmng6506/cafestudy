<template>
  <section class="grid gap-5">
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-7 shadow-sm sm:p-8">
      <p class="mb-3 text-sm font-medium text-[#8B95A1]">Open study workflow</p>
      <div class="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-end">
        <div>
          <h2 class="max-w-2xl text-2xl font-bold leading-tight text-[#191F28] sm:text-[28px]">
            카페 스터디를 만들고, 인증하고, 포인트로 이어갑니다.
          </h2>
          <p class="mt-4 max-w-2xl text-[15px] font-normal leading-7 text-[#8B95A1]">
            MVP는 모임 개설, 사진 인증, 포인트 랭킹 세 가지 흐름에 집중합니다.
            각 기능은 탭 단위로 분리되어 스터디원이 하나씩 확장하기 쉽습니다.
          </p>
        </div>

        <div class="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
            <strong class="block text-2xl font-bold text-[#16A34A]">3</strong>
            <span class="mt-1 block text-sm font-medium text-[#8B95A1]">MVP 기능</span>
          </div>
          <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
            <strong class="block text-2xl font-bold text-[#16A34A]">1</strong>
            <span class="mt-1 block text-sm font-medium text-[#8B95A1]">기능별 PR</span>
          </div>
          <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
            <strong class="block text-2xl font-bold text-[#16A34A]">0</strong>
            <span class="mt-1 block text-sm font-medium text-[#8B95A1]">실시간 의존성</span>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 md:grid-cols-2">
      <article class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
        <h3 class="mb-4 text-lg font-semibold text-[#191F28]">지금 가능한 것</h3>
        <ul class="grid gap-3 text-[15px] leading-6 text-[#8B95A1]">
          <li>모임 탭에서 카페 스터디 모임을 개설합니다.</li>
          <li>공개 모임 목록을 바로 확인합니다.</li>
          <li>새 기능은 feature registry에 등록하면 탭으로 붙습니다.</li>
        </ul>
      </article>

      <article class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
        <h3 class="mb-4 text-lg font-semibold text-[#191F28]">다음 확장</h3>
        <ul class="grid gap-3 text-[15px] leading-6 text-[#8B95A1]">
          <li>인증 탭: 사진 업로드와 포인트 지급</li>
          <li>랭킹 탭: 누적 랭킹과 월간 랭킹</li>
          <li>기여자 템플릿: 새 기능 시작점 정리</li>
        </ul>
      </article>
    </section>
  </section>
</template>
