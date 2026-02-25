import { api } from '../utils/api.js';

const API_BASE_KEY = 'acm_helper_api_base';
const COMMAND_AUTO_SCRAPE = 'auto-scrape-problem';
const TRIGGER_AUTO_SCRAPE_MESSAGE = 'ACM_HELPER_TRIGGER_AUTO_SCRAPE';
const LOG_PREFIX = '[ACM Helper Background]';

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

function resolveScrapeMessageType(url) {
  if (CF_URL_RE.test(url) || CF_GROUP_URL_RE.test(url)) return CF_MESSAGE_TYPE;
  if (ATCODER_TASK_URL_RE.test(url)) return ATCODER_MESSAGE_TYPE;
  if (NC_ACM_PROBLEM_URL_RE.test(url) || NC_ACM_CONTEST_URL_RE.test(url)) return NC_ACM_MESSAGE_TYPE;
  if (NC_PRACTICE_URL_RE.test(url)) return NC_PRACTICE_MESSAGE_TYPE;
  if (LUOGU_URL_RE.test(url)) return LUOGU_MESSAGE_TYPE;
  if (LEETCODE_URL_RE.test(url)) return LEETCODE_MESSAGE_TYPE;
  return null;
}

async function notify(title, message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: '1.png',
    title,
    message
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function handleAutoScrapeCommand(triggerSource = 'unknown') {
  log('trigger received:', triggerSource);
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    await notify(
      text('ACM 助手', 'ACM Helper'),
      text('未找到当前标签页，无法自动抓取。', 'No active tab found, auto scrape aborted.')
    );
    log('abort: no active tab');
    return;
  }

  log('active tab:', tab.url);
  const messageType = resolveScrapeMessageType(tab.url);
  if (!messageType) {
    await notify(
      text('ACM 助手', 'ACM Helper'),
      text('当前页面不支持自动抓取。', 'Current page is not supported for auto scrape.')
    );
    log('abort: unsupported url');
    return;
  }

  await notify(
    text('ACM 助手', 'ACM Helper'),
    text('已触发自动抓取（快捷键 Ctrl+Shift+S）。', 'Auto scrape triggered (Ctrl+Shift+S).')
  );

  try {
    const payload = await chrome.tabs.sendMessage(tab.id, { type: messageType });
    if (!payload || !payload.ok || !payload.problem) {
      throw new Error(payload?.reason || text('未知抓取错误', 'Unknown scrape error'));
    }

    const problem = { ...payload.problem, status: 'unsolved' };
    log('scrape ok:', `${problem.source}:${problem.id}`);

    await api('/api/problems/import', {
      method: 'POST',
      body: JSON.stringify({ problems: [problem] })
    });

    await notify(
      text('自动抓取成功', 'Auto scrape succeeded'),
      text(`已导入题目：${problem.id}`, `Imported problem: ${problem.id}`)
    );
    log('import ok:', `${problem.source}:${problem.id}`);
  } catch (err) {
    await notify(
      text('自动抓取失败', 'Auto scrape failed'),
      `${text('错误：', 'Error: ')}${err?.message || String(err)}`
    );
    log('import failed:', err?.message || String(err));
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === COMMAND_AUTO_SCRAPE) {
    // Send toast to content script for visual feedback (chrome.commands intercepts
    // the keydown event before content scripts can see it, so the content script's
    // own keydown handler never fires — we must notify it explicitly).
    getActiveTab().then((tab) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'ACM_HELPER_COMMAND_TRIGGERED' }).catch(() => {});
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
  log('message trigger from tab:', senderUrl);

  handleAutoScrapeCommand('content-script-message')
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, reason: err?.message || String(err) }));

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const setting = await chrome.storage.local.get(API_BASE_KEY);
  if (!setting?.[API_BASE_KEY]) {
    await chrome.storage.local.set({ [API_BASE_KEY]: 'http://localhost:8000' });
  }
  log('installed/updated');
});
