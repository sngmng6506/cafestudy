import { ref } from 'vue';

const toasts = ref([]);
let nextId = 0;

export function useToast() {
  function show(message, type = 'info', duration = 3500) {
    const id = ++nextId;
    toasts.value.push({ id, message, type });
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id) {
    const i = toasts.value.findIndex((t) => t.id === id);
    if (i !== -1) toasts.value.splice(i, 1);
  }

  return {
    toasts,
    show,
    dismiss,
    success: (msg, dur) => show(msg, 'success', dur),
    error: (msg, dur) => show(msg, 'error', dur),
    info: (msg, dur) => show(msg, 'info', dur),
  };
}
