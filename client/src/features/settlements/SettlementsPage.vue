<script setup>
import { onMounted, ref } from 'vue';
import { ChevronDown } from '@lucide/vue';
import { SETTLEMENT_LIMITS } from '../../../../shared/domain-constraints.js';
import { apiFetch } from '../../shared/api.js';
import { useCurrentUser } from '../../shared/useCurrentUser.js';
import { useToast } from '../../shared/useToast.js';
import SettlementRoundCard from './SettlementRoundCard.vue';

const { currentUserId, isAdmin } = useCurrentUser();
const toast = useToast();
const meetups = ref([]);
const paymentMethod = ref(null);
const loading = ref(true);
const errorMessage = ref('');
const openMeetupId = ref('');
const editingRoundId = ref('');
const amount = ref('');
const selectedIds = ref([]);
const participantAmounts = ref({});
const saving = ref(false);
const paidSavingId = ref('');
const paymentDraft = ref(emptyPaymentMethod());
const lastInferredBankName = ref('');

const BANK_CODE_NAMES = Object.freeze({
  '002': '산업은행',
  '003': '기업은행',
  '004': '국민은행',
  '007': '수협은행',
  '011': '농협은행',
  '020': '우리은행',
  '023': 'SC제일은행',
  '027': '씨티은행',
  '031': '대구은행',
  '032': '부산은행',
  '034': '광주은행',
  '035': '제주은행',
  '037': '전북은행',
  '039': '경남은행',
  '045': '새마을금고',
  '048': '신협',
  '050': '저축은행',
  '071': '우체국',
  '081': '하나은행',
  '088': '신한은행',
  '089': '케이뱅크',
  '090': '카카오뱅크',
  '092': '토스뱅크',
});

const BANK_ACCOUNT_PREFIX_NAMES = Object.freeze([
  ['3333', '카카오뱅크'],
  ['7979', '카카오뱅크'],
  ['1000', '토스뱅크'],
]);

const BANK_NAME_OPTIONS = Object.freeze([
  '카카오뱅크',
  '토스뱅크',
  '케이뱅크',
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '농협은행',
  '기업은행',
  'SC제일은행',
  '씨티은행',
  '수협은행',
  '산업은행',
  '새마을금고',
  '신협',
  '우체국',
  '저축은행',
  '대구은행',
  '부산은행',
  '광주은행',
  '제주은행',
  '전북은행',
  '경남은행',
]);

onMounted(load);

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [settlementsResponse, paymentMethodResponse] = await Promise.all([
      apiFetch('/api/settlements'),
      apiFetch('/api/settlements/payment-method'),
    ]);
    meetups.value = settlementsResponse.data ?? [];
    paymentMethod.value = paymentMethodResponse.data ?? null;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function openForm(meetup) {
  openMeetupId.value = openMeetupId.value === meetup.id ? '' : meetup.id;
  editingRoundId.value = '';
  amount.value = '';
  selectedIds.value = meetup.participants.map((participant) => participant.id);
  participantAmounts.value = {};
  paymentDraft.value = paymentMethod.value ? { ...paymentMethod.value } : emptyPaymentMethod();
  lastInferredBankName.value = inferBankName(paymentDraft.value.bankAccountNumber) === paymentDraft.value.bankName
    ? paymentDraft.value.bankName
    : '';
}

async function createRound(meetup) {
  const amountNumber = Number(amount.value);
  const shares = selectedIds.value.map((userId) => ({
    userId,
    amountDue: Number(participantAmounts.value[userId] ?? 0),
  }));
  const shareSum = shares.reduce((total, share) => total + share.amountDue, 0);
  if (shareSum !== amountNumber) {
    toast.error(`참여자별 금액 합계가 총액과 같아야 해요. 현재 합계는 ${won(shareSum)}원이에요.`);
    return;
  }

  saving.value = true;
  try {
    const savedPaymentMethod = await savePaymentMethod(paymentDraft.value, { silent: true });
    await apiFetch(editingRoundId.value ? `/api/settlements/${editingRoundId.value}` : '/api/settlements', {
      method: editingRoundId.value ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetupId: editingRoundId.value ? undefined : meetup.id,
        participantAmounts: shares,
        totalAmount: amountNumber,
      }),
    });
    paymentMethod.value = savedPaymentMethod;
    toast.success(editingRoundId.value ? '정산을 수정했어요.' : `${meetup.settlements.length + 1}차 정산을 추가했어요.`);
    openMeetupId.value = '';
    editingRoundId.value = '';
    await load();
  } catch (error) {
    toast.error(error.message);
  } finally {
    saving.value = false;
  }
}

