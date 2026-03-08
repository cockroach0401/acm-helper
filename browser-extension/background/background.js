import { api } from '../utils/api.js';

const API_BASE_KEY = 'acm_helper_api_base';
const COMMAND_AUTO_SCRAPE = 'auto-scrape-problem';
const TRIGGER_AUTO_SCRAPE_MESSAGE = 'ACM_HELPER_TRIGGER_AUTO_SCRAPE';
const PAGE_TOAST_MESSAGE = 'ACM_HELPER_SHOW_PAGE_TOAST';
const LOG_PREFIX = '[ACM Helper Background]';

const CF_MESSAGE_TYPE = 'ACM_HELPER_CF_SCRAPE';
const ATCODER_MESSAGE_TYPE = 'ACM_HELPER_ATCODER_SCRAPE';
const NC_ACM_MESSAGE_TYPE = 'ACM_HELPER_NC_ACM_SCRAPE';
const NC_PRACTICE_MESSAGE_TYPE = 'ACM_HELPER_NC_PRACTICE_SCRAPE';
const LUOGU_MESSAGE_TYPE = 'ACM_HELPER_LUOGU_SCRAPE';
const LEETCODE_MESSAGE_TYPE = 'ACM_HELPER_LEETCODE_SCRAPE';

const NC_ACM_ACTION_READ_STATUS = 'READ_SUBMISSION_STATUS';
const NC_ACM_ACTION_READ_EDITOR = 'READ_EDITOR_SNAPSHOT';

const CF_URL_RE = /^https:\/\/codeforces\.com\/(contest|gym)\/\d+\/problem\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const CF_GROUP_URL_RE = /^https:\/\/codeforces\.com\/group\/[^/]+\/(contest|gym)\/\d+\/problem\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const ATCODER_TASK_URL_RE = /^https:\/\/atcoder\.jp\/contests\/[^/]+\/tasks\/[^/?#]+(?:\?.*)?$/i;
const NC_ACM_PROBLEM_URL_RE = /^https:\/\/ac\.nowcoder\.com\/acm\/problem\/\d+(?:\?.*)?$/i;
const NC_ACM_CONTEST_URL_RE = /^https:\/\/ac\.nowcoder\.com\/acm\/contest\/\d+\/[A-Za-z0-9_]+(?:\?.*)?$/i;
const NC_PRACTICE_URL_RE = /^https:\/\/www\.nowcoder\.com\/practice\/[0-9a-fA-F]+(?:\?.*)?$/i;
const LUOGU_URL_RE = /^https:\/\/www\.luogu\.com\.cn\/problem\/[A-Za-z0-9]+(?:\?.*)?$/i;
const LEETCODE_URL_RE = /^https:\/\/leetcode\.cn\/problems\/[^/?#]+(?:\/description\/?)?(?:\?.*)?$/i;

const NOWCODER_STATUS_URL_PATTERNS = [
  'https://ac.nowcoder.com/nccommon/status*',
  'https://www.nowcoder.com/nccommon/status*'
];
const NOWCODER_STATUS_PATH_RE = /^\/nccommon\/status$/i;
const NOWCODER_PAGE_ORIGIN_RE = /^https:\/\/(?:ac|www)\.nowcoder\.com$/i;
const NOWCODER_SUBMISSION_TTL_MS = 5 * 60 * 1000;
const NOWCODER_MANUAL_SKIP_TTL_MS = 15 * 1000;
const NOWCODER_EDITOR_RETRY_DELAYS_MS = [0, 300, 900];

const nowcoderProcessedSubmissionIds = new Map();
const nowcoderInflightSubmissionIds = new Set();
const nowcoderAutoImportingTabIds = new Map();

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function isZh() {
  const lang = (chrome.i18n?.getUILanguage?.() || 'zh-CN').toLowerCase();
  return lang.startsWith('zh');
}

function text(zh, en) {
  return isZh() ? zh : en;
}

function summarizeProblem(problem) {
  if (!problem || typeof problem !== 'object') {
    return problem;
  }

  return {
    source: problem.source || '',
    id: problem.id || '',
    status: problem.status || '',
    my_ac_language: problem.my_ac_language || '',
    my_ac_code_length: String(problem.my_ac_code || '').length,
    title: problem.title || '',
  };
}

function summarizeSubmission(submission) {
  if (!submission || typeof submission !== 'object') {
    return submission;
  }

  return {
    submissionId: submission.submissionId || '',
    status: submission.status,
    judgeReplyDesc: submission.judgeReplyDesc || '',
    desc: submission.desc || '',
    language: submission.language || '',
  };
}

function summarizeEditor(editor) {
  if (!editor || typeof editor !== 'object') {
    return editor;
  }

  return {
    my_ac_language: editor.my_ac_language || '',
    my_ac_code_length: String(editor.my_ac_code || '').length,
  };
}

function summarizeTab(tab) {
  if (!tab || typeof tab !== 'object') {
    return tab;
  }

  return {
    id: tab.id,
    url: tab.url || '',
    title: tab.title || '',
  };
}

function resolveScrapeMessageType(url) {
  if (CF_URL_RE.test(url)) return CF_MESSAGE_TYPE;
  if (CF_GROUP_URL_RE.test(url)) return CF_GROUP_URL_RE.test(url) ? CF_MESSAGE_TYPE : null;
  if (ATCODER_TASK_URL_RE.test(url)) return ATCODER_MESSAGE_TYPE;
  if (NC_ACM_PROBLEM_URL_RE.test(url) || NC_ACM_CONTEST_URL_RE.test(url)) return NC_ACM_MESSAGE_TYPE;
  if (NC_PRACTICE_URL_RE.test(url)) return NC_PRACTICE_MESSAGE_TYPE;
  if (LUOGU_URL_RE.test(url)) return LUOGU_MESSAGE_TYPE;
  if (LEETCODE_URL_RE.test(url)) return LEETCODE_MESSAGE_TYPE;
  return null;
}

async function notify(title, message) {
  log('notify:', { title, message });
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: '1.png',
      title,
      message
    });
    log('notify:done', { title, message });
  } catch (err) {
    log('notify:failed', {
      title,
      message,
      error: err?.message || String(err),
    });
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || null;
  log('getActiveTab:', summarizeTab(tab));
  return tab;
}

