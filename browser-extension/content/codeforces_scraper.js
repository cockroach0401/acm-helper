(function () {
  const MESSAGE_TYPE = 'ACM_HELPER_CF_SCRAPE';

  const normalizeText = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const cleanNodeText = (node, selectorsToRemove = []) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.MathJax, .MathJax_Preview').forEach((el) => el.remove());
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    return normalizeText(clone.innerText || clone.textContent || '');
  };

  const parseProblemMeta = () => {
    const url = window.location.href;
    const statement = document.querySelector('.problem-statement');
    if (!statement) {
      return {
        ok: false,
        reason: 'problem-statement not found',
        url,
      };
    }

    const titleRaw = cleanNodeText(statement.querySelector('.title'));
    const title = titleRaw.replace(/^([A-Z][0-9A-Z]?\.|[A-Z]\))\s*/, '').trim() || titleRaw;

    const header = statement.querySelector('.header');
    const timeLimit = cleanNodeText(header?.querySelector('.time-limit'), ['.property-title']);
    const memoryLimit = cleanNodeText(header?.querySelector('.memory-limit'), ['.property-title']);

    const statementBlock = statement.querySelector(
      ':scope > div:not(.header):not(.input-specification):not(.output-specification):not(.sample-tests):not(.note)'
    );
    let description = cleanNodeText(statementBlock);

    const noteText = cleanNodeText(statement.querySelector('.note'), ['.section-title']);
    if (noteText) {
      description = description ? `${description}\n\nNote\n${noteText}` : `Note\n${noteText}`;
    }

    const inputFormat = cleanNodeText(statement.querySelector('.input-specification'), ['.section-title']);
    const outputFormat = cleanNodeText(statement.querySelector('.output-specification'), ['.section-title']);

    const sampleInputs = Array.from(
      statement.querySelectorAll('.sample-test .input pre, .sample-tests .input pre')
    ).map((node) => normalizeText(node.innerText || node.textContent || ''));

    const sampleOutputs = Array.from(
      statement.querySelectorAll('.sample-test .output pre, .sample-tests .output pre')
    ).map((node) => normalizeText(node.innerText || node.textContent || ''));

    const tagContainer = Array.from(document.querySelectorAll('.roundbox.sidebox')).find((box) =>
      /Problem tags/i.test(box.textContent || '')
    );
    const rawTags = tagContainer
      ? Array.from(tagContainer.querySelectorAll('span.tag-box')).map((tag) => normalizeText(tag.textContent || ''))
      : [];

    const tags = [];
    let difficulty = '';
    rawTags.forEach((tag) => {
      const ratingMatch = tag.match(/^\*(\d+)$/);
      if (ratingMatch) {
        difficulty = ratingMatch[1];
        return;
      }
      if (tag.toLowerCase() === 'no tag edit access') return;
      tags.push(tag);
    });

    const constraintsParts = [];
    if (timeLimit) constraintsParts.push(`time limit per test: ${timeLimit}`);
    if (memoryLimit) constraintsParts.push(`memory limit per test: ${memoryLimit}`);
    if (difficulty) constraintsParts.push(`rating ${difficulty}`);

    const pathname = window.location.pathname;
    const contestMatch = pathname.match(/\/(contest|gym)\/(\d+)\/problem\/([A-Za-z0-9_]+)/);
    const groupMatch = pathname.match(/\/group\/([^/]+)\/(contest|gym)\/(\d+)\/problem\/([A-Za-z0-9_]+)/);

    let sourceId = '';
    if (contestMatch) {
      sourceId = `${contestMatch[2]}${contestMatch[3]}`;
    } else if (groupMatch) {
      sourceId = `${groupMatch[3]}${groupMatch[4]}`;
    } else {
      sourceId = pathname.replace(/^\//, '').replace(/\//g, '_');
    }

    const sampleTextParts = [];
    const pairCount = Math.max(sampleInputs.length, sampleOutputs.length);
    for (let index = 0; index < pairCount; index += 1) {
      const input = sampleInputs[index] || '';
      const output = sampleOutputs[index] || '';
      sampleTextParts.push(`Sample ${index + 1} Input:\n${input}`);
      sampleTextParts.push(`Sample ${index + 1} Output:\n${output}`);
    }

    const contentWithSamples = [description, ...sampleTextParts].filter(Boolean).join('\n\n');

    return {
      ok: true,
      url,
      problem: {
        source: 'codeforces',
        id: sourceId,
        title: title || 'Untitled',
        content: contentWithSamples,
        input_format: inputFormat,
        output_format: outputFormat,
        constraints: constraintsParts.join('\n'),
        tags,
        difficulty: difficulty || 'unknown',
        status: 'unsolved',
        my_ac_code: '',
        my_ac_language: '',
      },
      debug: {
        source_path: pathname,
        sample_input_count: sampleInputs.length,
        sample_output_count: sampleOutputs.length,
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