function editRound(meetup, round) {
  openMeetupId.value = meetup.id;
  editingRoundId.value = round.id;
  amount.value = String(round.totalAmount);
  selectedIds.value = round.participants.map((participant) => participant.id);
  participantAmounts.value = Object.fromEntries(
    round.participants.map((participant) => [participant.id, participant.amountDue ?? 0]),
  );
  paymentDraft.value = {
    bankName: round.payerBankName ?? '',
    bankAccountNumber: round.payerBankAccountNumber ?? '',
    accountHolderName: round.payerAccountHolderName ?? '',
    kakaopayLink: round.payerKakaopayLink ?? '',
  };
  lastInferredBankName.value = inferBankName(paymentDraft.value.bankAccountNumber) === paymentDraft.value.bankName
    ? paymentDraft.value.bankName
    : '';
}

function cancelEdit() {
  openMeetupId.value = '';
  editingRoundId.value = '';
  amount.value = '';
  selectedIds.value = [];
  participantAmounts.value = {};
  paymentDraft.value = emptyPaymentMethod();
}

async function savePaymentMethod(nextPaymentMethod, { silent = false } = {}) {
  const response = await apiFetch('/api/settlements/payment-method', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextPaymentMethod),
  });
  paymentMethod.value = response.data;
  if (!silent) toast.success('내 정산 수단을 저장했어요.');
  return response.data;
}

async function removeRound(round) {
  if (!window.confirm(`${round.roundNo}차 정산을 삭제할까요?`)) return;
  try {
    await apiFetch(`/api/settlements/${round.id}`, { method: 'DELETE' });
    toast.success(`${round.roundNo}차 정산을 삭제했어요.`);
    await load();
  } catch (error) {
    toast.error(error.message);
  }
}

async function togglePaid(round) {
  const me = round.participants.find((participant) => participant.id === currentUserId.value);
  if (!me) return;

  paidSavingId.value = round.id;
  try {
    await apiFetch(`/api/settlements/${round.id}/paid`, {
      method: me.paidAt ? 'DELETE' : 'POST',
    });
    toast.success(me.paidAt ? '송금 완료 표시를 취소했어요.' : '송금 완료로 표시했어요.');
    await load();
  } catch (error) {
    toast.error(error.message);
  } finally {
    paidSavingId.value = '';
  }
}

function canDelete(round) {
  return round.createdBy === currentUserId.value || isAdmin.value;
}

function copiedAccount() {
  toast.success('계좌번호를 복사했어요.');
}

function copyAccountFailed() {
  toast.error('계좌번호를 복사하지 못했어요. 직접 선택해서 복사해 주세요.');
}

function syncParticipantAmounts(meetup) {
  const next = {};
  for (const userId of selectedIds.value) {
    next[userId] = normalizeAmountInput(participantAmounts.value[userId]);
  }
  participantAmounts.value = next;

  if (Object.keys(next).length === 0) return;
  const existingSum = Object.values(next).reduce((total, value) => total + value, 0);
  if (existingSum > 0) return;

  applyEqualAmounts(meetup);
}

function applyEqualAmounts(meetup) {
  const amountNumber = Number(amount.value);
  if (!Number.isInteger(amountNumber) || selectedIds.value.length === 0) return;
  const share = Math.floor(amountNumber / selectedIds.value.length);
  let remainder = amountNumber % selectedIds.value.length;
  const next = {};
  for (const participant of meetup.participants) {
    if (!selectedIds.value.includes(participant.id)) continue;
    next[participant.id] = share + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }
  participantAmounts.value = next;
}

function setParticipantAmount(userId, value) {
  const fixedAmount = normalizeAmountInput(value);
  const next = { ...participantAmounts.value, [userId]: fixedAmount };
  const otherIds = selectedIds.value.filter((id) => id !== userId);
  const amountNumber = Number(amount.value);

  if (Number.isInteger(amountNumber) && otherIds.length > 0) {
    const remaining = Math.max(amountNumber - fixedAmount, 0);
    const share = Math.floor(remaining / otherIds.length);
    let remainder = remaining % otherIds.length;

    for (const otherId of otherIds) {
      next[otherId] = share + (remainder > 0 ? 1 : 0);
      remainder -= 1;
    }
  }

  participantAmounts.value = next;
}