function cleanupNowcoderSubmissionState(now = Date.now()) {
  let processedRemoved = 0;
  for (const [submissionId, timestamp] of nowcoderProcessedSubmissionIds.entries()) {
    if (now - timestamp >= NOWCODER_SUBMISSION_TTL_MS) {
      nowcoderProcessedSubmissionIds.delete(submissionId);
      processedRemoved += 1;
    }
  }

  let tabRemoved = 0;
  for (const [tabId, expiresAt] of nowcoderAutoImportingTabIds.entries()) {
    if (expiresAt <= now) {
      nowcoderAutoImportingTabIds.delete(tabId);
      tabRemoved += 1;
    }
  }

  if (processedRemoved || tabRemoved) {
    log('cleanupNowcoderSubmissionState:', {
      processedRemoved,
      tabRemoved,
      processedSize: nowcoderProcessedSubmissionIds.size,
      inflightSize: nowcoderInflightSubmissionIds.size,
      autoImportingTabSize: nowcoderAutoImportingTabIds.size,
    });
  }
}

function markNowcoderAutoImportOnTab(tabId, ttlMs = NOWCODER_MANUAL_SKIP_TTL_MS) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const expiresAt = Date.now() + ttlMs;
  nowcoderAutoImportingTabIds.set(tabId, expiresAt);
  log('markNowcoderAutoImportOnTab:', { tabId, ttlMs, expiresAt });
}

function hasRecentNowcoderAutoImportOnTab(tabId) {
  cleanupNowcoderSubmissionState();
  const expiresAt = nowcoderAutoImportingTabIds.get(tabId);
  const hasRecent = typeof expiresAt === 'number' && expiresAt > Date.now();
  log('hasRecentNowcoderAutoImportOnTab:', { tabId, hasRecent, expiresAt: expiresAt || null });
  return hasRecent;
}

