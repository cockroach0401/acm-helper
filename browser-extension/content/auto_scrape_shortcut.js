(function () {
  if (window !== window.top) return;

  const SHORTCUT_KEY = 's';
  const TRIGGER_MESSAGE = 'ACM_HELPER_TRIGGER_AUTO_SCRAPE';
  const LOG_PREFIX = '[ACM Helper Shortcut]';

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }

  function ensureToast() {
    let el = document.getElementById('acm-helper-shortcut-toast');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'acm-helper-shortcut-toast';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.zIndex = '2147483647';
    el.style.maxWidth = '320px';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '10px';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.4';
    el.style.color = '#fff';
    el.style.background = 'rgba(15, 23, 42, 0.92)';
    el.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.28)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'opacity .18s ease, transform .18s ease';
    document.documentElement.appendChild(el);
    return el;
  }

  let toastTimer = null;
  function showToast(message, kind = 'info') {
    const el = ensureToast();
    if (kind === 'success') {
      el.style.background = 'rgba(22, 163, 74, 0.92)';
    } else if (kind === 'error') {
      el.style.background = 'rgba(220, 38, 38, 0.92)';
    } else {
      el.style.background = 'rgba(15, 23, 42, 0.92)';
    }

    el.textContent = message;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }, 2200);
  }

  function notifyBackgroundTriggered() {
    showToast('ACM Helper：已触发自动抓取…');
    chrome.runtime.sendMessage({ type: TRIGGER_MESSAGE }, (response) => {
      const runtimeErr = chrome.runtime.lastError;
      if (runtimeErr) {
        log('runtime.sendMessage lastError:', runtimeErr.message);
        showToast(`ACM Helper：触发失败（${runtimeErr.message}）`, 'error');
        return;
      }

      if (!response?.ok) {
        const reason = response?.reason || 'unknown';
        log('background returned error:', reason);
        showToast(`ACM Helper：触发失败（${reason}）`, 'error');
        return;
      }

      showToast('ACM Helper：自动抓取执行中', 'success');
    });
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
    if (String(event.key || '').toLowerCase() !== SHORTCUT_KEY) return;
    if (isEditableTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    log('shortcut captured on page:', window.location.href);
    notifyBackgroundTriggered();
  }

  // Listen for trigger from background when chrome.commands intercepts the key
  // (chrome.commands captures Ctrl+Shift+S at browser level before page keydown fires)
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ACM_HELPER_COMMAND_TRIGGERED') {
      log('triggered via chrome.commands');
      showToast('ACM Helper：已触发自动抓取…');
    }
  });

  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  log('shortcut listener ready:', window.location.href);
})();
