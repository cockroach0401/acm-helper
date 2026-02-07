const API_BASE_KEY = 'acm_helper_api_base';

export async function getApiBase() {
  const r = await chrome.storage.local.get(API_BASE_KEY);
  return r[API_BASE_KEY] || 'http://localhost:8000';
}

export async function setApiBase(v) {
  await chrome.storage.local.set({ [API_BASE_KEY]: v });
}

export async function api(path, options = {}) {
  const base = await getApiBase();
  const resp = await fetch(`${base}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return resp.json();
  }
  return resp.text();
}

export async function getCurrentMonth() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

