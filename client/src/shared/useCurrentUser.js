import { ref } from 'vue';

const STORAGE_KEY = 'cafestudy_user_id';
const STORAGE_NAME_KEY = 'cafestudy_user_name';

const currentUserId = ref(localStorage.getItem(STORAGE_KEY) ?? '');
const currentUserName = ref(localStorage.getItem(STORAGE_NAME_KEY) ?? '');

export function useCurrentUser() {
  function setCurrentUser(id, name) {
    currentUserId.value = id;
    currentUserName.value = name;
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(STORAGE_NAME_KEY, name);
  }

  function clearCurrentUser() {
    currentUserId.value = '';
    currentUserName.value = '';
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
  }

  return { currentUserId, currentUserName, setCurrentUser, clearCurrentUser };
}