function extractNowcoderStatusRequest(url) {
  try {
    const parsed = new URL(url);
    if (!NOWCODER_STATUS_PATH_RE.test(parsed.pathname)) {
      return null;
    }

    if (!NOWCODER_PAGE_ORIGIN_RE.test(parsed.origin)) {
      return null;
    }

    const submissionId = (parsed.searchParams.get('submissionId') || '').trim();
    if (!submissionId) {
      return null;
    }

    return {
      submissionId,
      statusUrl: parsed.toString()
    };
  } catch {
    return null;
  }
}

function isNowcoderRequestFromPage(details) {
  const initiator = String(details?.initiator || details?.originUrl || '').trim();
  if (!initiator) {
    return true;
  }
  return NOWCODER_PAGE_ORIGIN_RE.test(initiator);
}

function isNowcoderAcStatus(submission) {
  const status = Number(submission?.status);
  if (status === 5) {
    return true;
  }

  const judgeReplyDesc = String(submission?.judgeReplyDesc || '').trim();
  const desc = String(submission?.desc || '').trim();
  return judgeReplyDesc === '答案正确' || desc.includes('答案正确');
}

function applyProblemOverrides(problem, overrides = {}) {
  const next = { ...problem };
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  log('applyProblemOverrides:', {
    original: summarizeProblem(problem),
    overrides: summarizeProblem(overrides),
    next: summarizeProblem(next),
  });
  return next;
}

async function sendTabMessage(tabId, message) {
  log('sendTabMessage:start', { tabId, message });
  const response = await chrome.tabs.sendMessage(tabId, message);
  log('sendTabMessage:done', { tabId, message, response });
  return response;
}

