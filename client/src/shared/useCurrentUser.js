import { ref } from 'vue';

const STORAGE_KEY = 'cafestudy_user_id';
const STORAGE_NAME_KEY = 'cafestudy_user_name';
const STORAGE_TOKEN_KEY = 'cafestudy_token';
const STORAGE_ADMIN_KEY = 'cafestudy_is_admin';
const STORAGE_ROLE_KEY = 'cafestudy_admin_role';

const currentUserId = ref(localStorage.getItem(STORAGE_KEY) ?? '');
const currentUserName = ref(localStorage.getItem(STORAGE_NAME_KEY) ?? '');
const currentToken = ref(localStorage.getItem(STORAGE_TOKEN_KEY) ?? '');
const storedRole = localStorage.getItem(STORAGE_ROLE_KEY)
  ?? (localStorage.getItem(STORAGE_ADMIN_KEY) === 'true' ? 'admin' : 'member');
const adminRole = ref(storedRole);
const isAdmin = ref(storedRole === 'admin' || storedRole === 'owner');
const isOwner = ref(storedRole === 'owner');

export function useCurrentUser() {
  function setCurrentUser(id, name, token = '', roleOrAdmin = 'member') {
    const role = typeof roleOrAdmin === 'string' ? roleOrAdmin : roleOrAdmin ? 'admin' : 'member';
    currentUserId.value = id;
    currentUserName.value = name;
    currentToken.value = token;
    adminRole.value = role;
    isAdmin.value = role === 'admin' || role === 'owner';
    isOwner.value = role === 'owner';
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(STORAGE_NAME_KEY, name);
    if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_ADMIN_KEY, isAdmin.value ? 'true' : 'false');
    localStorage.setItem(STORAGE_ROLE_KEY, role);
  }

  function clearCurrentUser() {
    currentUserId.value = '';
    currentUserName.value = '';
    currentToken.value = '';
    adminRole.value = 'member';
    isAdmin.value = false;
    isOwner.value = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_ADMIN_KEY);
    localStorage.removeItem(STORAGE_ROLE_KEY);
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
