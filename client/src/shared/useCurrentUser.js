import { ref } from 'vue';

const STORAGE_KEY = 'cafestudy_user_id';
const STORAGE_NAME_KEY = 'cafestudy_user_name';
const STORAGE_TOKEN_KEY = 'cafestudy_token';
const STORAGE_ADMIN_KEY = 'cafestudy_is_admin';

const currentUserId = ref(localStorage.getItem(STORAGE_KEY) ?? '');
const currentUserName = ref(localStorage.getItem(STORAGE_NAME_KEY) ?? '');
const currentToken = ref(localStorage.getItem(STORAGE_TOKEN_KEY) ?? '');
const isAdmin = ref(localStorage.getItem(STORAGE_ADMIN_KEY) === 'true');

export function useCurrentUser() {
  function setCurrentUser(id, name, token = '', admin = false) {
    currentUserId.value = id;
    currentUserName.value = name;
    currentToken.value = token;
    isAdmin.value = admin;
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(STORAGE_NAME_KEY, name);
    if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_ADMIN_KEY, admin ? 'true' : 'false');
  }

  function clearCurrentUser() {
    currentUserId.value = '';
    currentUserName.value = '';
    currentToken.value = '';
    isAdmin.value = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_ADMIN_KEY);
  }

  return { currentUserId, currentUserName, currentToken, isAdmin, setCurrentUser, clearCurrentUser };
}
