<script setup>
import { computed, onMounted, ref } from 'vue';
import { Calculator, ChevronDown, Trash2 } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { useCurrentUser } from '../../shared/useCurrentUser.js';
import { useToast } from '../../shared/useToast.js';

const { currentUserId, isAdmin } = useCurrentUser();
const toast = useToast();
const meetups = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const openMeetupId = ref('');
const amount = ref('');
const selectedIds = ref([]);
const saving = ref(false);

onMounted(load);

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/settlements');
    meetups.value = response.data ?? [];
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function openForm(meetup) {
  openMeetupId.value = openMeetupId.value === meetup.id ? '' : meetup.id;
  amount.value = '';
  selectedIds.value = meetup.participants.map((participant) => participant.id);
}

async function createRound(meetup) {
  saving.value = true;
  try {
    await apiFetch('/api/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetupId: meetup.id,
        participantIds: selectedIds.value,
        totalAmount: Number(amount.value),
      }),
    });
    toast.success(`${meetup.settlements.length + 1}차 정산을 추가했어요.`);
    openMeetupId.value = '';
    await load();
  } catch (error) {
    toast.error(error.message);
  } finally {
    saving.value = false;
  }
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

function canDelete(round) {
  return round.createdBy === currentUserId.value || isAdmin.value;
}

function won(value) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function date(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="ui-page-title">정산</h1>
      <p class="ui-text-muted mt-1 text-[13px]">참여한 모임에서 차수별 비용을 기록해요.</p>
    </div>

    <div v-if="loading" class="surface-card py-12 text-center ui-text-muted">정산을 불러오는 중이에요.</div>
    <div v-else-if="errorMessage" class="surface-card py-8 text-center ui-text-danger">{{ errorMessage }}</div>
    <div v-else-if="meetups.length === 0" class="surface-card py-12 text-center">
      <p class="font-semibold">참여한 모임이 없어요.</p>
      <p class="ui-text-muted mt-1 text-[13px]">모임에 참여하면 여기에서 정산할 수 있어요.</p>
    </div>

    <article v-for="meetup in meetups" :key="meetup.id" class="surface-card grid gap-4">
      <div>
        <div class="flex items-start justify-between gap-3">
          <h2 class="ui-section-title">{{ meetup.title }}</h2>
          <button class="focus-ring ui-text-brand flex items-center gap-1 text-[13px] font-medium" type="button" @click="openForm(meetup)">
            정산 차수 추가 <ChevronDown :size="16" />
          </button>
        </div>
        <p class="ui-text-muted mt-1 text-[12px]">{{ date(meetup.scheduledAt) }} · {{ meetup.location }}</p>
      </div>

      <div v-if="meetup.settlements.length === 0" class="ui-bg-subtle ui-radius-item px-3 py-3 text-[13px] ui-text-muted">
        아직 등록된 정산이 없어요.
      </div>

      <ul v-else class="grid gap-2">
        <li v-for="round in meetup.settlements" :key="round.id" class="ui-bg-subtle ui-radius-item flex items-start gap-3 px-3 py-3">
          <Calculator :size="18" class="ui-text-brand mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ round.roundNo }}차 · 총 {{ won(round.totalAmount) }}원</p>
            <p class="ui-text-muted mt-1 text-[12px]">
              {{ round.participantCount }}명 · 1인 약 {{ won(round.amountPerPerson) }}원
              <template v-if="round.remainder"> · 나머지 {{ won(round.remainder) }}원</template>
            </p>
            <p class="ui-text-caption mt-1 text-[12px]">{{ round.participants.map((p) => p.name).join(', ') }} · {{ round.createdByName }} 작성</p>
          </div>
          <button v-if="canDelete(round)" class="focus-ring ui-text-danger shrink-0 p-1" type="button" aria-label="정산 삭제하기" @click="removeRound(round)">
            <Trash2 :size="17" />
          </button>
        </li>
      </ul>

      <form v-if="openMeetupId === meetup.id" class="ui-border-subtle grid gap-4 border-t pt-4" @submit.prevent="createRound(meetup)">
        <label class="grid gap-1.5 text-[13px] font-medium">
          총액
          <input v-model="amount" class="focus-ring ui-radius-control ui-border h-10 border px-3 text-[16px]" type="number" min="1" max="100000000" inputmode="numeric" placeholder="예: 48000" required />
        </label>

        <fieldset class="grid gap-2">
          <legend class="mb-1 text-[13px] font-medium">정산 참여자</legend>
          <label v-for="participant in meetup.participants" :key="participant.id" class="ui-bg-subtle ui-radius-item flex min-h-10 items-center gap-3 px-3 text-[14px]">
            <input v-model="selectedIds" type="checkbox" :value="participant.id" />
            {{ participant.name }}
          </label>
        </fieldset>

        <button class="focus-ring ui-radius-control h-11 bg-[var(--ui-color-brand)] font-medium text-white disabled:opacity-50" type="submit" :disabled="saving || selectedIds.length === 0">
          {{ meetup.settlements.length + 1 }}차 정산 추가하기
        </button>
      </form>
    </article>
  </section>
</template>
