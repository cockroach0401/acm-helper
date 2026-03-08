(function () {
  const REQUEST_EVENT = 'ACM_HELPER_NC_MAIN_WORLD_REQUEST';
  const RESPONSE_EVENT = 'ACM_HELPER_NC_MAIN_WORLD_RESPONSE';
  const LOG_PREFIX = '[ACM Helper Nowcoder Main]';

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function normalizeCode(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .replace(/\u00a0/g, ' ')
      .trimEnd();
  }

  function normalizeLanguage(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\s*[（(][^()（）]+[)）]\s*$/, '')
      .trim();
  }

  function previewText(value, maxLength = 120) {
    return String(value || '')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .slice(0, maxLength);
  }

  function getCodeMirrorState() {
    const editors = Array.from(document.querySelectorAll('.CodeMirror'));
    const candidates = editors.map((editorEl, index) => {
      const directValue = editorEl?.CodeMirror?.getValue?.() || '';
      const domLines = Array.from(editorEl.querySelectorAll('.CodeMirror-code pre'))
        .map((pre) => pre.innerText || pre.textContent || '')
        .join('\n');
      const codeNodeText = editorEl.querySelector('.CodeMirror-code')?.innerText
        || editorEl.querySelector('.CodeMirror-code')?.textContent
        || '';
      const textareaValue = editorEl.querySelector('textarea')?.value || '';
      const rawValue = directValue || domLines || codeNodeText || textareaValue || '';
      const code = normalizeCode(rawValue);
      return {
        index,
        code,
        summary: {
          index,
          length: code.length,
          hasInstance: !!editorEl?.CodeMirror,
          preview: previewText(code),
          lineCount: editorEl.querySelectorAll('.CodeMirror-code pre').length,
          textareaLength: textareaValue.length,
        },
      };
    });

    log('getCodeMirrorState:candidates', candidates.map((item) => item.summary));
    return candidates.find((item) => item.code) || null;
  }

  function getAceState() {
    if (!window.ace) {
      return null;
    }

    const editors = Array.from(document.querySelectorAll('.ace_editor'));
    const candidates = editors.map((editorEl, index) => {
      try {
        const rawValue = window.ace.edit(editorEl)?.getValue?.() || '';
        const code = normalizeCode(rawValue);
        return {
          index,
          code,
          summary: { index, length: code.length, preview: previewText(code) },
        };
      } catch (error) {
        return {
          index,
          code: '',
          summary: { index, error: error?.message || String(error) },
        };
      }
    });

    log('getAceState:candidates', candidates.map((item) => item.summary));
    return candidates.find((item) => item.code) || null;
  }

  function getLanguage() {
    const inputs = Array.from(document.querySelectorAll('input[readonly], input.el-input__inner, .el-select .el-input__inner'));
    const matched = inputs
      .map((el, index) => ({
        index,
        raw: el.value || el.getAttribute('value') || el.textContent || '',
      }))
      .map((item) => ({ ...item, normalized: normalizeLanguage(item.raw) }))
      .find((item) => item.normalized);

    log('getLanguage:result', matched || null);
    return matched?.normalized || '';
  }

  function readEditorState() {
    const codeMirror = getCodeMirrorState();
    const ace = getAceState();
    const state = {
      code: codeMirror?.code || ace?.code || '',
      language: getLanguage(),
      source: codeMirror?.code ? 'codemirror-main-world' : (ace?.code ? 'ace-main-world' : ''),
    };

    log('readEditorState:result', {
      source: state.source,
      codeLength: state.code.length,
      language: state.language,
      preview: previewText(state.code),
    });
    return state;
  }

  window.addEventListener(REQUEST_EVENT, (event) => {
    const requestId = event?.detail?.requestId;
    if (!requestId) {
      return;
    }

    const state = readEditorState();
    window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: {
        requestId,
        ...state,
      },
    }));
  });

  log('main world bridge ready', window.location.href);
})();
