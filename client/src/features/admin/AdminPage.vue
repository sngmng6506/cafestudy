<script setup>
import { computed, onMounted, ref } from 'vue';
import { Copy, KeyRound, Megaphone, ShieldCheck, Trash2 } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { useCurrentUser } from '../../shared/useCurrentUser.js';
import { useNotices } from '../../shared/useNotices.js';
import { useToast } from '../../shared/useToast.js';

const { adminRole, currentUserId, isOwner } = useCurrentUser();
const { notices, loadNotices } = useNotices();
const toast = useToast();
const activeSection = ref('notices');
const users = ref([]);
const title = ref('');
const body = ref('');
const isPinned = ref(false);
const editingId = ref(null);
const saving = ref(false);
const loadingUsers = ref(false);
const resettingId = ref('');
const resetCredential = ref(null);

const submitLabel = computed(() => editingId.value ? '공지 수정하기' : '공지 올리기');
const tabColumns = computed(() => isOwner.value ? 'grid-cols-3' : 'grid-cols-2');

onMounted(async () => {
  await Promise.allSettled([loadNotices(), loadUsers()]);
});

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const response = await apiFetch('/api/admin/users');
    users.value = response.data ?? [];
  } catch (error) {
    toast.error(error.message);
    throw error;
  } finally {
    loadingUsers.value = false;
  }
}

function editNotice(notice) {
  editingId.value = notice.id;
  title.value = notice.title;
  body.value = notice.body;
  isPinned.value = notice.isPinned;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId.value = null;
  title.value = '';
  body.value = '';
  isPinned.value = false;
}

