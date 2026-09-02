<script setup>
import { onMounted, ref } from 'vue';
import { Copy, QrCode, Check } from '@lucide/vue';
import QRCode from 'qrcode';
import { useToast } from '../../shared/useToast.js';

const toast = useToast();

// 현재 배포 주소가 곧 모바일 접속 주소다. 환경(로컬/Railway)에 따라 자동.
const url = window.location.origin;
const canvasEl = ref(null);
const copied = ref(false);

onMounted(async () => {
  try {
    await QRCode.toCanvas(canvasEl.value, url, {
      width: 220,
      margin: 2,
      color: { dark: '#333333', light: '#ffffff' },
    });
  } catch {
    toast.error('QR 코드를 만들지 못했어요.');
  }
});

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    toast.error('주소를 복사하지 못했어요. 직접 선택해 복사해 주세요.');
  }
}
</script>

<template>
  <section class="grid gap-5">
    <section class="surface-card">
      <div class="mb-4 flex items-center gap-2">
        <QrCode :size="18" class="text-[var(--ui-color-brand)]" />
        <h2 class="text-lg font-semibold text-[var(--ui-color-content)]">모바일 접속 주소</h2>
      </div>

      <div class="grid justify-items-center gap-4">
        <canvas
          ref="canvasEl"
          class="rounded-xl border border-[var(--ui-color-stroke)] bg-white p-2"
          aria-label="접속 주소 QR 코드"
        ></canvas>

        <p class="break-all text-center text-[14px] font-medium text-[var(--ui-color-content-muted)]">{{ url }}</p>

        <button
          class="focus-ring ui-radius-control flex h-11 w-full items-center justify-center gap-2 border border-[var(--ui-color-stroke)] text-[15px] font-semibold text-[var(--ui-color-content)] ui-transition-colors hover:bg-[var(--ui-color-surface-subtle)]"
          type="button"
          @click="copyUrl"
        >
          <Check v-if="copied" :size="17" class="text-[var(--ui-color-brand)]" />
          <Copy v-else :size="17" />
          {{ copied ? '복사됐어요' : '주소 복사' }}
        </button>
      </div>
    </section>
  </section>
</template>
