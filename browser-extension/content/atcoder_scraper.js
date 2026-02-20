(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_ATCODER_SCRAPE';

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const cleanNodeText = (
    node,
    selectorsToRemove = ['.katex-mathml', '.btn-copy', '.div-btn-copy', '.MathJax', '.MathJax_Preview', 'script', 'style']
  ) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const isHeading = (node) => node && /^H[1-6]$/.test(node.tagName);

  const isVisible = (node) => {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  };

  const getVisibleLangRoot = (statementRoot) => {
    const langWrapper = statementRoot.querySelector(':scope > span.lang');
    if (!langWrapper) return statementRoot;

    const children = Array.from(langWrapper.children).filter((node) => node.tagName === 'SPAN');
    const visible = children.find((node) => isVisible(node));
    if (visible) return visible;

    return children.find((node) => node.classList.contains('lang-en')) ||
      children.find((node) => node.classList.contains('lang-ja')) ||
      children[0] ||
      statementRoot;
  };

  const cleanHeadingText = (headingNode) => cleanNodeText(headingNode, ['.btn-copy', '.div-btn-copy']);

  const findHeading = (root, patterns) => {
    const headings = Array.from(root.querySelectorAll('h3'));
    return headings.find((heading) => {
      const text = cleanHeadingText(heading);
      return patterns.some((regex) => regex.test(text));
    }) || null;
  };

  const collectNodesUntilNextHeading = (heading) => {
    const nodes = [];
    let current = heading?.nextElementSibling;
    while (current && !isHeading(current)) {
      nodes.push(current);
      current = current.nextElementSibling;
    }
    return nodes;
  };

  const readNodeText = (node) => {
    if (!node) return '';
    if (node.matches('pre, code')) {
      return normalizeText(node.innerText || node.textContent || '');
    }
    return cleanNodeText(node);
  };

  const extractSectionTextFromHeading = (heading) => {
    if (!heading) return '';

    const section = heading.closest('section');
    if (section && section.querySelector(':scope > h3') === heading) {
      const clone = section.cloneNode(true);
      const title = clone.querySelector(':scope > h3');
      if (title) title.remove();
      return cleanNodeText(clone);
    }

    const nodes = collectNodesUntilNextHeading(heading);
    return nodes.map((node) => readNodeText(node)).filter(Boolean).join('\n\n');
  };

  const findBestPreNode = (container) => {
    if (!container) return null;
    return (
      container.querySelector('pre.source-code-for-copy') ||
      container.querySelector('pre[id^="pre-sample"]') ||
      container.querySelector('pre')
    );
  };

  const extractSampleTextFromHeading = (heading) => {
    if (!heading) return '';

    const section = heading.closest('section');
    if (section && section.querySelector(':scope > h3') === heading) {
      const pre = findBestPreNode(section);
      return normalizeText(pre?.innerText || pre?.textContent || '');
    }

    const nodes = collectNodesUntilNextHeading(heading);
    for (const node of nodes) {
      const pre = findBestPreNode(node);
      if (pre) {
        return normalizeText(pre.innerText || pre.textContent || '');
      }
    }

    const fallback = findBestPreNode(heading.parentElement);
    return normalizeText(fallback?.innerText || fallback?.textContent || '');
  };

  const parseLimits = (limitText) => {
    const lines = [];
    const normalized = normalizeText(limitText);
    if (!normalized) return lines;

    const timeMatch = normalized.match(/(?:Time\s*Limit|実行時間制限)\s*:\s*([^/\n]+)/i);
    const memoryMatch = normalized.match(/(?:Memory\s*Limit|メモリ制限)\s*:\s*([^\n]+)/i);

    if (timeMatch) lines.push(`time limit: ${normalizeText(timeMatch[1])}`);
    if (memoryMatch) lines.push(`memory limit: ${normalizeText(memoryMatch[1])}`);

    if (!lines.length) lines.push(normalized);
    return lines;
  };

  const parseSamples = (langRoot) => {
    const samplesByIndex = new Map();
    const headings = Array.from(langRoot.querySelectorAll('h3'));

    headings.forEach((heading) => {
      const headingText = cleanHeadingText(heading);
      const inputMatch = headingText.match(/(?:Sample\s*Input|入力例)\s*(\d+)/i);
      const outputMatch = headingText.match(/(?:Sample\s*Output|出力例)\s*(\d+)/i);
      const match = inputMatch || outputMatch;
      if (!match) return;

      const index = Number(match[1]);
      if (!Number.isFinite(index)) return;

      const sample = samplesByIndex.get(index) || { index, input: '', output: '' };
      const text = extractSampleTextFromHeading(heading);
      if (inputMatch) sample.input = text;
      if (outputMatch) sample.output = text;
      samplesByIndex.set(index, sample);
    });

    return Array.from(samplesByIndex.values()).sort((left, right) => left.index - right.index);
  };

  const parseTitle = () => {
    const titleNode = document.querySelector('span.h2');
    if (titleNode) {
      const clone = titleNode.cloneNode(true);
      clone.querySelectorAll('a').forEach((node) => node.remove());
      const text = cleanNodeText(clone);
      if (text) return text;
    }

    return normalizeText(document.title || 'Untitled');
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const statementRoot = document.querySelector('#task-statement');
    if (!statementRoot) {
      return {
        ok: false,
        reason: 'task-statement not found',
        url,
      };
    }

    const langRoot = getVisibleLangRoot(statementRoot);
    const title = parseTitle();

    const limitNode = Array.from(document.querySelectorAll('#main-container p')).find((node) =>
      /Time\s*Limit|Memory\s*Limit|実行時間制限|メモリ制限/i.test(node.textContent || '')
    );
    const limitText = cleanNodeText(limitNode);

    const scoreNode = langRoot.querySelector(':scope > p');
    const scoreText = cleanNodeText(scoreNode);

    const descriptionHeading = findHeading(langRoot, [/^Problem\s*Statement$/i, /^問題文$/]);
    const constraintsHeading = findHeading(langRoot, [/^Constraints$/i, /^制約$/]);
    const inputHeading = findHeading(langRoot, [/^Input$/i, /^入力$/]);
    const outputHeading = findHeading(langRoot, [/^Output$/i, /^出力$/]);

    const description = extractSectionTextFromHeading(descriptionHeading);
    const constraintsBody = extractSectionTextFromHeading(constraintsHeading);
    const inputFormat = extractSectionTextFromHeading(inputHeading);
    const outputFormat = extractSectionTextFromHeading(outputHeading);

    const constraintsParts = [
      ...parseLimits(limitText),
      /^(Score\s*:|配点\s*:)/i.test(scoreText) ? scoreText : '',
      constraintsBody,
    ].filter(Boolean);

    const samples = parseSamples(langRoot);
    const sampleParts = [];
    samples.forEach((sample) => {
      sampleParts.push(`Sample ${sample.index} Input:\n${sample.input}`);
      sampleParts.push(`Sample ${sample.index} Output:\n${sample.output}`);
    });

    const content = [description, ...sampleParts].filter(Boolean).join('\n\n');

    const pathMatch = window.location.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/?#]+)/);
    const contestId = pathMatch ? pathMatch[1] : '';
    const taskId = pathMatch ? pathMatch[2] : '';
    const sourceId = taskId || window.location.pathname.replace(/^\//, '').replace(/\//g, '_');

    return {
      ok: true,
      url,
      problem: {
        source: 'atcoder',
        id: sourceId,
        title: title || 'Untitled',
        url,
        content,
        input_format: inputFormat,
        output_format: outputFormat,
        constraints: constraintsParts.join('\n'),
        tags: [],
        difficulty: 'unknown',
        status: 'unsolved',
        my_ac_code: '',
        my_ac_language: '',
      },
      debug: {
        contest_id: contestId,
        task_id: taskId,
        sample_count: samples.length,
        lang_root: langRoot.className || '',
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

