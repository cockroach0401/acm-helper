const API_BASE_KEY = 'acm_helper_api_base';
const LOG_PREFIX = '[ACM Helper API]';

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function summarizeBody(body) {
  if (body == null) {
    return null;
  }

  if (body instanceof FormData) {
    return { type: 'FormData' };
  }

  if (typeof body !== 'string') {
    return { type: typeof body };
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') {
      return { jsonType: typeof parsed };
    }

    if (Array.isArray(parsed.problems)) {
      return {
        problems: parsed.problems.map((problem) => ({
          source: problem?.source || '',
          id: problem?.id || '',
          status: problem?.status || '',
          my_ac_language: problem?.my_ac_language || '',
          my_ac_code_length: String(problem?.my_ac_code || '').length,
        })),
      };
    }

    return { jsonKeys: Object.keys(parsed) };
  } catch {
    return { type: 'string', length: body.length };
  }
}

function summarizeJsonResponse(data) {
  if (Array.isArray(data)) {
    return { type: 'array', length: data.length };
  }

  if (!data || typeof data !== 'object') {
    return { type: typeof data };
  }

  return {
    keys: Object.keys(data),
    ok: data.ok,
  };
}

export async function getApiBase() {
  const r = await chrome.storage.local.get(API_BASE_KEY);
  const base = r[API_BASE_KEY] || 'http://localhost:8000';
  log('resolved api base:', base, r[API_BASE_KEY] ? '(from storage)' : '(default)');
  return base;
}

export async function setApiBase(v) {
  await chrome.storage.local.set({ [API_BASE_KEY]: v });
  log('api base updated:', v);
}

export async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const base = await getApiBase();
  const url = `${base}${path}`;
  const headers = { ...options.headers };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  log('request start:', {
    method,
    url,
    body: summarizeBody(options.body),
  });

  const resp = await fetch(url, {
    headers,
    ...options
  });

  const contentType = resp.headers.get('content-type') || '';
  log('response received:', {
    method,
    url,
    status: resp.status,
    ok: resp.ok,
    contentType,
  });

  if (!resp.ok) {
    const text = await resp.text();
    log('request failed:', {
      method,
      url,
      status: resp.status,
      error: text || `HTTP ${resp.status}`,
    });
    throw new Error(text || `HTTP ${resp.status}`);
  }

  if (contentType.includes('application/json')) {
    const data = await resp.json();
    log('response json:', {
      method,
      url,
      summary: summarizeJsonResponse(data),
    });
    return data;
  }

  const text = await resp.text();
  log('response text:', {
    method,
    url,
    length: text.length,
  });
  return text;
}

export async function getCurrentMonth() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
