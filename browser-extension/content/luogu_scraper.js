(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_LUOGU_SCRAPE';

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const cleanNodeText = (node, selectorsToRemove = ['.katex-mathml', '.MathJax', '.MathJax_Preview']) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const isHeading = (node) => node && /^H[1-6]$/.test(node.tagName);

  const findHeading = (root, patterns) => {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    return headings.find((heading) => {
      const text = cleanNodeText(heading);
      return patterns.some((regex) => regex.test(text));
    });
  };

  const collectSectionNodes = (heading) => {
    if (!heading) return [];
    const nodes = [];
    let node = heading.nextElementSibling;
    while (node && !isHeading(node)) {
      nodes.push(node);
      node = node.nextElementSibling;
    }
    return nodes;
  };

  const collectSectionText = (root, patterns) => {
    const heading = findHeading(root, patterns);
    if (!heading) return '';
    const nodes = collectSectionNodes(heading);
    const parts = [];
    nodes.forEach((node) => {
      const text = node.matches('pre, code')
        ? normalizeText(node.innerText || node.textContent || '')
        : cleanNodeText(node);
      if (text) parts.push(text);
    });
    return parts.join('\n\n');
  };

  const parseLimits = () => {
    const findStat = (label) => {
      const nodes = Array.from(document.querySelectorAll('.stat-text.name'));
      const target = nodes.find((node) => cleanNodeText(node) === label);
      if (!target) return '';
      const value = target.nextElementSibling ? cleanNodeText(target.nextElementSibling) : '';
      return value ? `${label}: ${value}` : '';
    };
    const timeLimit = findStat('时间限制');
    const memoryLimit = findStat('内存限制');
    return [timeLimit, memoryLimit].filter(Boolean).join('\n');
  };

  const parseSamples = (root) => {
    const heading = findHeading(root, [/输入输出样例/, /Sample/i]);
    const nodes = collectSectionNodes(heading);
    if (!nodes.length) return [];
    const pres = [];
    nodes.forEach((node) => {
      node.querySelectorAll('pre').forEach((pre) => {
        const text = normalizeText(pre.innerText || pre.textContent || '');
        if (text) pres.push(text);
      });
    });
    const samples = [];
    for (let i = 0; i < pres.length; i += 2) {
      samples.push({
        index: samples.length + 1,
        input: pres[i] || '',
        output: pres[i + 1] || '',
      });
    }
    return samples;
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const root =
      document.querySelector('.problem-card') ||
      document.querySelector('.problem-content') ||
      document.querySelector('#article') ||
      document.querySelector('.problem-body') ||
      document.body;

    const titleNode =
      document.querySelector('.problem-card h1') ||
      document.querySelector('.problem-title') ||
      document.querySelector('h1');
    const titleRaw = cleanNodeText(titleNode) || document.title || 'Untitled';
    const title = titleRaw.replace(/^P\d+\s*/i, '').trim() || titleRaw;

    const description = collectSectionText(root, [/题目描述/, /Description/i]);
    const inputFormat = collectSectionText(root, [/输入格式/, /Input/i]);
    const outputFormat = collectSectionText(root, [/输出格式/, /Output/i]);
    const hintText = collectSectionText(root, [/说明\/提示/, /说明/, /提示/, /Notes?/i, /Constraints?/i]);

    const constraintsParts = [];
    const limitText = parseLimits();
    if (limitText) constraintsParts.push(limitText);
    if (hintText) constraintsParts.push(hintText);
    const constraints = constraintsParts.join('\n');

    const samples = parseSamples(root);
    const sampleParts = [];
    samples.forEach((sample) => {
      sampleParts.push(`Sample ${sample.index} Input:\n${sample.input}`);
      sampleParts.push(`Sample ${sample.index} Output:\n${sample.output}`);
    });
    const content = [description, ...sampleParts].filter(Boolean).join('\n\n');

    const idMatch = window.location.pathname.match(/\/problem\/([A-Za-z0-9]+)/);
    const sourceId = idMatch ? idMatch[1] : window.location.pathname.replace(/^\//, '').replace(/\//g, '_');

    return {
      ok: true,
      url,
      problem: {
        source: 'luogu',
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
        source_path: window.location.pathname,
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
