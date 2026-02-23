(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_LEETCODE_SCRAPE';

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const cleanNodeText = (node, selectorsToRemove = ['.katex-mathml', '.MathJax', '.MathJax_Preview', 'script', 'style']) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const getSlugFromPath = () => {
    const match = window.location.pathname.match(/^\/problems\/([^/?#]+)\/?/i);
    return match ? match[1] : '';
  };

  const parseTitle = () => {
    const titleNode =
      document.querySelector('div[data-cy="question-title"]') ||
      document.querySelector('h1') ||
      document.querySelector('[class*="title"]');

    const titleRaw = cleanNodeText(titleNode) || normalizeText(document.title || 'Untitled');
    const title = titleRaw
      .replace(/\s*[-|｜]\s*力扣.*$/i, '')
      .replace(/^\d+\.\s*/, '')
      .trim();

    return title || titleRaw || 'Untitled';
  };

  const parseDifficulty = () => {
    const candidates = [
      '.text-difficulty-easy',
      '.text-difficulty-medium',
      '.text-difficulty-hard',
      '[class*="difficulty"]',
      '[data-difficulty]'
    ];

    for (const selector of candidates) {
      const node = document.querySelector(selector);
      const text = normalizeText(node?.textContent || '');
      if (!text) continue;
      if (/^简单$|^easy$/i.test(text)) return 'easy';
      if (/^中等$|^medium$/i.test(text)) return 'medium';
      if (/^困难$|^hard$/i.test(text)) return 'hard';
    }

    return 'unknown';
  };

  const parseSamplesFromBlocks = (fullText) => {
    const samples = [];
    const blockRe = /(?:^|\n)(?:示例|Example)\s*(\d+)\s*[:：]?\s*([\s\S]*?)(?=\n(?:示例|Example)\s*\d+\s*[:：]?|\n(?:提示|Constraints?)\s*[:：]?|$)/gi;

    let match;
    while ((match = blockRe.exec(fullText)) !== null) {
      const body = normalizeText(match[2] || '');
      if (!body) continue;

      const inputMatch = body.match(/(?:输入|Input)\s*[:：]\s*([\s\S]*?)(?=\n(?:输出|Output)\s*[:：]|$)/i);
      const outputMatch = body.match(/(?:输出|Output)\s*[:：]\s*([\s\S]*?)(?=\n(?:解释|Explanation|提示|Constraints?)\s*[:：]|$)/i);

      if (!inputMatch && !outputMatch) continue;
      samples.push({
        index: Number(match[1]) || (samples.length + 1),
        input: normalizeText(inputMatch?.[1] || ''),
        output: normalizeText(outputMatch?.[1] || ''),
      });
    }

    return samples.sort((a, b) => a.index - b.index);
  };

  const parseSamplesFromPre = (root) => {
    const preNodes = Array.from(root.querySelectorAll('pre'));
    const samples = [];

    preNodes.forEach((pre) => {
      const text = normalizeText(pre.innerText || pre.textContent || '');
      if (!text) return;

      const inputMatch = text.match(/(?:输入|Input)\s*[:：]\s*([\s\S]*?)(?=\n(?:输出|Output)\s*[:：]|$)/i);
      const outputMatch = text.match(/(?:输出|Output)\s*[:：]\s*([\s\S]*?)(?=\n(?:解释|Explanation|提示|Constraints?)\s*[:：]|$)/i);

      if (!inputMatch && !outputMatch) return;
      samples.push({
        index: samples.length + 1,
        input: normalizeText(inputMatch?.[1] || ''),
        output: normalizeText(outputMatch?.[1] || ''),
      });
    });

    return samples;
  };

  const parseSamples = (root, fullText) => {
    const textSamples = parseSamplesFromBlocks(fullText);
    if (textSamples.length) return textSamples;
    return parseSamplesFromPre(root);
  };

  const parseConstraints = (fullText) => {
    const m = fullText.match(/(?:提示|Constraints?)\s*[:：]?\n([\s\S]*)$/i);
    if (!m) return '';
    return normalizeText(m[1]);
  };

  const parseDescription = (fullText) => {
    const parts = fullText.split(/\n(?:示例|Example)\s*\d*\s*[:：]?/i);
    return normalizeText(parts[0] || fullText);
  };

  const parseTags = () => {
    const tags = Array.from(document.querySelectorAll('a[href*="/tag/"]'))
      .map((node) => normalizeText(node.textContent || ''))
      .filter(Boolean);
    return [...new Set(tags)];
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const root =
      document.querySelector('[data-track-load="description_content"]') ||
      document.querySelector('div[data-key="description-content"]') ||
      document.querySelector('article') ||
      document.querySelector('[class*="description"]');

    if (!root) {
      return {
        ok: false,
        reason: 'leetcode description root not found',
        url,
      };
    }

    const fullText = cleanNodeText(root);
    const description = parseDescription(fullText);
    const constraints = parseConstraints(fullText);
    const samples = parseSamples(root, fullText);

    const sampleParts = [];
    samples.forEach((sample) => {
      sampleParts.push(`Sample ${sample.index} Input:\n${sample.input}`);
      sampleParts.push(`Sample ${sample.index} Output:\n${sample.output}`);
    });

    const content = [description, ...sampleParts].filter(Boolean).join('\n\n');
    const slug = getSlugFromPath();

    return {
      ok: true,
      url,
      problem: {
        source: 'leetcode',
        id: slug || window.location.pathname.replace(/^\//, '').replace(/\//g, '_'),
        title: parseTitle(),
        url,
        content,
        input_format: '',
        output_format: '',
        constraints,
        tags: parseTags(),
        difficulty: parseDifficulty(),
        status: 'unsolved',
        my_ac_code: '',
        my_ac_language: '',
      },
      debug: {
        slug,
        sample_count: samples.length,
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
