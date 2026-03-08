(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_NC_ACM_SCRAPE';
  const ACTION_READ_STATUS = 'READ_SUBMISSION_STATUS';
  const ACTION_READ_EDITOR = 'READ_EDITOR_SNAPSHOT';
  const NOWCODER_STATUS_PATH_RE = /^\/nccommon\/status$/i;
  const NOWCODER_HOST_RE = /(^|\.)nowcoder\.com$/i;
  const NOWCODER_CODE_CACHE_KEY = 'ncDb_codeEditorCache';
  const NOWCODER_LANGUAGE_CACHE_KEY = 'ncDb_NC_Code_Langue';
  const LANGUAGE_LABEL_SUFFIX_RE = /\s*[（(][^()（）]+[)）]\s*$/;
  const LANGUAGE_VALUE_RE = /^(?:gnu\s*)?(?:c\+\+\d*|c\+\+|cpp|gcc|g\+\+|c|java|python\d*|pypy\d*|go|golang|rust|pascal|javascript|typescript|kotlin|swift|ruby|php|scala|c#|csharp)$/i;
  const LOG_PREFIX = '[ACM Helper Nowcoder]';
  const MAIN_WORLD_REQUEST_EVENT = 'ACM_HELPER_NC_MAIN_WORLD_REQUEST';
  const MAIN_WORLD_RESPONSE_EVENT = 'ACM_HELPER_NC_MAIN_WORLD_RESPONSE';
  const MAIN_WORLD_REQUEST_TIMEOUT_MS = 800;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function summarizeProblem(problem) {
    if (!problem || typeof problem !== 'object') {
      return problem;
    }

    return {
      source: problem.source || '',
      id: problem.id || '',
      title: problem.title || '',
      status: problem.status || '',
      my_ac_language: problem.my_ac_language || '',
      my_ac_code_length: String(problem.my_ac_code || '').length,
      content_length: String(problem.content || '').length,
      input_format_length: String(problem.input_format || '').length,
      output_format_length: String(problem.output_format || '').length,
      constraints_length: String(problem.constraints || '').length,
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

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const normalizeCode = (text) => {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .replace(/\u00a0/g, ' ')
      .trimEnd();
  };

  const cleanNodeText = (node, selectorsToRemove = ['.katex-mathml']) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const getIdFromPath = () => {
    const problemMatch = window.location.pathname.match(/\/acm\/problem\/(\d+)/);
    if (problemMatch) return problemMatch[1];
    const contestMatch = window.location.pathname.match(/\/acm\/contest\/(\d+)\/([A-Za-z0-9_]+)/);
    if (contestMatch) return `${contestMatch[1]}_${contestMatch[2]}`;
    return '';
  };

  const parseQuestionIntr = () => {
    const intr = document.querySelector('.terminal-topic .question-intr .subject-item-wrap');
    if (!intr) {
      log('parseQuestionIntr: subject-item-wrap not found');
      return {
        idText: '',
        timeLimit: '',
        memoryLimit: '',
        ioFormat: '',
      };
    }

    const lines = normalizeText(intr.innerText)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const findByPrefix = (prefix) => lines.find((line) => line.startsWith(prefix)) || '';
    const result = {
      idText: findByPrefix('题号：'),
      timeLimit: findByPrefix('时间限制：'),
      memoryLimit: findByPrefix('空间限制：'),
      ioFormat: findByPrefix('64bit IO Format:'),
    };
    log('parseQuestionIntr:result', result);
    return result;
  };

  const parseSamples = () => {
    const sampleBlocks = Array.from(document.querySelectorAll('.subject-describe .question-oi'));
    const samples = [];

    sampleBlocks.forEach((block, index) => {
      const inputNode =
        block.querySelector('textarea[data-clipboard-text-id^="input"]') ||
        block.querySelector('.question-oi-mod:nth-child(1) pre');
      const outputNode =
        block.querySelector('textarea[data-clipboard-text-id^="output"]') ||
        block.querySelector('.question-oi-mod:nth-child(2) pre');
      const input = normalizeText(inputNode?.value || inputNode?.innerText || inputNode?.textContent || '');
      const output = normalizeText(outputNode?.value || outputNode?.innerText || outputNode?.textContent || '');

      if (!input && !output) return;
      samples.push({
        index: index + 1,
        input,
        output,
      });
    });

    log('parseSamples:count', samples.length);
    return samples;
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    log('parseProblemMeta:start', url);
    const root = document.querySelector('.terminal-topic .subject-describe');
    if (!root) {
      const payload = {
        ok: false,
        reason: 'subject-describe not found (maybe paywalled or not logged in)',
        url,
      };
      log('parseProblemMeta:failed', payload);
      return payload;
    }

    const title = cleanNodeText(document.querySelector('.question-title')) || cleanNodeText(document.querySelector('.terminal-topic-title')) || document.title || 'Untitled';
    const description = cleanNodeText(root.querySelector('.subject-question'));

    const topLevelChildren = Array.from(root.children);
    const inputIndex = topLevelChildren.findIndex((node) => node.tagName === 'H2' && /输入描述/.test(cleanNodeText(node)));
    const outputIndex = topLevelChildren.findIndex((node) => node.tagName === 'H2' && /输出描述/.test(cleanNodeText(node)));

    const inputNode = inputIndex >= 0 ? topLevelChildren[inputIndex + 1] : null;
    const outputNode = outputIndex >= 0 ? topLevelChildren[outputIndex + 1] : null;
    const inputFormat = cleanNodeText(inputNode);
    const outputFormat = cleanNodeText(outputNode);

    const meta = parseQuestionIntr();
    const constraints = [meta.timeLimit, meta.memoryLimit, meta.ioFormat].filter(Boolean).join('\n');

    const samples = parseSamples();
    const sampleParts = [];
    samples.forEach((sample) => {
      sampleParts.push(`Sample ${sample.index} Input:\n${sample.input}`);
      sampleParts.push(`Sample ${sample.index} Output:\n${sample.output}`);
    });
    const content = [description, ...sampleParts].filter(Boolean).join('\n\n');

    const pid = getIdFromPath();
    const sourceId = pid ? `NC${pid}` : (meta.idText.replace(/^题号：/, '').trim() || window.location.pathname.replace(/^\//, '').replace(/\//g, '_'));

    const payload = {
      ok: true,
      url,
      problem: {
        source: 'nowcoder',
        id: sourceId,
        title: title || 'Untitled',
        url,
        content,
        input_format: inputFormat,
        output_format: outputFormat,
        constraints,
        tags: [],
        difficulty: 'unknown',
        status: 'unsolved',
        my_ac_code: '',
        my_ac_language: '',
      },
      debug: {
        sample_count: samples.length,
        pid,
      },
    };
    log('parseProblemMeta:success', {
      problem: summarizeProblem(payload.problem),
      debug: payload.debug,
    });
    return payload;
  };

  const extractSubmissionId = (statusUrl) => {
    try {
      const parsed = new URL(statusUrl, window.location.origin);
      return (parsed.searchParams.get('submissionId') || '').trim();
    } catch {
      return '';
    }
  };

  const readSubmissionStatus = async (statusUrl) => {
    log('readSubmissionStatus:start', statusUrl);
    let parsed;
    try {
      parsed = new URL(statusUrl, window.location.origin);
    } catch {
      const payload = {
        ok: false,
        reason: 'invalid status url',
      };
      log('readSubmissionStatus:invalid url', { statusUrl, payload });
      return payload;
    }

    if (!NOWCODER_HOST_RE.test(parsed.hostname) || !NOWCODER_STATUS_PATH_RE.test(parsed.pathname)) {
      const payload = {
        ok: false,
        reason: 'unsupported status url',
      };
      log('readSubmissionStatus:unsupported url', {
        statusUrl: parsed.toString(),
        hostname: parsed.hostname,
        pathname: parsed.pathname,
      });
      return payload;
    }

    const response = await fetch(parsed.toString(), {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json, text/plain, */*',
      },
    });

    log('readSubmissionStatus:response', {
      statusUrl: parsed.toString(),
      status: response.status,
      ok: response.ok,
    });
    if (!response.ok) {
      throw new Error(`status fetch failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    const payload = {
      ok: true,
      submission: {
        submissionId: String(data?.id || extractSubmissionId(parsed.toString()) || '').trim(),
        status: typeof data?.status === 'number' ? data.status : Number(data?.status),
        judgeReplyDesc: String(data?.judgeReplyDesc || '').trim(),
        desc: String(data?.desc || '').trim(),
        language: String(data?.language || '').trim(),
      },
    };
    log('readSubmissionStatus:success', summarizeSubmission(payload.submission));
    return payload;
  };

  const normalizeLanguageValue = (value) => {
    return normalizeText(value).replace(LANGUAGE_LABEL_SUFFIX_RE, '').trim();
  };

  const previewText = (value, maxLength = 160) => {
    return String(value || '')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .slice(0, maxLength);
  };

  const describeElement = (el) => {
    if (!el) {
      return null;
    }

    const rect = typeof el.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : { width: 0, height: 0 };

    return {
      tag: String(el.tagName || '').toLowerCase(),
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className : '',
      name: el.getAttribute?.('name') || '',
      type: el.getAttribute?.('type') || '',
      placeholder: el.getAttribute?.('placeholder') || '',
      readOnly: !!el.readOnly,
      disabled: !!el.disabled,
      visible: !!(rect.width || rect.height),
    };
  };

  const summarizeCodeCandidate = (source, value, extra = {}) => {
    const code = normalizeCode(value);
    return {
      source,
      length: code.length,
      preview: previewText(code),
      ...extra,
    };
  };

  const getEditorExtractionContext = () => {
    const activeElement = document.activeElement;
    return {
      readyState: document.readyState,
      href: window.location.href,
      questionId: String(window.pageInfo?.questionId || '').trim(),
      problemId: String(window.pageInfo?.problemId || '').trim(),
      supportLang: String(window.pageInfo?.supportLang || '').trim(),
      activeElement: activeElement ? {
        tag: String(activeElement.tagName || '').toLowerCase(),
        id: activeElement.id || '',
        className: typeof activeElement.className === 'string' ? activeElement.className : '',
        valuePreview: previewText(activeElement.value || activeElement.textContent || ''),
      } : null,
      counts: {
        codeMirror: document.querySelectorAll('.CodeMirror').length,
        ace: document.querySelectorAll('.ace_editor').length,
        textarea: document.querySelectorAll('textarea').length,
      },
    };
  };

  const getMainWorldRequestId = () => {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };

  const readMainWorldEditorState = () => {
    return new Promise((resolve) => {
      const requestId = getMainWorldRequestId();
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        window.removeEventListener(MAIN_WORLD_RESPONSE_EVENT, handleResponse);
        clearTimeout(timeoutId);
        resolve(result);
      };

      const handleResponse = (event) => {
        if (event?.detail?.requestId !== requestId) {
          return;
        }
        finish(event.detail || null);
      };

      const timeoutId = window.setTimeout(() => {
        log('readMainWorldEditorState:timeout', { requestId, timeoutMs: MAIN_WORLD_REQUEST_TIMEOUT_MS });
        finish(null);
      }, MAIN_WORLD_REQUEST_TIMEOUT_MS);

      window.addEventListener(MAIN_WORLD_RESPONSE_EVENT, handleResponse);
      window.dispatchEvent(new CustomEvent(MAIN_WORLD_REQUEST_EVENT, {
        detail: { requestId }
      }));
    });
  };

  const readLocalStorageJson = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        log('readLocalStorageJson:missing', { key });
        return null;
      }
      const parsed = JSON.parse(raw);
      log('readLocalStorageJson:success', {
        key,
        rawLength: raw.length,
        topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 10) : [],
      });
      return parsed;
    } catch (err) {
      log('readLocalStorageJson:error', { key, error: err?.message || String(err) });
      return null;
    }
  };

  const getNowcoderCachedLanguageId = () => {
    const data = readLocalStorageJson(NOWCODER_LANGUAGE_CACHE_KEY);
    return String(data?.NC_Code_Langue?.val || '').trim();
  };

  const getNowcoderSupportLanguages = () => {
    return String(window.pageInfo?.supportLang || '')
      .split(',')
      .map((value) => normalizeLanguageValue(value))
      .filter(Boolean);
  };

  const getNowcoderCachedEditorState = () => {
    const questionId = String(window.pageInfo?.questionId || '').trim();
    if (!questionId) {
      log('getNowcoderCachedEditorState:questionId missing');
      return null;
    }

    const cacheData = readLocalStorageJson(NOWCODER_CODE_CACHE_KEY);
    const cacheKey = `NC_Code_Cache_${questionId}`;
    const entry = cacheData?.[cacheKey];
    const value = entry?.val && typeof entry.val === 'object' ? entry.val : null;
    const codeMap = value?.code && typeof value.code === 'object' ? value.code : null;
    const languageId = String(value?.langue || getNowcoderCachedLanguageId() || '').trim();
    const supportLanguages = getNowcoderSupportLanguages();
    const codeEntries = codeMap
      ? Object.entries(codeMap).map(([entryLanguageId, entryValue]) => summarizeCodeCandidate('localStorage', entryValue, { languageId: entryLanguageId }))
      : [];

    log('getNowcoderCachedEditorState:', {
      questionId,
      cacheKey,
      hasEntry: !!entry,
      languageId,
      supportLanguages,
      codeKeys: codeMap ? Object.keys(codeMap) : [],
      codeEntries,
    });

    if (!codeMap) {
      return null;
    }

    return {
      questionId,
      cacheKey,
      languageId,
      supportLanguages,
      codeMap,
    };
  };

  const extractCachedEditorCode = () => {
    const state = getNowcoderCachedEditorState();
    if (!state) {
      log('extractCachedEditorCode:state missing');
      return '';
    }

    if (state.languageId) {
      const preferredRaw = state.codeMap[state.languageId] || '';
      const code = normalizeCode(preferredRaw);
      log('extractCachedEditorCode:preferred candidate', summarizeCodeCandidate('localStorage:preferred', preferredRaw, { languageId: state.languageId }));
      if (code) {
        log('extractCachedEditorCode:preferred success', { languageId: state.languageId, length: code.length, preview: previewText(code) });
        return code;
      }
    }

    const candidates = Object.entries(state.codeMap)
      .map(([languageId, value]) => {
        const code = normalizeCode(value);
        return {
          languageId,
          code,
          summary: summarizeCodeCandidate('localStorage:fallback', value, { languageId }),
        };
      })
      .filter((item) => item.code);

    log('extractCachedEditorCode:candidates', candidates.map((item) => item.summary));
    if (!candidates.length) {
      return '';
    }

    candidates.sort((a, b) => b.code.length - a.code.length);
    log('extractCachedEditorCode:fallback success', candidates[0].summary);
    return candidates[0].code;
  };

  const extractCachedEditorLanguage = () => {
    const state = getNowcoderCachedEditorState();
    if (!state?.languageId) {
      return '';
    }

    const languageIndex = Number(state.languageId) - 1;
    const language = Number.isInteger(languageIndex) && languageIndex >= 0
      ? normalizeLanguageValue(state.supportLanguages[languageIndex] || '')
      : '';
    log('extractCachedEditorLanguage:result', { languageId: state.languageId, supportLanguages: state.supportLanguages, language });
    return language;
  };

  const getReadableCodeMirrorContent = (editorEl) => {
    if (!editorEl) {
      return '';
    }

    const directValue = editorEl?.CodeMirror?.getValue?.();
    if (normalizeCode(directValue)) {
      return directValue;
    }

    const lineTexts = Array.from(editorEl.querySelectorAll('.CodeMirror-code pre'))
      .map((pre) => pre.innerText || pre.textContent || '')
      .filter((line) => line != null);
    if (lineTexts.length) {
      const joined = lineTexts.join('\n');
      if (normalizeCode(joined)) {
        return joined;
      }
    }

    const codeNodeText = editorEl.querySelector('.CodeMirror-code')?.innerText
      || editorEl.querySelector('.CodeMirror-code')?.textContent
      || '';
    if (normalizeCode(codeNodeText)) {
      return codeNodeText;
    }

    const textareaValue = editorEl.querySelector('textarea')?.value || '';
    if (normalizeCode(textareaValue)) {
      return textareaValue;
    }

    return '';
  };

  const extractCodeMirrorCode = () => {
    const editors = Array.from(document.querySelectorAll('.CodeMirror'));
    const candidates = editors.map((editorEl, index) => {
      const rawValue = getReadableCodeMirrorContent(editorEl);
      const lineTexts = Array.from(editorEl.querySelectorAll('.CodeMirror-code pre'))
        .map((pre) => pre.innerText || pre.textContent || '');
      return {
        code: normalizeCode(rawValue),
        summary: summarizeCodeCandidate('codemirror', rawValue, {
          index,
          hasInstance: !!editorEl?.CodeMirror,
          lineCount: lineTexts.length,
          linePreview: previewText(lineTexts.join('\n')),
          textareaLength: (editorEl.querySelector('textarea')?.value || '').length,
          element: describeElement(editorEl),
        }),
      };
    });

    log('extractCodeMirrorCode:candidates', candidates.map((item) => item.summary));
    const winner = candidates.find((item) => item.code);
    if (!winner) {
      log('extractCodeMirrorCode:empty');
      return '';
    }

    log('extractCodeMirrorCode:success', winner.summary);
    return winner.code;
  };

  const extractAceCode = () => {
    const editors = Array.from(document.querySelectorAll('.ace_editor'));
    log('extractAceCode:editors', editors.length);
    if (!window.ace) {
      log('extractAceCode:window.ace missing');
      return '';
    }

    const candidates = editors.map((editorEl, index) => {
      try {
        const rawValue = window.ace.edit(editorEl)?.getValue?.() || '';
        return {
          code: normalizeCode(rawValue),
          summary: summarizeCodeCandidate('ace', rawValue, {
            index,
            element: describeElement(editorEl),
          }),
        };
      } catch (err) {
        return {
          code: '',
          summary: {
            source: 'ace',
            index,
            element: describeElement(editorEl),
            error: err?.message || String(err),
          },
        };
      }
    });

    log('extractAceCode:candidates', candidates.map((item) => item.summary));
    const winner = candidates.find((item) => item.code);
    if (!winner) {
      log('extractAceCode:empty');
      return '';
    }

    log('extractAceCode:success', winner.summary);
    return winner.code;
  };

  const extractTextareaCode = () => {
    const observed = Array.from(document.querySelectorAll('textarea')).map((el, index) => {
      const rawValue = el.value || el.textContent || '';
      const code = normalizeCode(rawValue);
      return {
        code,
        summary: summarizeCodeCandidate('textarea', rawValue, {
          index,
          element: describeElement(el),
        }),
      };
    });

    log('extractTextareaCode:observed', observed.map((item) => item.summary));
    const candidates = observed.filter((item) => item.code && item.code.length >= 40 && /\n/.test(item.code));
    log('extractTextareaCode:candidates', candidates.map((item) => item.summary));
    if (!candidates.length) {
      return '';
    }

    candidates.sort((a, b) => b.code.length - a.code.length);
    log('extractTextareaCode:success', candidates[0].summary);
    return candidates[0].code;
  };

  const extractEditorCode = () => {
    const codeMirrorCode = extractCodeMirrorCode();
    if (codeMirrorCode) {
      log('extractEditorCode:using source', 'codemirror');
      return codeMirrorCode;
    }

    const aceCode = extractAceCode();
    if (aceCode) {
      log('extractEditorCode:using source', 'ace');
      return aceCode;
    }

    const cachedCode = extractCachedEditorCode();
    if (cachedCode) {
      log('extractEditorCode:using source', 'localStorage');
      return cachedCode;
    }

    const textareaCode = extractTextareaCode();
    if (textareaCode) {
      log('extractEditorCode:using source', 'textarea');
      return textareaCode;
    }

    log('extractEditorCode:no source matched');
    return '';
  };

  const extractEditorLanguage = () => {
    const candidates = Array.from(document.querySelectorAll('input[readonly], input.el-input__inner, .el-select .el-input__inner'))
      .map((el, index) => {
        const raw = el.value || el.getAttribute('value') || el.textContent || '';
        return {
          index,
          raw,
          normalized: normalizeLanguageValue(raw),
          element: describeElement(el),
        };
      })
      .filter((item) => item.normalized);

    const cachedLanguage = extractCachedEditorLanguage();
    const matched = candidates.find((item) => LANGUAGE_VALUE_RE.test(item.normalized)) || null;
    const language = matched?.normalized || cachedLanguage || '';
    log('extractEditorLanguage:result', {
      candidates,
      matched: matched ? { index: matched.index, normalized: matched.normalized } : null,
      cachedLanguage,
      language,
    });
    return language;
  };

  const extractEditorSnapshot = async () => {
    const context = getEditorExtractionContext();
    log('extractEditorSnapshot:context', context);

    const mainWorldState = await readMainWorldEditorState().catch((err) => {
      log('readMainWorldEditorState:error', err?.message || String(err));
      return null;
    });
    log('extractEditorSnapshot:mainWorldState', mainWorldState);

    const mainWorldCode = normalizeCode(mainWorldState?.code || '');
    const localCode = extractEditorCode();
    const code = mainWorldCode || localCode;

    const mainWorldLanguage = normalizeLanguageValue(mainWorldState?.language || '');
    const localLanguage = extractEditorLanguage();
    const language = mainWorldLanguage || localLanguage;

    const editor = {
      my_ac_code: code,
      my_ac_language: language,
    };
    log('extractEditorSnapshot:', {
      ...summarizeEditor(editor),
      context,
      sources: {
        mainWorldCodeLength: mainWorldCode.length,
        localCodeLength: localCode.length,
        mainWorldLanguage,
        localLanguage,
      },
    });
    return editor;
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }

    log('onMessage:received', {
      action: message.action || 'PARSE_PROBLEM_META',
      statusUrl: message.statusUrl || '',
      href: window.location.href,
    });

    if (message.action === ACTION_READ_STATUS) {
      readSubmissionStatus(message.statusUrl)
        .then((payload) => {
          log('onMessage:status response', payload.ok ? summarizeSubmission(payload.submission) : payload);
          sendResponse(payload);
        })
        .catch((err) => {
          const payload = { ok: false, reason: err?.message || String(err) };
          log('onMessage:status error', payload);
          sendResponse(payload);
        });
      return true;
    }

    if (message.action === ACTION_READ_EDITOR) {
      extractEditorSnapshot()
        .then((editor) => {
          const payload = {
            ok: true,
            editor,
          };
          log('onMessage:editor response', summarizeEditor(payload.editor));
          sendResponse(payload);
        })
        .catch((err) => {
          const payload = { ok: false, reason: err?.message || String(err) };
          log('onMessage:editor error', payload);
          sendResponse(payload);
        });
      return true;
    }

    const payload = parseProblemMeta();
    log('onMessage:problem response', payload.ok ? {
      problem: summarizeProblem(payload.problem),
      debug: payload.debug,
    } : payload);
    sendResponse(payload);
  });

  log('content script ready:', window.location.href);
})();