async function showPageToast(tabId, message, kind = 'info') {
  if (!Number.isInteger(tabId) || tabId < 0) return;

  let deliveredByContentScript = false;
  try {
    const response = await sendTabMessage(tabId, { type: PAGE_TOAST_MESSAGE, message, kind });
    deliveredByContentScript = response?.ok === true;
    log('showPageToast:content script result', {
      tabId,
      message,
      kind,
      response: response || null,
      deliveredByContentScript,
    });
  } catch (err) {
    log('showPageToast:message failed', { tabId, message, kind, error: err?.message || String(err) });
  }

  if (deliveredByContentScript) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (toastMessage, toastKind) => {
        if (window !== window.top) return;

        const toastId = 'acm-helper-shortcut-toast';
        let el = document.getElementById(toastId);
        if (!el) {
          el = document.createElement('div');
          el.id = toastId;
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
          el.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.28)';
          el.style.opacity = '0';
          el.style.transform = 'translateY(8px)';
          el.style.transition = 'opacity .18s ease, transform .18s ease';
          (document.body || document.documentElement).appendChild(el);
        }

        if (toastKind === 'success') {
          el.style.background = 'rgba(22, 163, 74, 0.92)';
        } else if (toastKind === 'error') {
          el.style.background = 'rgba(220, 38, 38, 0.92)';
        } else {
          el.style.background = 'rgba(15, 23, 42, 0.92)';
        }

        const previousTimer = Number(el.dataset.timerId || 0);
        if (previousTimer) {
          clearTimeout(previousTimer);
        }

        el.textContent = toastMessage || 'ACM Helper';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';

        const timerId = window.setTimeout(() => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(8px)';
          delete el.dataset.timerId;
        }, 2200);
        el.dataset.timerId = String(timerId);
      },
      args: [message, kind],
    });
    log('showPageToast:injected fallback', { tabId, message, kind });
  } catch (err) {
    log('showPageToast:failed', { tabId, message, kind, error: err?.message || String(err) });
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readNowcoderEditorSnapshotWithRetry(tabId, submission) {
  let lastPayload = null;

  for (let index = 0; index < NOWCODER_EDITOR_RETRY_DELAYS_MS.length; index += 1) {
    const waitMs = NOWCODER_EDITOR_RETRY_DELAYS_MS[index];
    if (waitMs > 0) {
      await delay(waitMs);
    }

    const payload = await sendTabMessage(tabId, {
      type: NC_ACM_MESSAGE_TYPE,
      action: NC_ACM_ACTION_READ_EDITOR
    });
    lastPayload = payload;
    const editor = payload?.ok ? payload.editor || {} : {};
    const hasCode = String(editor.my_ac_code || '').trim().length > 0;

    log('readNowcoderEditorSnapshotWithRetry:attempt', {
      attempt: index + 1,
      waitMs,
      editor: summarizeEditor(editor),
      submission: summarizeSubmission(submission),
      hasCode,
    });

    if (hasCode) {
      return payload;
    }
  }

  return lastPayload;
}

async function fetchProblemPayloadFromTab(tab, messageType) {
  if (!tab?.id || !tab.url) {
    throw new Error(text('未找到可抓取的标签页。', 'No scrapeable tab found.'));
  }

  const resolvedMessageType = messageType || resolveScrapeMessageType(tab.url);
  log('fetchProblemPayloadFromTab:', {
    tab: summarizeTab(tab),
    requestedMessageType: messageType || null,
    resolvedMessageType,
  });
  if (!resolvedMessageType) {
    throw new Error(text('当前页面不支持抓取。', 'Current page is not supported.'));
  }

  const payload = await sendTabMessage(tab.id, { type: resolvedMessageType });
  if (!payload || !payload.ok || !payload.problem) {
    log('fetchProblemPayloadFromTab:invalid payload', { payload });
    throw new Error(payload?.reason || text('未知抓取错误', 'Unknown scrape error'));
  }

  log('fetchProblemPayloadFromTab:success', {
    tabId: tab.id,
    problem: summarizeProblem(payload.problem),
    debug: payload.debug || null,
  });
  return payload;
}

async function importProblem(problem) {
  log('importProblem:start', summarizeProblem(problem));
  const result = await api('/api/problems/import', {
    method: 'POST',
    body: JSON.stringify({ problems: [problem] })
  });
  log('importProblem:done', {
    problem: summarizeProblem(problem),
    result,
  });
}

async function scrapeAndImportProblemFromTab(tab, { messageType, problemOverrides = {} } = {}) {
  log('scrapeAndImportProblemFromTab:start', {
    tab: summarizeTab(tab),
    messageType: messageType || null,
    problemOverrides: summarizeProblem(problemOverrides),
  });
  const payload = await fetchProblemPayloadFromTab(tab, messageType);
  const problem = applyProblemOverrides(payload.problem, problemOverrides);
  await importProblem(problem);
  log('scrapeAndImportProblemFromTab:done', {
    tabId: tab?.id,
    problem: summarizeProblem(problem),
  });
  return { payload, problem };
}

async function handleAutoScrapeCommand(triggerSource = 'unknown') {
  log('handleAutoScrapeCommand:start', { triggerSource });
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    await notify(
      text('ACM 助手', 'ACM Helper'),
      text('未找到当前标签页，无法自动抓取。', 'No active tab found, auto scrape aborted.')
    );
    log('handleAutoScrapeCommand:abort no active tab');
    return;
  }

  const messageType = resolveScrapeMessageType(tab.url);
  log('handleAutoScrapeCommand:resolved tab', {
    tab: summarizeTab(tab),
    messageType,
  });
  if (!messageType) {
    await notify(
      text('ACM 助手', 'ACM Helper'),
      text('当前页面不支持自动抓取。', 'Current page is not supported for auto scrape.')
    );
    log('handleAutoScrapeCommand:abort unsupported url', tab.url);
    return;
  }

  if (messageType === NC_ACM_MESSAGE_TYPE && hasRecentNowcoderAutoImportOnTab(tab.id)) {
    await notify(
      text('ACM 助手', 'ACM Helper'),
      text('检测到牛客 AC 自动导入正在进行，已跳过重复抓取。', 'Nowcoder AC auto import is already running, skipped duplicate scrape.')
    );
    log('handleAutoScrapeCommand:abort duplicate manual scrape during nowcoder auto import', { tabId: tab.id });
    return;
  }

  await notify(
    text('ACM 助手', 'ACM Helper'),
    text('已触发自动抓取（快捷键 Ctrl+Shift+S）。', 'Auto scrape triggered (Ctrl+Shift+S).')
  );

  try {
    const { problem } = await scrapeAndImportProblemFromTab(tab, {
      messageType,
      problemOverrides: { status: 'unsolved' }
    });
    log('handleAutoScrapeCommand:import ok', summarizeProblem(problem));

    await showPageToast(
      tab.id,
      text('已成功导入本题', 'Imported current problem successfully'),
      'success'
    );
    await notify(
      text('自动抓取成功', 'Auto scrape succeeded'),
      text(`已导入题目：${problem.id}`, `Imported problem: ${problem.id}`)
    );
  } catch (err) {
    await notify(
      text('自动抓取失败', 'Auto scrape failed'),
      `${text('错误：', 'Error: ')}${err?.message || String(err)}`
    );
    log('handleAutoScrapeCommand:import failed', err?.message || String(err));
  }
}

