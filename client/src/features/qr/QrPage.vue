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
    toast.error('QR 코드를 생성하지 못했습니다.');
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
    toast.error('주소 복사에 실패했습니다.');
  }
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">접속 QR</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">휴대폰 카메라로 스캔하면 바로 접속됩니다.</p>
    </div>

    <section class="surface-card">
      <div class="mb-4 flex items-center gap-2">
        <QrCode :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">모바일 접속 주소</h2>
      </div>

      <div class="grid justify-items-center gap-4">
        <canvas
          ref="canvasEl"
          class="rounded-xl border border-[#dadce0] bg-white p-2"
          aria-label="접속 주소 QR 코드"
        ></canvas>

        <p class="break-all text-center text-[14px] font-medium text-[#5f6368]">{{ url }}</p>

        <button
          class="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#dadce0] text-[15px] font-semibold text-[#333333] transition hover:bg-[#f5f6f7]"
          type="button"
          @click="copyUrl"
        >
          <Check v-if="copied" :size="17" class="text-[#03C75A]" />
          <Copy v-else :size="17" />
          {{ copied ? '복사됐어요' : '주소 복사' }}
        </button>
      </div>
    </section>
  </section>
</template>
