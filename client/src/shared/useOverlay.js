import { nextTick, onBeforeUnmount, unref, watch } from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const overlayStack = [];
let scrollLockCount = 0;
let previousOverflow = '';
let previousPaddingRight = '';

function resolveOption(value) {
  return typeof value === 'function' ? value() : unref(value);
}

function visibleFocusableElements(container) {
  if (!container) return [];

  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return element.getClientRects().length > 0;
  });
}

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    previousOverflow = document.body.style.overflow;
    previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  scrollLockCount += 1;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount !== 0) return;

  document.body.style.overflow = previousOverflow;
  document.body.style.paddingRight = previousPaddingRight;
}

/**
 * 모달·시트·메뉴의 키보드와 스크롤 동작을 한곳에서 관리한다.
 * enabled는 boolean, ref, computed 또는 getter를 받을 수 있다.
 */
export function useOverlay({
  containerRef,
  enabled = true,
  onClose,
  initialFocusRef,
  initialFocusSelector = '',
  trapFocus = true,
  lockScroll = true,
  closeOnEscape = true,
  restoreFocus = true,
}) {
  const overlay = {};
  let active = false;
  let lockedScroll = false;
  let previousFocus = null;

  function isTopOverlay() {
    return overlayStack.at(-1) === overlay;
  }

  function focusInitialElement() {
    void nextTick(() => {
      if (!active) return;

      const container = unref(containerRef);
      const explicitTarget = unref(initialFocusRef);
      const selectorTarget = initialFocusSelector
        ? container?.querySelector(initialFocusSelector)
        : null;
      const target = explicitTarget
        || selectorTarget
        || visibleFocusableElements(container)[0]
        || container;

      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    });
  }

  function onKeydown(event) {
    if (!active || !isTopOverlay()) return;

    if (event.key === 'Escape' && resolveOption(closeOnEscape)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose?.();
      return;
    }

    if (event.key !== 'Tab' || !resolveOption(trapFocus)) return;

    const container = unref(containerRef);
    const focusable = visibleFocusableElements(container);

    if (!focusable.length) {
      event.preventDefault();
      container?.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    const current = document.activeElement;

    if (event.shiftKey && (current === first || !container?.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !container?.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  function activate() {
    if (active) return;
    active = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayStack.push(overlay);

    lockedScroll = Boolean(resolveOption(lockScroll));
    if (lockedScroll) acquireScrollLock();

    document.addEventListener('keydown', onKeydown, true);
    focusInitialElement();
  }

  function deactivate() {
    if (!active) return;
    active = false;

    document.removeEventListener('keydown', onKeydown, true);
    const stackIndex = overlayStack.lastIndexOf(overlay);
    if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);

    if (lockedScroll) {
      releaseScrollLock();
      lockedScroll = false;
    }

    if (resolveOption(restoreFocus) && previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  const stopWatching = watch(
    () => Boolean(resolveOption(enabled)),
    (isEnabled) => {
      if (isEnabled) activate();
      else deactivate();
    },
    { immediate: true, flush: 'post' },
  );

  onBeforeUnmount(() => {
    stopWatching();
    deactivate();
  });

  return { focusInitialElement };
}
