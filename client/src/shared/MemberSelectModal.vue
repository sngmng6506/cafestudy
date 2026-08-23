<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowLeft, Check, Search, X } from '@lucide/vue';
import { apiFetch } from './api.js';
import { useCurrentUser } from './useCurrentUser.js';
import { avatarColor, initials } from './useAvatar.js';

const props = defineProps({
  dismissable: { type: Boolean, default: false },
  // 잠긴 기능을 눌러서 열렸다면 왜 막혔는지 알려준다.
  reason: { type: String, default: '' },
});

const emit = defineEmits(['close', 'browse']);
const { currentUserId, setCurrentUser } = useCurrentUser();

const members = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const query = ref('');
const step = ref('select');
const selectedMember = ref(null);
const password = ref('');
const passwordConfirm = ref('');
const setupToken = ref('');
const authError = ref('');
const submitting = ref(false);

const isSetup = computed(() => selectedMember.value && !selectedMember.value.hasPassword);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter((m) => m.name.toLowerCase().includes(q));
});

async function loadMembers() {
  loading.value = true;
  try {
    const body = await apiFetch('/api/members');
    members.value = body.data;
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
}

// 로그인 전(닫을 수 없는 상태)에는 Escape로도 닫지 않는다.
function onKeydown(event) {
  if (event.key === 'Escape' && props.dismissable) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void loadMembers();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

function pick(member) {
  selectedMember.value = member;
  password.value = '';
  passwordConfirm.value = '';
  setupToken.value = '';
  authError.value = '';
  step.value = 'auth';
}

function backToSelect() {
  step.value = 'select';
  selectedMember.value = null;
}

async function submitAuth() {
  authError.value = '';
  if (password.value.length < 4) {
    authError.value = '비밀번호는 4자 이상으로 만들어 주세요.';
    return;
  }
  if (isSetup.value && password.value !== passwordConfirm.value) {
    authError.value = '비밀번호가 서로 달라요. 다시 입력해 주세요.';
    return;
  }

  submitting.value = true;
  try {
    const path = isSetup.value ? '/api/auth/set-password' : '/api/auth/login';
    const body = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: selectedMember.value.id,
        password: password.value,
        setupToken: setupToken.value.trim() || undefined,
      }),
    });
    const { token, user } = body.data;
    setCurrentUser(user.id, user.name, token, user.adminRole);
    emit('close');
  } catch (err) {
    authError.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div
      class="absolute inset-0 bg-black/30"
      @click="dismissable ? emit('close') : undefined"
    ></div>

    <div class="relative z-10 w-full max-w-sm rounded-xl bg-white px-5 pb-6 pt-5 shadow-lg">
      <button
        v-if="dismissable"
        class="focus-ring absolute right-4 top-4 rounded p-1 text-[var(--ui-color-content-muted)] transition hover:text-[var(--ui-color-content)]"
        type="button"
        aria-label="닫기"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>

      <template v-if="step === 'select'">
        <p
          v-if="reason"
          class="ui-radius-control mb-3 bg-[var(--ui-color-surface-subtle)] px-3 py-2.5 text-[13px] text-[var(--ui-color-content)]"
        >
          {{ reason }}
        </p>

        <h2 class="text-[18px] font-bold text-[var(--ui-color-content)]">나는 누구인가요?</h2>
        <p class="mt-1 text-[13px] text-[var(--ui-color-content-muted)]">본인 이름을 선택하면 비밀번호로 로그인해요.</p>

        <div class="relative mb-3 mt-4">
          <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-color-content-muted)]" />
          <input
            v-model="query"
            type="text"
            placeholder="이름으로 검색"
            class="focus-ring h-10 w-full rounded border border-[var(--ui-color-stroke)] bg-[var(--ui-color-surface-subtle)] pl-9 pr-4 text-[14px] text-[var(--ui-color-content)] placeholder:text-[var(--ui-color-content-disabled)] focus:border-[var(--ui-color-brand)] focus:bg-white focus:outline-none"
          />
        </div>

        <ul v-if="loading" class="divide-y divide-[var(--ui-color-stroke)]">
          <li v-for="n in 5" :key="n" class="flex animate-pulse items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div class="h-10 w-10 shrink-0 rounded-full bg-[var(--ui-color-surface-subtle)]"></div>
            <div class="h-4 w-32 rounded bg-[var(--ui-color-surface-subtle)]"></div>
          </li>
        </ul>

        <p v-else-if="errorMessage" class="py-4 text-center text-[14px] font-semibold text-[var(--ui-color-destructive)]">
          {{ errorMessage }}
        </p>

        <p v-else-if="filtered.length === 0" class="py-6 text-center text-[14px] text-[var(--ui-color-content-muted)]">
          검색 결과가 없어요.
        </p>

        <ul v-else class="max-h-64 divide-y divide-[var(--ui-color-stroke)] overflow-y-auto">
          <li v-for="member in filtered" :key="member.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div
              class="focus-ring flex flex-1 cursor-pointer items-center gap-3 rounded transition hover:bg-[var(--ui-color-surface-subtle)]"
              tabindex="0"
              role="button"
              @click="pick(member)"
              @keydown.enter="pick(member)"
              @keydown.space.prevent="pick(member)"
            >
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
                :class="[avatarColor(member.name), member.id === currentUserId ? 'ring-2 ring-[var(--ui-color-brand)] ring-offset-1' : '']"
              >
                {{ initials(member.name) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[15px] font-semibold text-[var(--ui-color-content)]">{{ member.name }}</p>
                <p class="truncate text-[13px] text-[var(--ui-color-content-caption)]">
                  {{ member.hasPassword ? '비밀번호로 로그인' : '비밀번호 설정 필요' }}
                </p>
              </div>
              <Check v-if="member.id === currentUserId" :size="18" class="shrink-0 text-[var(--ui-color-brand)]" />
            </div>
          </li>
        </ul>

        <button
          class="focus-ring ui-radius-control mt-4 h-11 w-full border border-[var(--ui-color-stroke)] text-[14px] font-semibold text-[var(--ui-color-content-muted)] transition hover:bg-[var(--ui-color-surface-subtle)]"
          type="button"
          @click="emit('browse')"
        >
          먼저 둘러보기
        </button>
      </template>

      <template v-else>
        <button
          class="focus-ring -ml-1 mb-2 flex items-center gap-1 rounded p-1 text-[13px] text-[var(--ui-color-content-muted)] transition hover:text-[var(--ui-color-content)]"
          type="button"
          @click="backToSelect"
        >
          <ArrowLeft :size="16" />
          뒤로
        </button>

        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
            :class="avatarColor(selectedMember.name)"
          >
            {{ initials(selectedMember.name) }}
          </span>
          <div class="min-w-0">
            <h2 class="truncate text-[18px] font-bold text-[var(--ui-color-content)]">{{ selectedMember.name }}</h2>
            <p class="text-[13px] text-[var(--ui-color-content-muted)]">
              {{ isSetup ? '사용할 비밀번호를 설정해 주세요.' : '비밀번호를 입력해 주세요.' }}
            </p>
          </div>
        </div>

        <form class="mt-4 space-y-3" @submit.prevent="submitAuth">
          <input
            v-model="password"
            type="password"
            autocomplete="off"
            :placeholder="isSetup ? '새 비밀번호 (4자 이상)' : '비밀번호'"
            class="focus-ring h-10 w-full rounded border border-[var(--ui-color-stroke)] bg-[var(--ui-color-surface-subtle)] px-3 text-[16px] text-[var(--ui-color-content)] placeholder:text-[var(--ui-color-content-disabled)] focus:border-[var(--ui-color-brand)] focus:bg-white focus:outline-none"
          />
          <input
            v-if="isSetup"
            v-model="passwordConfirm"
            type="password"
            autocomplete="off"
            placeholder="비밀번호 확인"
            class="focus-ring h-10 w-full rounded border border-[var(--ui-color-stroke)] bg-[var(--ui-color-surface-subtle)] px-3 text-[16px] text-[var(--ui-color-content)] placeholder:text-[var(--ui-color-content-disabled)] focus:border-[var(--ui-color-brand)] focus:bg-white focus:outline-none"
          />
          <input
            v-if="isSetup"
            v-model="setupToken"
            type="text"
            autocomplete="one-time-code"
            placeholder="설정 코드 (관리자가 초기화한 계정만)"
            class="focus-ring h-10 w-full rounded border border-[var(--ui-color-stroke)] bg-[var(--ui-color-surface-subtle)] px-3 text-[16px] text-[var(--ui-color-content)] placeholder:text-[var(--ui-color-content-disabled)] focus:border-[var(--ui-color-brand)] focus:bg-white focus:outline-none"
          />
          <p v-if="isSetup" class="text-[12px] leading-5 text-[var(--ui-color-content-muted)]">
            처음 비밀번호를 만드는 계정은 코드를 비워 두세요. 관리자가 초기화했다면 전달받은 코드를 입력해야 해요.
          </p>

          <p v-if="authError" class="text-[13px] font-semibold text-[var(--ui-color-destructive)]">{{ authError }}</p>

          <button
            type="submit"
            :disabled="submitting"
            class="focus-ring h-10 w-full rounded bg-[var(--ui-color-brand)] text-[15px] font-bold text-white transition hover:bg-[var(--ui-color-brand-hover)] disabled:opacity-50"
          >
            {{ submitting ? '처리 중…' : isSetup ? '비밀번호 설정하고 시작하기' : '로그인' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
