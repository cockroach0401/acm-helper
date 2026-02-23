import { api } from '../utils/api.js';
import { initI18n, t } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Constants
const CF_MESSAGE_TYPE = 'ACM_HELPER_CF_SCRAPE';
const ATCODER_MESSAGE_TYPE = 'ACM_HELPER_ATCODER_SCRAPE';
const NC_ACM_MESSAGE_TYPE = 'ACM_HELPER_NC_ACM_SCRAPE';
const NC_PRACTICE_MESSAGE_TYPE = 'ACM_HELPER_NC_PRACTICE_SCRAPE';
const LUOGU_MESSAGE_TYPE = 'ACM_HELPER_LUOGU_SCRAPE';
const LEETCODE_MESSAGE_TYPE = 'ACM_HELPER_LEETCODE_SCRAPE';

const CF_URL_RE = /^https:\/\/codeforces\.com\/(contest|gym)\/\d+\/problem\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const CF_GROUP_URL_RE = /^https:\/\/codeforces\.com\/group\/[^/]+\/(contest|gym)\/\d+\/problem\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const ATCODER_TASK_URL_RE = /^https:\/\/atcoder\.jp\/contests\/[^/]+\/tasks\/[^/?#]+(?:\?.*)?$/i;
const NC_ACM_PROBLEM_URL_RE = /^https:\/\/ac\.nowcoder\.com\/acm\/problem\/\d+(?:\?.*)?$/i;
const NC_ACM_CONTEST_URL_RE = /^https:\/\/ac\.nowcoder\.com\/acm\/contest\/\d+\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const NC_PRACTICE_URL_RE = /^https:\/\/www\.nowcoder\.com\/practice\/[0-9a-fA-F]+(?:\?.*)?$/i;
const LUOGU_URL_RE = /^https:\/\/www\.luogu\.com\.cn\/problem\/[A-Za-z0-9]+(?:\?.*)?$/i;
const LEETCODE_URL_RE = /^https:\/\/leetcode\.cn\/problems\/[^/?#]+(?:\/description\/?)?(?:\?.*)?$/i;
const ALLOWED_AC_LANGUAGES = new Set(['c', 'cpp', 'python', 'java']);

// State
let currentProblem = null;
let defaultAcLanguage = 'cpp';
let defaultLanguageLoaded = false;
let defaultLanguageLoadingPromise = null;

function showMsg(msg, isError = false) {
  const el = $('#msg');
  el.textContent = msg;
  el.style.color = isError ? '#ef4444' : 'var(--text-secondary)';
}

function resolveScrapeMessageType(url) {
  if (CF_URL_RE.test(url) || CF_GROUP_URL_RE.test(url)) return CF_MESSAGE_TYPE;
  if (ATCODER_TASK_URL_RE.test(url)) return ATCODER_MESSAGE_TYPE;
  if (NC_ACM_PROBLEM_URL_RE.test(url) || NC_ACM_CONTEST_URL_RE.test(url)) return NC_ACM_MESSAGE_TYPE;
  if (NC_PRACTICE_URL_RE.test(url)) return NC_PRACTICE_MESSAGE_TYPE;
  if (LUOGU_URL_RE.test(url)) return LUOGU_MESSAGE_TYPE;
  if (LEETCODE_URL_RE.test(url)) return LEETCODE_MESSAGE_TYPE;
  return null;
}

function normalizeAcLanguage(language) {
  const value = (language || '').toString().trim().toLowerCase();
  if (!value) return '';
  return ALLOWED_AC_LANGUAGES.has(value) ? value : '';
}

async function ensureDefaultAcLanguageLoaded() {
  if (defaultLanguageLoaded) return defaultAcLanguage;
  if (defaultLanguageLoadingPromise) return defaultLanguageLoadingPromise;

  defaultLanguageLoadingPromise = (async () => {
    try {
      const settings = await api('/api/settings');
      const configured = normalizeAcLanguage(settings?.ui?.default_ac_language);
      if (configured) defaultAcLanguage = configured;
    } catch {
      // Fallback to local default: cpp
    } finally {
      defaultLanguageLoaded = true;
      defaultLanguageLoadingPromise = null;
    }
    return defaultAcLanguage;
  })();

  return defaultLanguageLoadingPromise;
}

// --- Status Overlay Logic ---

function toggleOverlay(show) {
  const el = $('#view-import');
  if (show) {
    el.classList.remove('hidden');
    // Reset inputs
    $('#input-code').value = '';
    $('#input-language').value = defaultAcLanguage;
    $$('input[name="status"]').forEach(r => r.checked = (r.value === 'unsolved'));
    toggleCodeInput();
  } else {
    el.classList.add('hidden');
  }
}

function toggleCodeInput() {
  const status = $('input[name="status"]:checked').value;
  const codeSection = $('#code-section');
  if (status === 'solved') {
    codeSection.classList.remove('hidden');
    $('#input-code').focus();
  } else {
    codeSection.classList.add('hidden');
  }
}

// --- Main Actions ---

async function detectCurrentPage() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) {
    $('#problem-title').textContent = t('msg_no_tab');
    return;
  }

  const type = resolveScrapeMessageType(tab.url);
  if (type) {
    // It's a supported page
    const title = tab.title.split('-')[0].trim() || 'Problem Page'; // rudimentary title extract
    $('#problem-title').textContent = title;
    $('#btn-crawl').disabled = false;

    // Try to pre-fetch title more accurately via script injection? 
    // For now, tab title is fast and enough for a preview.
  } else {
    $('#problem-title').textContent = t('msg_not_problem');
    // Disable crawl
    $('#btn-crawl').disabled = true;
  }
  return tab;
}

