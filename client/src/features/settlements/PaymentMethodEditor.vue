<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import { SETTLEMENT_LIMITS } from '../../../../shared/domain-constraints.js';

const props = defineProps({
  paymentMethod: { type: Object, default: null },
  savePaymentMethod: { type: Function, required: true },
});

const emit = defineEmits(['close']);

const dialog = ref(null);
const bankName = ref('');
const bankAccountNumber = ref('');
const accountHolderName = ref('');
const kakaopayLink = ref('');
const errorMessage = ref('');
const saving = ref(false);

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const bankFieldCount = computed(() => [bankName.value, bankAccountNumber.value, accountHolderName.value].filter((value) => value.trim()).length);

onMounted(async () => {
  bankName.value = props.paymentMethod?.bankName ?? '';
  bankAccountNumber.value = props.paymentMethod?.bankAccountNumber ?? '';
  accountHolderName.value = props.paymentMethod?.accountHolderName ?? '';
  kakaopayLink.value = props.paymentMethod?.kakaopayLink ?? '';
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  dialog.value?.querySelector('input')?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

function onKeydown(event) {
  if (event.key === 'Escape') {
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;

  const focusable = [...dialog.value.querySelectorAll(focusableSelector)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function submit() {
  errorMessage.value = '';
  if (bankFieldCount.value > 0 && bankFieldCount.value < 3) {
    errorMessage.value = '은행명, 계좌번호, 예금주를 모두 입력하거나 모두 비워 주세요.';
    return;
  }
  if (hasTooLong(bankName.value, SETTLEMENT_LIMITS.bankNameMaxLength, '은행명')) return;
  if (hasTooLong(bankAccountNumber.value, SETTLEMENT_LIMITS.bankAccountNumberMaxLength, '계좌번호')) return;
  if (hasTooLong(accountHolderName.value, SETTLEMENT_LIMITS.accountHolderNameMaxLength, '예금주')) return;
  if (hasTooLong(kakaopayLink.value, SETTLEMENT_LIMITS.kakaopayLinkMaxLength, '카카오페이 링크')) return;

  saving.value = true;
  try {
    await props.savePaymentMethod({
      bankName: bankName.value,
      bankAccountNumber: bankAccountNumber.value,
      accountHolderName: accountHolderName.value,
      kakaopayLink: kakaopayLink.value,
    });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

function hasTooLong(value, maxLength, label) {
  if (value.trim().length <= maxLength) return false;
  errorMessage.value = `${label}은 ${maxLength}자 이하로 입력해 주세요.`;
  return true;
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <button class="absolute inset-0 bg-black/30" type="button" aria-label="정산 수단 설정 닫기" @click="emit('close')"></button>

    <section
      ref="dialog"
      class="ui-radius-overlay relative z-10 w-full max-w-sm bg-[var(--ui-color-surface)] px-5 pb-6 pt-5 shadow-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-method-title"
    >
      <button
        class="focus-ring ui-radius-badge ui-text-muted absolute right-4 top-4 p-1 transition hover:text-[var(--ui-color-content)]"
        type="button"
        aria-label="정산 수단 설정 닫기"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>

      <h2 id="payment-method-title" class="text-[18px] font-bold">내 정산 수단</h2>
      <p class="ui-text-muted mt-1 text-[13px]">새 정산을 만들 때 현재 정보가 그 차수에 저장돼요.</p>

      <form class="mt-5 grid gap-4" @submit.prevent="submit">
        <div class="grid gap-3">
          <label class="grid gap-1.5 text-[13px] font-medium">
            은행명
            <input v-model="bankName" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" autocomplete="organization" />
          </label>
          <label class="grid gap-1.5 text-[13px] font-medium">
            계좌번호
            <input v-model="bankAccountNumber" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" inputmode="text" autocomplete="off" />
          </label>
          <label class="grid gap-1.5 text-[13px] font-medium">
            예금주
            <input v-model="accountHolderName" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" autocomplete="name" />
          </label>
        </div>

        <label class="grid gap-1.5 text-[13px] font-medium">
          카카오페이 링크
          <input v-model="kakaopayLink" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" inputmode="url" autocomplete="url" />
        </label>

        <p v-if="errorMessage" class="ui-text-danger text-[13px] font-semibold">{{ errorMessage }}</p>

        <div class="grid grid-cols-2 gap-2">
          <button class="focus-ring ui-radius-control ui-border h-10 border font-medium" type="button" @click="emit('close')">
            돌아가기
          </button>
          <button class="focus-ring ui-radius-control h-10 bg-[var(--ui-color-brand)] font-medium text-white disabled:opacity-50" type="submit" :disabled="saving">
            {{ saving ? '저장 중' : '저장하기' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