async function handleNowcoderStatusRequest(details) {
  log('handleNowcoderStatusRequest:observed details', {
    url: details?.url || '',
    tabId: details?.tabId,
    statusCode: details?.statusCode,
    initiator: details?.initiator || details?.originUrl || '',
    type: details?.type || '',
  });

  const request = extractNowcoderStatusRequest(details?.url || '');
  if (!request) {
    log('handleNowcoderStatusRequest:ignored invalid request url');
    return;
  }

  if (details?.statusCode && details.statusCode !== 200) {
    log('handleNowcoderStatusRequest:ignore non-200 status request', {
      submissionId: request.submissionId,
      statusCode: details.statusCode,
    });
    return;
  }

  if (!isNowcoderRequestFromPage(details)) {
    log('handleNowcoderStatusRequest:ignore non-page status request', {
      submissionId: request.submissionId,
      initiator: details?.initiator || details?.originUrl || '',
    });
    return;
  }

  cleanupNowcoderSubmissionState();
  if (nowcoderInflightSubmissionIds.has(request.submissionId)) {
    log('handleNowcoderStatusRequest:ignore in-flight duplicate submission', request.submissionId);
    return;
  }

  if (nowcoderProcessedSubmissionIds.has(request.submissionId)) {
    log('handleNowcoderStatusRequest:ignore recently processed submission', request.submissionId);
    return;
  }

  if (!Number.isInteger(details?.tabId) || details.tabId < 0) {
    log('handleNowcoderStatusRequest:ignore status request without tab', request.submissionId);
    return;
  }

  nowcoderInflightSubmissionIds.add(request.submissionId);
  log('handleNowcoderStatusRequest:start', {
    request,
    inflightSize: nowcoderInflightSubmissionIds.size,
    processedSize: nowcoderProcessedSubmissionIds.size,
  });

  try {
    const tab = await chrome.tabs.get(details.tabId);
    log('handleNowcoderStatusRequest:resolved tab', summarizeTab(tab));
    if (!tab?.id || !tab.url || resolveScrapeMessageType(tab.url) !== NC_ACM_MESSAGE_TYPE) {
      throw new Error(text('牛客题目页不可用，无法自动导入。', 'Nowcoder problem tab is unavailable for auto import.'));
    }

    const statusPayload = await sendTabMessage(tab.id, {
      type: NC_ACM_MESSAGE_TYPE,
      action: NC_ACM_ACTION_READ_STATUS,
      statusUrl: request.statusUrl
    });

    log('handleNowcoderStatusRequest:status payload', statusPayload);
    if (!statusPayload?.ok || !statusPayload.submission) {
      throw new Error(statusPayload?.reason || text('无法读取提交状态。', 'Failed to read submission status.'));
    }

    const submission = statusPayload.submission;
    const submissionId = String(submission.submissionId || request.submissionId || '').trim() || request.submissionId;
    log('handleNowcoderStatusRequest:submission summary', summarizeSubmission(submission));
    if (!isNowcoderAcStatus(submission)) {
      log('handleNowcoderStatusRequest:ignore non-AC submission', {
        submissionId,
        summary: summarizeSubmission(submission),
      });
      return;
    }

    const problemPayload = await fetchProblemPayloadFromTab(tab, NC_ACM_MESSAGE_TYPE);
    const editorPayload = await readNowcoderEditorSnapshotWithRetry(tab.id, submission).catch((err) => {
      log('handleNowcoderStatusRequest:editor snapshot failed', {
        submissionId,
        error: err?.message || String(err),
      });
      return null;
    });

    log('handleNowcoderStatusRequest:editor payload', editorPayload);
    const editor = editorPayload?.ok ? editorPayload.editor || {} : {};
    const problem = applyProblemOverrides(problemPayload.problem, {
      status: 'solved',
      my_ac_code: editor.my_ac_code || '',
      my_ac_language: editor.my_ac_language || submission.language || ''
    });

    log('handleNowcoderStatusRequest:final problem', {
      submissionId,
      editor: summarizeEditor(editor),
      fallbackLanguage: submission.language || '',
      problem: summarizeProblem(problem),
    });

    await importProblem(problem);
    nowcoderProcessedSubmissionIds.set(submissionId, Date.now());
    markNowcoderAutoImportOnTab(details.tabId);

    await showPageToast(
      tab.id,
      text('已成功导入本题', 'Imported current problem successfully'),
      'success'
    );
    await notify(
      text('牛客 AC 已自动导入', 'Nowcoder AC auto imported'),
      text(`已自动导入题目：${problem.id}`, `Auto imported problem: ${problem.id}`)
    );
    log('handleNowcoderStatusRequest:auto import ok', {
      submissionId,
      problem: summarizeProblem(problem),
      processedSize: nowcoderProcessedSubmissionIds.size,
    });
  } catch (err) {
    await notify(
      text('牛客 AC 自动导入失败', 'Nowcoder AC auto import failed'),
      `${text('错误：', 'Error: ')}${err?.message || String(err)}`
    );
    log('handleNowcoderStatusRequest:auto import failed', {
      submissionId: request.submissionId,
      error: err?.message || String(err),
    });
  } finally {
    nowcoderInflightSubmissionIds.delete(request.submissionId);
    log('handleNowcoderStatusRequest:finally', {
      submissionId: request.submissionId,
      inflightSize: nowcoderInflightSubmissionIds.size,
    });
  }
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    handleNowcoderStatusRequest(details).catch((err) => {
      log('nowcoder status listener error:', err?.message || String(err));
    });
  },
  {
    urls: NOWCODER_STATUS_URL_PATTERNS,
    types: ['xmlhttprequest']
  }
);

