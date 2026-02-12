(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_NC_PRACTICE_SCRAPE';

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const cleanNodeText = (node, selectorsToRemove = ['.katex-mathml']) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const getPracticeId = () => {
    const match = window.location.pathname.match(/\/practice\/([0-9a-fA-F]+)/);
    return match ? match[1] : '';
  };

  const parseConstraints = () => {
    const info = document.querySelector('.ta-question .content-wrapper .flex-row.flex-none .flex-auto.fs-xs');
    if (!info) return { difficulty: 'unknown', constraints: '' };

    const spans = Array.from(info.querySelectorAll('span'))
      .map((node) => normalizeText(node.textContent || ''))
      .filter(Boolean);

    const difficulty = spans.find((text) => /简单|中等|困难|hard|medium|easy/i.test(text)) || 'unknown';
    const timeLimit = spans.find((text) => text.includes('时间限制')) || '';
    const memoryLimit = spans.find((text) => text.includes('空间限制')) || '';
    const passRate = spans.find((text) => text.includes('通过率')) || '';

    return {
      difficulty,
      constraints: [timeLimit, memoryLimit, passRate].filter(Boolean).join('\n'),
    };
  };

  const parseInputOutput = () => {
    const subTitles = Array.from(document.querySelectorAll('.ta-question .content-wrapper .section-sub-title'));
    const inputTitle = subTitles.find((node) => /输入描述/.test(cleanNodeText(node)));
    const outputTitle = subTitles.find((node) => /输出描述/.test(cleanNodeText(node)));
    const inputNode = inputTitle ? inputTitle.nextElementSibling : null;
    const outputNode = outputTitle ? outputTitle.nextElementSibling : null;
    return {
      inputFormat: cleanNodeText(inputNode),
      outputFormat: cleanNodeText(outputNode),
    };
  };

  const parseSamples = () => {
    const sampleBoxes = Array.from(document.querySelectorAll('.ta-question .content-wrapper .section-box'))
      .filter((box) => /示例/.test(cleanNodeText(box.querySelector('.section-title'))));

    const samples = [];
    sampleBoxes.forEach((box, boxIndex) => {
      const items = Array.from(box.querySelectorAll('.question-sample .sample-item'));
      let inputText = '';
      let outputText = '';
      items.forEach((item) => {
        const label = cleanNodeText(item.querySelector('span'));
        const text = normalizeText(item.querySelector('pre')?.innerText || item.querySelector('pre')?.textContent || '');
        if (/输入/.test(label)) inputText = text;
        if (/输出/.test(label)) outputText = text;
      });

      if (!inputText && !outputText) return;
      samples.push({
        index: boxIndex + 1,
        input: inputText,
        output: outputText,
      });
    });
    return samples;
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const root = document.querySelector('.ta-question.question-module');
    if (!root) {
      return {
        ok: false,
        reason: 'ta-question root not found',
        url,
      };
    }

    const titleRaw = cleanNodeText(document.querySelector('.ta-question .question-title .hide-txt')) || cleanNodeText(document.querySelector('.ta-question .question-title')) || document.title || 'Untitled';
    const title = titleRaw.replace(/^[A-Z]{2,}\d+\s+/, '').trim() || titleRaw;
    const description = cleanNodeText(document.querySelector('.ta-question .content-wrapper .describe-table'));

    const { inputFormat, outputFormat } = parseInputOutput();
    const { difficulty, constraints } = parseConstraints();
    const samples = parseSamples();

    const sampleParts = [];
    samples.forEach((sample) => {
      sampleParts.push(`Sample ${sample.index} Input:\n${sample.input}`);
      sampleParts.push(`Sample ${sample.index} Output:\n${sample.output}`);
    });
    const content = [description, ...sampleParts].filter(Boolean).join('\n\n');

    const pid = getPracticeId();
    const sourceId = pid ? `P${pid}` : window.location.pathname.replace(/^\//, '').replace(/\//g, '_');

    return {
      ok: true,
      url,
      problem: {
        source: 'nowcoder_practice',
        id: sourceId,
        title: title || 'Untitled',
        url,
        content,
        input_format: inputFormat,
        output_format: outputFormat,
        constraints,
        tags: [],
        difficulty: difficulty || 'unknown',
        status: 'unsolved',
        my_ac_code: '',
        my_ac_language: '',
      },
      debug: {
        sample_count: samples.length,
        pid,
      },
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }
    sendResponse(parseProblemMeta());
  });
})();
