<script setup>
import { computed } from 'vue';
import { Calculator, CheckCircle2, Copy, ExternalLink, Trash2 } from '@lucide/vue';

const props = defineProps({
  round: { type: Object, required: true },
  currentUserId: { type: String, default: '' },
  canDelete: { type: Boolean, default: false },
  paidSaving: { type: Boolean, default: false },
});

const emit = defineEmits(['delete', 'toggle-paid', 'copied-account', 'copy-account-failed']);

const me = computed(() => props.round.participants.find((participant) => participant.id === props.currentUserId));
const hasBank = computed(() => Boolean(
  props.round.payerBankName
  && props.round.payerBankAccountNumber
  && props.round.payerAccountHolderName,
));
const hasPaymentInfo = computed(() => hasBank.value || Boolean(props.round.payerKakaopayLink));

async function copyAccount() {
  const text = `${props.round.payerBankName} ${props.round.payerBankAccountNumber} ${props.round.payerAccountHolderName}`;
  try {
    await navigator.clipboard.writeText(text);
    emit('copied-account');
  } catch {
    emit('copy-account-failed');
  }
}

function won(value) {
  return new Intl.NumberFormat('ko-KR').format(value);
}
</script>

<template>
  <li class="ui-bg-subtle ui-radius-item grid gap-3 px-3 py-3">
    <div class="flex items-start gap-3">
      <Calculator :size="18" class="ui-text-brand mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-semibold">{{ round.roundNo }}차 · 총 {{ won(round.totalAmount) }}원</p>
          <span v-if="round.fullySettled" class="ui-radius-badge bg-[var(--ui-color-brand)] px-2 py-0.5 text-[12px] font-medium text-white">
            정산 완료
          </span>
        </div>
        <p class="ui-text-muted mt-1 text-[12px]">
          {{ round.participantCount }}명 · 1인 {{ won(round.amountPerPerson) }}원
          <template v-if="round.remainder"> · 나머지 {{ won(round.remainder) }}원</template>
        </p>
        <p class="ui-text-caption mt-1 text-[12px]">{{ round.createdByName }} 작성</p>
      </div>
      <button
        v-if="canDelete"
        class="focus-ring ui-text-danger shrink-0 p-1"
        type="button"
        aria-label="정산 삭제하기"
        @click="emit('delete', round)"
      >
        <Trash2 :size="17" />
      </button>
    </div>

    <div class="ui-border-subtle border-t pt-3">
      <div v-if="hasPaymentInfo" class="grid gap-2 text-[13px]">
        <div v-if="hasBank" class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ round.payerBankName }}</span>
          <span>{{ round.payerBankAccountNumber }}</span>
          <span class="ui-text-muted">{{ round.payerAccountHolderName }}</span>
          <button
            class="focus-ring ui-radius-control ui-border inline-flex h-8 items-center gap-1 border bg-[var(--ui-color-surface)] px-2 text-[12px] font-medium"
            type="button"
            aria-label="계좌번호 복사하기"
            @click="copyAccount"
          >
            <Copy :size="14" />
            복사
          </button>
        </div>
        <a
          v-if="round.payerKakaopayLink"
          class="focus-ring ui-text-link inline-flex w-fit items-center gap-1 text-[13px] font-medium"
          :href="round.payerKakaopayLink"
          target="_blank"
          rel="noreferrer"
        >
          카카오페이로 열기 <ExternalLink :size="14" />
        </a>
      </div>
      <p v-else class="ui-text-muted text-[13px]">아직 계좌 정보를 등록하지 않았어요.</p>
    </div>

    <div class="grid gap-2">
      <div class="flex flex-wrap gap-2">
        <span
          v-for="participant in round.participants"
          :key="participant.id"
          class="ui-radius-pill inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium"
          :class="participant.id === round.createdBy || participant.paidAt ? 'bg-[var(--ui-color-brand)] text-white' : 'ui-border bg-[var(--ui-color-surface)] ui-text-muted border'"
        >
          <CheckCircle2 v-if="participant.id === round.createdBy || participant.paidAt" :size="13" />
          {{ participant.name }}
          <template v-if="participant.id === round.createdBy">수령자</template>
          <template v-else>{{ participant.paidAt ? '완료' : '미완료' }}</template>
        </span>
      </div>

      <button
        v-if="me && me.id !== round.createdBy"
        class="focus-ring ui-radius-control ui-border h-10 border bg-[var(--ui-color-surface)] text-[13px] font-medium disabled:opacity-50"
        type="button"
        :aria-pressed="Boolean(me.paidAt)"
        :disabled="paidSaving"
        @click="emit('toggle-paid', round)"
      >
        {{ me.paidAt ? '송금 완료 취소하기' : '송금 완료로 표시' }}
      </button>
    </div>
  </li>
</template>