chrome.commands.onCommand.addListener((command) => {
  log('chrome.commands:onCommand', { command });
  if (command === COMMAND_AUTO_SCRAPE) {
    getActiveTab().then((tab) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'ACM_HELPER_COMMAND_TRIGGERED' }).catch((err) => {
          log('chrome.commands:failed to notify content script', err?.message || String(err));
        });
      }
    });
    handleAutoScrapeCommand('chrome.commands').catch((err) => {
      log('chrome.commands handler error:', err?.message || String(err));
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== TRIGGER_AUTO_SCRAPE_MESSAGE) return;

  const senderUrl = sender?.tab?.url || 'unknown';
  log('runtime message trigger from tab:', {
    senderUrl,
    senderTabId: sender?.tab?.id,
    message,
  });

  handleAutoScrapeCommand('content-script-message')
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      log('runtime message trigger failed', err?.message || String(err));
      sendResponse({ ok: false, reason: err?.message || String(err) });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const setting = await chrome.storage.local.get(API_BASE_KEY);
  if (!setting?.[API_BASE_KEY]) {
    await chrome.storage.local.set({ [API_BASE_KEY]: 'http://localhost:8000' });
  }
  log('installed/updated', {
    apiBase: setting?.[API_BASE_KEY] || 'http://localhost:8000',
  });
});