async function startScrapeFlow() {
  await ensureDefaultAcLanguageLoaded();

  const tab = await detectCurrentPage(); // refresh tab info
  if (!tab) return;

  // 1. Scrape content first to get ID/Title/Content
  showMsg(t('msg_scraping'));
  const type = resolveScrapeMessageType(tab.url);

  try {
    const payload = await chrome.tabs.sendMessage(tab.id, { type });
    if (!payload || !payload.ok || !payload.problem) {
      throw new Error(payload?.reason || 'Unknown error');
    }

    currentProblem = payload.problem;
    showMsg(''); // clear msg

    // 2. Open Overlay for Status Selection
    toggleOverlay(true);

  } catch (err) {
    showMsg(t('msg_scrape_failed') + err.message, true);
  }
}

async function confirmImport() {
  if (!currentProblem) return;

  const status = $('input[name="status"]:checked').value;
  currentProblem.status = status;

  // If solved, grab code
  if (status === 'solved') {
    const code = $('#input-code').value;
    if (code.trim()) {
      currentProblem.my_ac_code = code;
      currentProblem.my_ac_language = $('#input-language').value || 'cpp';
    }
  }

  try {
    const response = await api('/api/problems/import', {
      method: 'POST',
      body: JSON.stringify({ problems: [currentProblem] })
    });

    // Success
    toggleOverlay(false);
    showMsg(t('msg_success') + ` (${currentProblem.id})`);
    // Maybe open dashboard automatically? 
    // User asked for flow: Clicking crawl -> status select. 
    // Done.
  } catch (err) {
    showMsg(t('msg_scrape_failed') + err.message, true);
  }
}

function openDashboard() {
  const url = chrome.runtime.getURL('dashboard/dashboard.html');
  chrome.tabs.create({ url });
}

function openSettings() {
  // Open dashboard settings tab
  const url = chrome.runtime.getURL('dashboard/dashboard.html?view=settings'); // We can add query param handling in dashboard later
  // Actually, just open dashboard is fine for now, user can click settings.
  chrome.tabs.create({ url });
}

// --- Init ---

function init() {
  initI18n();
  ensureDefaultAcLanguageLoaded();
  detectCurrentPage();

  // Listeners
  $('#btn-crawl').addEventListener('click', startScrapeFlow);
  $('#btn-dashboard').addEventListener('click', openDashboard);
  $('#btn-settings').addEventListener('click', openSettings);

  // Overlay Listeners
  $('#btn-cancel').addEventListener('click', () => toggleOverlay(false));
  $('#btn-confirm-import').addEventListener('click', confirmImport);

  $$('input[name="status"]').forEach(el => {
    el.addEventListener('change', toggleCodeInput);
  });
}

init();
