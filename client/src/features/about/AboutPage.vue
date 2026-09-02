<script setup>
// lucide는 브랜드 아이콘을 제공하지 않아 GitHub 마크 대신 코드 아이콘을 쓴다.
import { CodeXml, ExternalLink, Heart } from '@lucide/vue';

const REPOSITORY_URL = 'https://github.com/sngmng6506/cafestudy';

// 무엇으로 만들었는지. 버전은 적지 않는다 — 코드와 따로 놀기 시작하면
// 없느니만 못한 정보가 된다.
const STACK = [
  { label: '프론트엔드', value: 'Vue 3 · Vite · Tailwind CSS' },
  { label: '백엔드', value: 'Node.js · Express · PostgreSQL' },
  { label: '장소 검색', value: '카카오 로컬 API' },
  { label: '지도', value: 'Leaflet · OpenStreetMap' },
];
</script>

<template>
  <section class="grid gap-5">
    <div class="surface-card">
      <h2 class="ui-section-title">CafeStudy</h2>
      <p class="ui-text-muted mt-2 text-[15px] leading-relaxed break-keep">
        홍대 IT&AI 스터디 모임을 위해 만든 앱이에요. 모임을 만들고, 참여하고,
        다녀온 카페를 기록해요.
      </p>
    </div>

    <div class="surface-card">
      <h3 class="ui-section-title">소스 코드</h3>
      <p class="ui-text-muted mt-2 text-[14px] leading-relaxed break-keep">
        공개 저장소예요. 코드를 보거나, 버그를 알려주거나, 직접 고쳐서 보내주셔도 좋아요.
      </p>
      <a
        class="focus-ring ui-radius-control ui-border mt-4 flex h-12 items-center justify-center gap-2 border text-[15px] font-semibold ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)]"
        :href="REPOSITORY_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        <CodeXml :size="18" />
        GitHub에서 보기
        <ExternalLink :size="14" class="ui-text-muted" />
      </a>
    </div>

    <div class="surface-card">
      <h3 class="ui-section-title">무엇으로 만들었나</h3>
      <dl class="mt-4 grid gap-3">
        <div v-for="item in STACK" :key="item.label" class="flex gap-3 text-[14px]">
          <dt class="ui-text-muted w-20 shrink-0 font-semibold">{{ item.label }}</dt>
          <dd class="ui-text min-w-0 break-keep font-medium">{{ item.value }}</dd>
        </div>
      </dl>
    </div>

    <p class="ui-text-caption flex items-center justify-center gap-1.5 pb-2 text-[13px]">
      <Heart :size="13" />
      홍대 IT&AI 스터디
    </p>
  </section>
</template>