async function saveNotice() {
  saving.value = true;
  try {
    await apiFetch(editingId.value ? `/api/notices/${editingId.value}` : '/api/notices', {
      method: editingId.value ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.value, body: body.value, isPinned: isPinned.value }),
    });
    toast.success(editingId.value ? '공지를 수정했어요.' : '새 공지를 올렸어요.');
    resetForm();
    await loadNotices();
  } catch (error) {
    toast.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function deleteNotice(notice) {
  if (!window.confirm(`“${notice.title}” 공지를 삭제할까요?\n삭제하면 모든 멤버의 알림에서도 사라져요.`)) return;
  try {
    await apiFetch(`/api/notices/${notice.id}`, { method: 'DELETE' });
    toast.success('공지를 삭제했어요.');
    await loadNotices();
  } catch (error) {
    toast.error(error.message);
  }
}

async function changeRole(user, role) {
  try {
    const response = await apiFetch(`/api/admin/users/${user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    user.role = response.data.role;
    toast.success(role === 'admin' ? `${user.name} 님을 관리자로 임명했어요.` : `${user.name} 님의 관리자 권한을 해제했어요.`);
  } catch (error) {
    toast.error(error.message);
  }
}

function canIssueSetupToken(user) {
  if (user.id === currentUserId.value || user.role === 'owner') return false;
  if (adminRole.value === 'owner') return user.role === 'admin' || user.role === 'member';
  return adminRole.value === 'admin' && user.role === 'member';
}

async function issueSetupToken(user) {
  const action = user.hasPassword ? '비밀번호를 초기화' : '비밀번호 설정 코드를 발급';
  const impact = user.hasPassword
    ? '기존 로그인은 종료되고 새 설정 코드가 발급돼요.'
    : '새 비밀번호를 만들 때 사용할 일회용 코드가 발급돼요.';
  if (!window.confirm(`${user.name} 님의 ${action}할까요?\n${impact}`)) return;

  resettingId.value = user.id;
  resetCredential.value = null;
  try {
    const response = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: user.id }),
    });
    user.hasPassword = false;
    user.requiresSetupToken = true;
    resetCredential.value = {
      name: user.name,
      setupToken: response.data.setupToken,
      expiresAt: response.data.expiresAt,
    };
    toast.success(`${user.name} 님의 설정 코드를 발급했어요.`);
  } catch (error) {
    toast.error(error.message);
  } finally {
    resettingId.value = '';
  }
}

async function copySetupToken() {
  try {
    await navigator.clipboard.writeText(resetCredential.value.setupToken);
    toast.success('설정 코드를 복사했어요.');
  } catch {
    toast.error('코드를 복사하지 못했어요. 직접 선택해 복사해 주세요.');
  }
}

function formatExpiry(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="ui-page-title">관리자</h1>
    </div>

    <div class="ui-bg-subtle ui-radius-item grid gap-1 p-1" :class="tabColumns">
      <button class="focus-ring ui-radius-control flex h-10 items-center justify-center gap-2 text-[13px] font-semibold" :class="activeSection === 'notices' ? 'ui-bg-surface ui-text-brand' : 'ui-text-muted'" type="button" @click="activeSection = 'notices'">
        <Megaphone :size="17" /> 공지
      </button>
      <button class="focus-ring ui-radius-control flex h-10 items-center justify-center gap-2 text-[13px] font-semibold" :class="activeSection === 'accounts' ? 'ui-bg-surface ui-text-brand' : 'ui-text-muted'" type="button" @click="activeSection = 'accounts'">
        <KeyRound :size="17" /> 계정
      </button>
      <button v-if="isOwner" class="focus-ring ui-radius-control flex h-10 items-center justify-center gap-2 text-[13px] font-semibold" :class="activeSection === 'roles' ? 'ui-bg-surface ui-text-brand' : 'ui-text-muted'" type="button" @click="activeSection = 'roles'">
        <ShieldCheck :size="17" /> 권한
      </button>
    </div>

    <template v-if="activeSection === 'notices'">
      <form class="surface-card grid gap-4" @submit.prevent="saveNotice">
        <div>
          <h2 class="ui-section-title">{{ editingId ? '공지 수정' : '새 공지' }}</h2>
          <p class="ui-text-muted mt-1 text-[13px]">공지를 올리면 모든 멤버의 종 알림에 표시돼요.</p>
        </div>
        <label class="grid gap-1.5 text-[13px] font-medium">
          제목
          <input v-model="title" class="focus-ring ui-radius-control ui-border h-10 border bg-[var(--ui-color-surface)] px-3 text-[16px]" maxlength="100" required placeholder="공지 제목" />
        </label>
        <label class="grid gap-1.5 text-[13px] font-medium">
          내용
          <textarea v-model="body" class="focus-ring ui-radius-control ui-border min-h-36 border bg-[var(--ui-color-surface)] p-3 text-[16px]" maxlength="5000" required placeholder="멤버에게 알릴 내용을 입력해 주세요"></textarea>
        </label>
        <label class="flex items-center gap-2 text-[14px]">
          <input v-model="isPinned" type="checkbox" /> 공지 목록 위에 고정
        </label>
        <div class="flex justify-end gap-2">
          <button v-if="editingId" class="focus-ring ui-radius-control ui-border h-10 border px-4 text-[14px] font-medium" type="button" @click="resetForm">수정 취소</button>
          <button class="focus-ring ui-radius-control h-10 bg-[var(--ui-color-brand)] px-4 text-[14px] font-semibold text-white disabled:opacity-50" type="submit" :disabled="saving">{{ submitLabel }}</button>
        </div>
      </form>

      <ul class="grid gap-3">
        <li v-for="notice in notices" :key="notice.id" class="surface-card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="ui-section-title truncate">{{ notice.title }}</h3>
              <p class="ui-text-muted mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] leading-5">{{ notice.body }}</p>
            </div>
            <div class="flex shrink-0 gap-1">
              <button class="focus-ring ui-text-link px-2 py-1 text-[12px] font-medium" type="button" @click="editNotice(notice)">수정</button>
              <button class="focus-ring ui-text-danger p-1.5" type="button" aria-label="공지 삭제하기" @click="deleteNotice(notice)"><Trash2 :size="17" /></button>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="activeSection === 'accounts'">
      <section v-if="resetCredential" class="surface-card border border-[var(--ui-color-brand)]">
        <h2 class="ui-section-title">{{ resetCredential.name }} 님의 설정 코드</h2>
        <p class="ui-text-muted mt-1 text-[13px]">이 코드는 한 번만 사용할 수 있어요. 대상 멤버에게 직접 전달해 주세요.</p>
        <div class="ui-bg-subtle ui-radius-control mt-4 flex items-center gap-2 p-3">
          <code class="ui-text min-w-0 flex-1 break-all text-[13px] font-semibold">{{ resetCredential.setupToken }}</code>
          <button class="focus-ring ui-text-brand shrink-0 p-1" type="button" aria-label="설정 코드 복사하기" @click="copySetupToken"><Copy :size="18" /></button>
        </div>
        <p class="ui-text-caption mt-2">{{ formatExpiry(resetCredential.expiresAt) }}까지 사용할 수 있어요.</p>
      </section>

      <section class="surface-card">
        <h2 class="ui-section-title">비밀번호 설정 코드</h2>
        <p class="ui-text-muted mt-1 text-[13px]">관리자는 멤버만, 최고 관리자는 관리자와 멤버의 설정 코드를 발급할 수 있어요.</p>
        <p v-if="loadingUsers" class="ui-text-muted py-8 text-center text-[14px]">멤버를 불러오고 있어요.</p>
        <ul v-else class="ui-border-subtle mt-4 divide-y">
          <li v-for="user in users" :key="user.id" class="flex items-center justify-between gap-3 py-3">
            <div class="min-w-0">
              <p class="ui-text truncate text-[14px] font-semibold">{{ user.name }}</p>
              <p class="ui-text-caption mt-0.5">
                {{ user.role === 'owner' ? '최고 관리자' : user.role === 'admin' ? '관리자' : '멤버' }} ·
                {{ user.hasPassword ? '비밀번호 사용 중' : user.requiresSetupToken ? '설정 코드 발급됨' : '설정 코드 필요' }}
              </p>
            </div>
            <button
              v-if="canIssueSetupToken(user)"
              class="focus-ring ui-radius-control ui-border h-9 shrink-0 border px-3 text-[12px] font-medium disabled:opacity-50"
              type="button"
              :disabled="resettingId === user.id"
              @click="issueSetupToken(user)"
            >
              {{ user.hasPassword ? '초기화' : user.requiresSetupToken ? '코드 재발급' : '코드 발급' }}
            </button>
            <span v-else class="ui-text-caption shrink-0 text-[12px]">발급 불가</span>
          </li>
        </ul>
      </section>
    </template>

    <template v-else>
      <section class="surface-card">
        <h2 class="ui-section-title">관리자 임명</h2>
        <p class="ui-text-muted mt-1 text-[13px]">관리자는 공지와 일반 멤버 계정을 관리할 수 있어요. 최고 관리자 UUID는 변경되지 않아요.</p>
        <p v-if="loadingUsers" class="ui-text-muted py-8 text-center text-[14px]">멤버를 불러오고 있어요.</p>
        <ul v-else class="ui-border-subtle mt-4 divide-y">
          <li v-for="user in users" :key="user.id" class="flex items-center justify-between gap-3 py-3">
            <div>
              <p class="ui-text text-[14px] font-semibold">{{ user.name }}</p>
              <p class="ui-text-caption mt-0.5">{{ user.role === 'owner' ? '최고 관리자' : user.role === 'admin' ? '관리자' : '멤버' }}</p>
            </div>
            <span v-if="user.role === 'owner'" class="ui-text-brand text-[12px] font-semibold">권한 유지</span>
            <button v-else-if="user.role === 'admin'" class="focus-ring ui-radius-control ui-border h-9 border px-3 text-[12px] font-medium" type="button" @click="changeRole(user, 'member')">관리자 해제</button>
            <button v-else class="focus-ring ui-radius-control h-9 bg-[var(--ui-color-brand)] px-3 text-[12px] font-semibold text-white" type="button" @click="changeRole(user, 'admin')">관리자로 임명</button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
