import { computed, ref } from 'vue';

const STORAGE_KEY = 'cafestudy_user_id';
const STORAGE_NAME_KEY = 'cafestudy_user_name';
const STORAGE_TOKEN_KEY = 'cafestudy_token';
const STORAGE_ROLE_KEY = 'cafestudy_admin_role';
const LEGACY_STORAGE_ADMIN_KEY = 'cafestudy_is_admin';
const ROLES = new Set(['member', 'admin', 'owner']);

function normalizeRole(value) {
  if (typeof value === 'string' && ROLES.has(value)) return value;
  return 'member';
}

const currentUserId = ref(localStorage.getItem(STORAGE_KEY) ?? '');
const currentUserName = ref(localStorage.getItem(STORAGE_NAME_KEY) ?? '');
const currentToken = ref(localStorage.getItem(STORAGE_TOKEN_KEY) ?? '');
const adminRole = ref(normalizeRole(localStorage.getItem(STORAGE_ROLE_KEY)));
const isAdmin = computed(() => adminRole.value === 'admin' || adminRole.value === 'owner');
const isOwner = computed(() => adminRole.value === 'owner');

export function useCurrentUser() {
  function setCurrentUser(id, name, token = '', roleValue = 'member') {
    const role = normalizeRole(roleValue);
    currentUserId.value = id;
    currentUserName.value = name;
    currentToken.value = token;
    adminRole.value = role;
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(STORAGE_NAME_KEY, name);
    if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_ROLE_KEY, role);
    localStorage.removeItem(LEGACY_STORAGE_ADMIN_KEY);
  }

  function clearCurrentUser() {
    currentUserId.value = '';
    currentUserName.value = '';
    currentToken.value = '';
    adminRole.value = 'member';
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_ROLE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_ADMIN_KEY);
  }

  return {
    currentUserId,
    currentUserName,
    currentToken,
    adminRole,
    isAdmin,
    isOwner,
    setCurrentUser,
    clearCurrentUser,
  };
}
