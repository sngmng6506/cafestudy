import { computed, ref } from 'vue';

export const STORAGE_KEY = 'cafestudy_user_id';
export const STORAGE_NAME_KEY = 'cafestudy_user_name';
export const STORAGE_TOKEN_KEY = 'cafestudy_token';
export const STORAGE_SESSION_KEY = 'cafestudy_has_session';
export const STORAGE_ROLE_KEY = 'cafestudy_admin_role';
export const LEGACY_STORAGE_ADMIN_KEY = 'cafestudy_is_admin';
const ROLES = new Set(['member', 'admin', 'owner']);

function normalizeRole(value) {
  if (typeof value === 'string' && ROLES.has(value)) return value;
  return 'member';
}

// Bearer token을 localStorage에 남기던 이전 버전의 흔적은 로드 즉시 제거한다.
localStorage.removeItem(STORAGE_TOKEN_KEY);

const currentUserId = ref(localStorage.getItem(STORAGE_KEY) ?? '');
const currentUserName = ref(localStorage.getItem(STORAGE_NAME_KEY) ?? '');
const currentToken = ref(localStorage.getItem(STORAGE_SESSION_KEY) === '1' ? 'cookie' : '');
const adminRole = ref(normalizeRole(localStorage.getItem(STORAGE_ROLE_KEY)));
const isAdmin = computed(() => adminRole.value === 'admin' || adminRole.value === 'owner');
const isOwner = computed(() => adminRole.value === 'owner');

export function setCurrentUserState(id, name, _token = '', roleValue = 'member') {
  const role = normalizeRole(roleValue);
  currentUserId.value = id;
  currentUserName.value = name;
  currentToken.value = id ? 'cookie' : '';
  adminRole.value = role;
  localStorage.setItem(STORAGE_KEY, id);
  localStorage.setItem(STORAGE_NAME_KEY, name);
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  if (id) localStorage.setItem(STORAGE_SESSION_KEY, '1');
  else localStorage.removeItem(STORAGE_SESSION_KEY);
  localStorage.setItem(STORAGE_ROLE_KEY, role);
  localStorage.removeItem(LEGACY_STORAGE_ADMIN_KEY);
}

export function clearCurrentUserState() {
  currentUserId.value = '';
  currentUserName.value = '';
  currentToken.value = '';
  adminRole.value = 'member';
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_NAME_KEY);
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_SESSION_KEY);
  localStorage.removeItem(STORAGE_ROLE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_ADMIN_KEY);
}

export function useCurrentUser() {
  return {
    currentUserId,
    currentUserName,
    currentToken,
    adminRole,
    isAdmin,
    isOwner,
    setCurrentUser: setCurrentUserState,
    clearCurrentUser: clearCurrentUserState,
  };
}
