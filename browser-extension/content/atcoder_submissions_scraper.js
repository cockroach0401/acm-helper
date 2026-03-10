(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_ATCODER_SUBMISSION_SCRAPE';
  const BUTTON_ATTR = 'data-acm-helper-atcoder-grab';
  const ROW_MARK_ATTR = 'data-acm-helper-atcoder-row-bound';

  let scanTimer = 0;

  function isZh() {
    const lang = (chrome.i18n?.getUILanguage?.() || 'zh-CN').toLowerCase();
    return lang.startsWith('zh');
  }

  function text(zh, en) {
    return isZh() ? zh : en;
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toAbsoluteUrl(href) {
    try {
      return new URL(href, window.location.href).toString();
    } catch {
      return '';
    }
  }

  function isAcceptedStatus(cell) {
    if (!cell) return false;

    const values = [];
    const candidates = [cell, ...cell.querySelectorAll('.label, .badge, [title], [data-original-title], [aria-label]')];
    candidates.forEach((node) => {
      values.push(normalizeText(node.innerText || node.textContent || ''));
      values.push(normalizeText(node.getAttribute?.('title') || ''));
      values.push(normalizeText(node.getAttribute?.('data-original-title') || ''));
      values.push(normalizeText(node.getAttribute?.('aria-label') || ''));
    });

    return values.some((value) => /^(?:AC|Accepted|正解)$/i.test(value));
  }

  function resolveHeaderIndexes(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((node) => normalizeText(node.innerText || node.textContent || ''));

    const findIndex = (patterns) => headers.findIndex((label) => patterns.some((pattern) => pattern.test(label)));

    return {
      taskIndex: findIndex([/^Task$/i, /^Problem$/i, /^問題$/]),
      languageIndex: findIndex([/^Language$/i, /^言語$/]),
      statusIndex: findIndex([/^Status$/i, /^Result$/i, /^結果$/i, /^判定$/]),
      detailIndex: findIndex([/^Detail$/i, /^詳細$/]),
    };
  }

  function findProblemUrl(row, taskCell) {
    const candidates = [
      ...(taskCell ? Array.from(taskCell.querySelectorAll('a[href]')) : []),
      ...Array.from(row.querySelectorAll('a[href]')),
    ];

    for (const anchor of candidates) {
      const url = toAbsoluteUrl(anchor.getAttribute('href'));
      if (/^https:\/\/atcoder\.jp\/contests\/[^/]+\/tasks\/[^/?#]+(?:\?.*)?$/i.test(url)) {
        return url;
      }
    }

    return '';
  }

  function findSubmissionUrl(row, detailCell) {
    const candidates = [
      ...(detailCell ? Array.from(detailCell.querySelectorAll('a[href]')) : []),
      ...Array.from(row.querySelectorAll('a[href]')),
    ];

    for (const anchor of candidates) {
      const url = toAbsoluteUrl(anchor.getAttribute('href'));
      if (/^https:\/\/atcoder\.jp\/contests\/[^/]+\/submissions\/\d+(?:\?.*)?$/i.test(url)) {
        return url;
      }
    }

    return '';
  }

  function readLanguage(cells, languageIndex) {
    const direct = languageIndex >= 0 ? normalizeText(cells[languageIndex]?.innerText || cells[languageIndex]?.textContent || '') : '';
    if (direct) return direct;

    const fallbackCell = cells.find((cell) => /\b(?:c\+\+|gcc|clang|python|pypy|java|rust|go|kotlin|swift)\b/i.test(normalizeText(cell.innerText || cell.textContent || '')));
    return normalizeText(fallbackCell?.innerText || fallbackCell?.textContent || '');
  }

  function setButtonState(button, state, reason = '') {
    button.dataset.state = state;
    button.disabled = state === 'loading' || state === 'success';
    button.title = reason;

    if (state === 'loading') {
      button.textContent = text('抓取中...', 'Importing...');
      button.style.backgroundColor = '#5bc0de';
      button.style.borderColor = '#5bc0de';
      button.style.color = '#fff';
      return;
    }

    if (state === 'success') {
      button.textContent = text('已导入', 'Imported');
      button.style.backgroundColor = '#5cb85c';
      button.style.borderColor = '#5cb85c';
      button.style.color = '#fff';
      return;
    }

    if (state === 'error') {
      button.textContent = text('重试', 'Retry');
      button.style.backgroundColor = '#d9534f';
      button.style.borderColor = '#d9534f';
      button.style.color = '#fff';
      return;
    }

    button.textContent = text('抓取', 'Grab');
    button.style.backgroundColor = 'transparent';
    button.style.borderColor = '#5cb85c';
    button.style.color = '#5cb85c';
  }

  function ensureButton(statusCell, payload) {
    if (!statusCell) return;

    let button = statusCell.querySelector(`button[${BUTTON_ATTR}]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(BUTTON_ATTR, '1');
      button.style.padding = '1px 6px';
      button.style.border = '1px solid #5cb85c';
      button.style.borderRadius = '3px';
      button.style.backgroundColor = 'transparent';
      button.style.color = '#5cb85c';
      button.style.fontSize = '12px';
      button.style.cursor = 'pointer';
      button.style.verticalAlign = 'middle';
      button.style.whiteSpace = 'nowrap';
      button.style.transition = 'all 0.2s';

      button.addEventListener('mouseenter', () => {
        if (button.dataset.state === 'idle') {
          button.style.backgroundColor = '#5cb85c';
          button.style.color = '#fff';
        }
      });
      button.addEventListener('mouseleave', () => {
        if (button.dataset.state === 'idle') {
          button.style.backgroundColor = 'transparent';
          button.style.color = '#5cb85c';
        }
      });
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const problemUrl = button.dataset.problemUrl || '';
        const submissionUrl = button.dataset.submissionUrl || '';
        const language = button.dataset.language || '';

        if (!problemUrl || !submissionUrl) {
          setButtonState(button, 'error', text('未找到题目或提交链接。', 'Missing problem or submission link.'));
          return;
        }

        setButtonState(button, 'loading');

        try {
          const response = await chrome.runtime.sendMessage({
            type: MESSAGE_TYPE,
            problemUrl,
            submissionUrl,
            language,
          });

          if (!response?.ok) {
            throw new Error(response?.reason || text('抓取失败。', 'Import failed.'));
          }

          setButtonState(button, 'success', response.problemId || '');
        } catch (error) {
          const reason = error?.message || String(error);
          setButtonState(button, 'error', reason);
        }
      });
      statusCell.style.display = 'flex';
      statusCell.style.alignItems = 'center';
      statusCell.style.justifyContent = 'center';
      statusCell.style.gap = '8px';
      statusCell.appendChild(button);
      setButtonState(button, 'idle');
    }

    button.dataset.problemUrl = payload.problemUrl || '';
    button.dataset.submissionUrl = payload.submissionUrl || '';
    button.dataset.language = payload.language || '';
  }

  function processTable(table) {
    const headerIndexes = resolveHeaderIndexes(table);
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    rows.forEach((row) => {
      row.setAttribute(ROW_MARK_ATTR, '1');

      const cells = Array.from(row.children).filter((node) => /^(TD|TH)$/i.test(node.tagName));
      if (!cells.length) return;

      const statusCell = headerIndexes.statusIndex >= 0
        ? cells[headerIndexes.statusIndex] || null
        : cells.find((cell) => isAcceptedStatus(cell)) || null;
      if (!isAcceptedStatus(statusCell)) return;

      const taskCell = headerIndexes.taskIndex >= 0 ? cells[headerIndexes.taskIndex] || null : null;
      const detailCell = headerIndexes.detailIndex >= 0 ? cells[headerIndexes.detailIndex] || null : null;
      const problemUrl = findProblemUrl(row, taskCell);
      const submissionUrl = findSubmissionUrl(row, detailCell);

      if (!problemUrl || !submissionUrl) return;

      ensureButton(statusCell, {
        problemUrl,
        submissionUrl,
        language: readLanguage(cells, headerIndexes.languageIndex),
      });
    });
  }

  function scan() {
    scanTimer = 0;
    document.querySelectorAll('table').forEach(processTable);
  }

  function scheduleScan() {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }
    scanTimer = window.setTimeout(scan, 120);
  }

  scan();

  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