function normalizeAmountInput(value) {
  const amountValue = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isInteger(amountValue) ? amountValue : 0;
}

function selectedAmountSum() {
  return selectedIds.value.reduce((total, userId) => total + Number(participantAmounts.value[userId] ?? 0), 0);
}

function won(value) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function date(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function normalizeAccountNumberInput(event) {
  paymentDraft.value.bankAccountNumber = event.target.value.replace(/[^\d-]/g, '');
  event.target.value = paymentDraft.value.bankAccountNumber;

  const inferredBankName = inferBankName(paymentDraft.value.bankAccountNumber);
  if (!inferredBankName) return;
  if (!paymentDraft.value.bankName || paymentDraft.value.bankName === lastInferredBankName.value) {
    paymentDraft.value.bankName = inferredBankName;
    lastInferredBankName.value = inferredBankName;
  }
}

function inferBankName(accountNumber) {
  const digits = accountNumber.replace(/\D/g, '');
  const bankCode = digits.slice(0, 3);
  if (BANK_CODE_NAMES[bankCode]) return BANK_CODE_NAMES[bankCode];

  const prefixMatch = BANK_ACCOUNT_PREFIX_NAMES.find(([prefix]) => digits.startsWith(prefix));
  return prefixMatch?.[1] ?? '';
}

function emptyPaymentMethod() {
  return {
    bankName: '',
    bankAccountNumber: '',
    accountHolderName: '',
    kakaopayLink: '',
  };
}
</script>

<template>
  <section class="grid gap-5">
    <div class="min-w-0">
      <p class="ui-text-muted mt-1 text-[13px]">참여한 모임에서 차수별 비용과 송금 상태를 확인해요.</p>
    </div>

    <div v-if="loading" class="surface-card py-12 text-center ui-text-muted">정산을 불러오는 중이에요.</div>
    <div v-else-if="errorMessage" class="surface-card py-8 text-center ui-text-danger">{{ errorMessage }}</div>
    <div v-else-if="meetups.length === 0" class="surface-card py-12 text-center">
      <p class="font-semibold">참여한 모임이 없어요.</p>
      <p class="ui-text-muted mt-1 text-[13px]">모임에 참여하면 여기에서 정산을 만들 수 있어요.</p>
    </div>

    <article v-for="meetup in meetups" :key="meetup.id" class="surface-card grid gap-4">
      <div>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="ui-section-title">{{ meetup.title }}</h2>
              <span v-if="meetup.sourceType === 'somoim'" class="ui-radius-badge ui-bg-subtle ui-text-muted px-2 py-0.5 text-[12px] font-medium">
                소모임
              </span>
            </div>
          </div>
          <button
            class="focus-ring ui-text-brand flex items-center gap-1 text-[13px] font-medium"
            type="button"
            :aria-expanded="openMeetupId === meetup.id"
            @click="openForm(meetup)"
          >
            정산 차수 추가 <ChevronDown :size="16" />
          </button>
        </div>
        <p class="ui-text-muted mt-1 text-[12px]">{{ date(meetup.scheduledAt) }} · {{ meetup.location }}</p>
      </div>

      <div v-if="meetup.settlements.length === 0" class="ui-bg-subtle ui-radius-item px-3 py-3 text-[13px] ui-text-muted">
        아직 등록된 정산이 없어요.
      </div>

      <ul v-else class="grid gap-2">
        <SettlementRoundCard
          v-for="round in meetup.settlements"
          :key="round.id"
          :round="round"
          :current-user-id="currentUserId"
          :can-delete="canDelete(round)"
          :paid-saving="paidSavingId === round.id"
          @delete="removeRound"
          @edit="editRound(meetup, $event)"
          @toggle-paid="togglePaid"
          @copied-account="copiedAccount"
          @copy-account-failed="copyAccountFailed"
        />
      </ul>

      <form v-if="openMeetupId === meetup.id" class="ui-border-subtle grid gap-4 border-t pt-4" @submit.prevent="createRound(meetup)">
        <label class="grid gap-1.5 text-[13px] font-medium">
          총액
          <input
            v-model="amount"
            class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]"
            type="number"
            :min="SETTLEMENT_LIMITS.minTotalAmount"
            :max="SETTLEMENT_LIMITS.maxTotalAmount"
            inputmode="numeric"
            placeholder="예: 48000"
            required
            @change="applyEqualAmounts(meetup)"
          />
        </label>

        <fieldset class="grid gap-2">
          <legend class="mb-1 text-[13px] font-medium">정산 참여자</legend>
          <div v-for="participant in meetup.participants" :key="participant.id" class="ui-bg-subtle ui-radius-item grid gap-2 px-3 py-3 text-[14px]">
            <label class="flex min-h-8 items-center gap-3">
              <input v-model="selectedIds" type="checkbox" :value="participant.id" @change="syncParticipantAmounts(meetup)" />
              <span class="font-medium">{{ participant.name }}</span>
            </label>
            <label v-if="selectedIds.includes(participant.id)" class="grid gap-1.5 text-[13px] font-medium">
              낼 금액
              <input
                :value="participantAmounts[participant.id] ?? 0"
                class="focus-ring ui-radius-control ui-border h-10 border bg-[var(--ui-color-surface)] px-3 text-[16px]"
                type="number"
                min="0"
                inputmode="numeric"
                @input="setParticipantAmount(participant.id, $event.target.value)"
              />
            </label>
          </div>
          <div class="ui-border-subtle flex items-center justify-between border-t pt-2 text-[13px]">
            <span class="ui-text-muted">참여자별 금액 합계</span>
            <span :class="selectedAmountSum() === Number(amount || 0) ? 'ui-text-brand' : 'ui-text-danger'">
              {{ won(selectedAmountSum()) }}원 / {{ won(Number(amount || 0)) }}원
            </span>
          </div>
          <button class="focus-ring ui-radius-control ui-border h-9 border bg-[var(--ui-color-surface)] text-[13px] font-medium" type="button" @click="applyEqualAmounts(meetup)">
            같은 금액으로 다시 나누기
          </button>
        </fieldset>

        <fieldset class="grid gap-3">
          <legend class="mb-1 text-[13px] font-medium">계좌</legend>
          <p class="ui-text-muted -mt-1 text-[12px]">이번 차수에 표시할 정산 수단이에요. 추가하면 내 정산 수단에도 저장돼요.</p>
          <label class="grid gap-1.5 text-[13px] font-medium">
            계좌번호
            <input
              v-model="paymentDraft.bankAccountNumber"
              class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="예: 088-123456-12345"
              @input="normalizeAccountNumberInput"
            />
          </label>
          <label class="grid gap-1.5 text-[13px] font-medium">
            은행명
            <input
              v-model="paymentDraft.bankName"
              class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]"
              type="text"
              autocomplete="organization"
              list="settlement-bank-options"
              placeholder="자동 입력되지 않으면 선택해 주세요"
            />
            <datalist id="settlement-bank-options">
              <option v-for="bankName in BANK_NAME_OPTIONS" :key="bankName" :value="bankName"></option>
            </datalist>
          </label>
          <label class="grid gap-1.5 text-[13px] font-medium">
            예금주
            <input v-model="paymentDraft.accountHolderName" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" autocomplete="name" />
          </label>
          <label class="grid gap-1.5 text-[13px] font-medium">
            카카오페이 링크
            <input v-model="paymentDraft.kakaopayLink" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="text" inputmode="url" autocomplete="url" />
          </label>
        </fieldset>

        <div class="grid grid-cols-[1fr_auto] gap-2">
          <button class="focus-ring ui-pressable ui-transition-colors ui-radius-control h-11 bg-[var(--ui-color-brand)] font-medium text-white disabled:opacity-50" type="submit" :disabled="saving || selectedIds.length === 0">
            {{ editingRoundId ? '정산 수정하기' : `${meetup.settlements.length + 1}차 정산 추가하기` }}
          </button>
          <button v-if="editingRoundId" class="focus-ring ui-radius-control ui-border h-11 border bg-[var(--ui-color-surface)] px-4 font-medium" type="button" @click="cancelEdit">
            취소
          </button>
        </div>
      </form>
    </article>
  </section>
</template>
