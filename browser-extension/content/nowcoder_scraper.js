(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_NC_ACM_SCRAPE';

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
    return {
      idText: findByPrefix('题号：'),
      timeLimit: findByPrefix('时间限制：'),
      memoryLimit: findByPrefix('空间限制：'),
      ioFormat: findByPrefix('64bit IO Format:'),
    };
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

    return samples;
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const root = document.querySelector('.terminal-topic .subject-describe');
    if (!root) {
      return {
        ok: false,
        reason: 'subject-describe not found (maybe paywalled or not logged in)',
        url,
      };
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

    return {
      ok: true,
      url,
      problem: {
        source: 'nowcoder',
        id: sourceId,
        title: title || 'Untitled',
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
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }
    sendResponse(parseProblemMeta());
  });
})();
