import { api, getCurrentMonth } from '../utils/api.js';
import { t, getLang, setLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let pollTimer = null;

const ALLOWED_AC_LANGUAGES = ['c', 'cpp', 'python', 'java'];

const SOLUTION_TEMPLATE_VARIABLES = [
  '{{source}}',
  '{{id}}',
  '{{title}}',
  '{{status}}',
  '{{content}}',
  '{{input_format}}',
  '{{output_format}}',
  '{{constraints}}',
  '{{default_ac_language}}'
];

const WEEKLY_TEMPLATE_VARIABLES = [
  '{{insight_type}}',
  '{{target}}',
  '{{week}}',
  '{{month}}',
  '{{period}}',
  '{{from_date}}',
  '{{to_date}}',
  '{{prompt_style}}',
  '{{style_prompt_injection}}',
  '{{stats_points_json}}',
  '{{stats_json}}',
  '{{problem_list_json}}'
];

function languageLabel(lang) {
  if (lang === 'c') return 'C';
  if (lang === 'cpp') return 'C++';
  if (lang === 'python') return 'Python';
  if (lang === 'java') return 'Java';
  return lang;
}

// --- i18n ---

function applyTranslations() {
  // Text content
  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Placeholders
  $$('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  // Custom Updates
  const langLabel = $('#lang-label');
  if (langLabel) langLabel.textContent = getLang() === 'zh' ? '中文' : 'EN';

  // Options text
  $$('option[data-i18n]').forEach(opt => {
    if (opt.hasAttribute('data-i18n')) {
      opt.textContent = t(opt.getAttribute('data-i18n'));
    }
  });
}

function toggleLanguage() {
  const newLang = getLang() === 'zh' ? 'en' : 'zh';
  setLang(newLang);
  applyTranslations();
  // Rerender lists to update status badges etc if they use raw text
  loadOverview().catch(() => { });
  loadProblems().catch(() => { });
}

// --- Theme ---

function getTheme() {
  return localStorage.getItem('acm_helper_theme') || 'dark';
}

function setTheme(theme) {
  localStorage.setItem('acm_helper_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  // Update Icon
  const moon = $('#icon-moon');
  const sun = $('#icon-sun');
  if (moon && sun) {
    const isLight = theme === 'light';
    moon.classList.toggle('hidden', isLight);
    sun.classList.toggle('hidden', !isLight);
  }
}

function toggleTheme() {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  setTheme(getTheme());
}

// --- UI / Navigation ---

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'slideIn 0.3s ease';

  setTimeout(() => {
    el.style.display = 'none';
  }, 2400);
}

function switchView(viewId) {
  $$('.view').forEach(el => el.classList.remove('active'));
  $$('.nav-item').forEach(el => el.classList.remove('active'));

  const target = $(`#view-${viewId}`);
  if (target) target.classList.add('active');

  const nav = $(`.nav-item[data-view="${viewId}"]`);
  if (nav) nav.classList.add('active');

  // View specific loads
  if (viewId === 'problems') loadProblems();
  if (viewId === 'reports') loadStatsCharts();
  if (viewId === 'settings') loadSettings();
}

// --- Data Rendering (Dashboard) ---

function monthInputValueToApiMonth(v) {
  return v || '';
}

function renderStats(stats) {
  const items = [
    { label: t('stat_total'), value: stats.total, color: 'text-primary' },
    { label: t('stat_solved'), value: stats.solved, color: 'accent-success' },
    { label: t('stat_pending'), value: stats.pending_solution, color: 'accent-warning' },
    { label: t('stat_running'), value: stats.running_tasks, color: 'accent-primary' },
    { label: t('stat_failed'), value: stats.solution_failed, color: 'accent-danger' }
  ];

  const statsEl = $('#stats');
  if (statsEl) {
    statsEl.innerHTML = items
      .map(item => `
          <div class="card">
            <div class="stat-label">${item.label}</div>
            <div class="stat-value" style="color: var(--${item.color || 'text-primary'})">${item.value ?? 0}</div>
          </div>
        `)
      .join('');
  }
}

function renderPending(items) {
  const tbody = $('#pending-table tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">${t('no_pending')}</td></tr>`;
    return;
  }

  const displayItems = items.slice(0, 50);

  tbody.innerHTML = displayItems
    .map((p) => {
      const key = `${p.source}:${p.id}`;
      const dateStr = (p.updated_at || '').slice(0, 10);

      return `
      <tr>
        <td>
            <div style="font-weight:500;">${p.title}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${key}</div>
        </td>
        <td><span class="status-badge status-${p.status === 'solved' ? 'completed' : 'pending'}">${p.status}</span></td>
        <td><span class="status-badge status-${p.solution_status === 'done' ? 'completed' : 'warning'}">${p.solution_status}</span></td>
        <td>${dateStr}</td>
        <td>
            <button data-key="${key}" class="gen-one btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">${t('btn_generate')}</button>
        </td>
      </tr>`;
    })
    .join('');

  document.querySelectorAll('.gen-one').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const key = btn.getAttribute('data-key');
        toast(`${t('msg_starting_generation')} ${key}...`);
        await api('/api/solutions/tasks', {
          method: 'POST',
          body: JSON.stringify({ problem_keys: [key] })
        });
        startPolling();
      } catch (err) {
        toast(`${t('msg_task_failed')}: ${err.message}`);
      }
    });
  });
}

function renderTasks(items) {
  const tbody = $('#task-table tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 1rem;">${t('no_tasks')}</td></tr>`;
    return;
  }

  tbody.innerHTML = items
    .map((task) => {
      let statusClass = 'status-warning';
      if (task.status === 'done') statusClass = 'status-completed';
      if (task.status === 'failed') statusClass = 'status-failed';

      return `
      <tr>
        <td><span style="font-family:var(--font-mono); font-size:0.8rem;">${task.task_id.slice(0, 8)}</span></td>
        <td><span class="status-badge ${statusClass}">${task.status}</span></td>
        <td style="word-break: break-word; min-width: 200px;">
            ${task.error_message || task.output_path || '-'}
        </td>
      </tr>`;
    })
    .join('');
}

// --- Problem List Rendering ---

function renderProblemList(items) {
  const tbody = $('#problems-table tbody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(p => {
    const isCf = p.source === 'codeforces';
    const transStatus = p.translation_status || 'none';
    const isTranslated = isCf && transStatus === 'done';
    const key = `${p.source}:${p.id}`;
    const safeKey = key.replace(/[^a-zA-Z0-9]/g, '-');

    const transBadge = isTranslated
      ? `<span class="status-badge status-completed">${t('translated_done')}</span>`
      : '';

    // Actions
    let actions = [];

    // Edit
    actions.push(`<button class="btn btn-sm btn-secondary action-edit" data-s="${p.source}" data-i="${p.id}" data-k="${key}">${t('btn_generate') === 'Generate' ? 'Edit' : '编辑'}</button>`);

    // Translate (Only CF)
    if (isCf && !isTranslated) {
      actions.push(`<button class="btn btn-sm btn-secondary action-trans" data-s="${p.source}" data-i="${p.id}">${t('btn_translate')}</button>`);
    }

    // Generate Sol
    actions.push(`<button class="btn btn-sm btn-secondary action-gen" data-key="${key}">${t('btn_generate')}</button>`);

    // Delete
    actions.push(`<button class="btn btn-sm btn-danger action-del" data-s="${p.source}" data-i="${p.id}">${t('btn_delete')}</button>`);

    const diffBadge = p.difficulty ? `<span style="font-size:0.7rem; background:var(--bg-input); padding:2px 4px; border-radius:4px; margin-left:4px;">${p.difficulty}</span>` : '';

    return `
      <tr class="problem-row">
         <td>
            <div style="font-weight:600; color:var(--text-primary); display:flex; align-items:center;">
                ${p.title} ${diffBadge}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">${p.id}</div>
         </td>
         <td>${p.source}</td>
         <td><span class="status-badge status-${p.status === 'solved' ? 'completed' : (p.status === 'attempted' ? 'warning' : 'pending')}">${t('status_' + p.status) || p.status}</span></td>
         <td>${transBadge}</td>
         <td style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${actions.join('')}
         </td>
      </tr>
      <tr class="edit-row hidden" id="edit-${safeKey}">
         <td colspan="5">
           <div class="inline-edit-form loading-placeholder">Loading...</div>
         </td>
      </tr>
      `;
  }).join('');

  // Bind Actions
  tbody.querySelectorAll('.action-edit').forEach(btn => {
    btn.addEventListener('click', () => toggleEditRow(btn.dataset.s, btn.dataset.i));
  });
  tbody.querySelectorAll('.action-trans').forEach(btn => {
    btn.addEventListener('click', () => translateProblem(btn.dataset.s, btn.dataset.i));
  });
  tbody.querySelectorAll('.action-gen').forEach(btn => {
    btn.addEventListener('click', () => generateSolution(btn.dataset.key));
  });
  tbody.querySelectorAll('.action-del').forEach(btn => {
    btn.addEventListener('click', () => deleteProblem(btn.dataset.s, btn.dataset.i));
  });
}

async function toggleEditRow(source, id) {
  const key = `${source}:${id}`;
  const safeKey = key.replace(/[^a-zA-Z0-9]/g, '-');
  const row = $(`#edit-${safeKey}`);
  if (!row) return;

  const isHidden = row.classList.contains('hidden');

  // Close all other rows first (optional, but cleaner)
  $$('.edit-row').forEach(r => {
    if (r !== row) r.classList.add('hidden');
  });

  if (!isHidden) {
    row.classList.add('hidden');
    return;
  }

  row.classList.remove('hidden');
  const container = row.querySelector('td');

  // Render form if not already rendered or if we want to refresh
  renderInlineForm(container, source, id);
}

async function renderInlineForm(container, source, id) {
  container.innerHTML = `<div style="padding:1rem; text-align:center;">${t('msg_loading')}</div>`;

  try {
    // Fetch details
    const details = await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}`);
    // details has: difficulty, status, reflection, ac_code, language etc. (depending on backend)
    // If some fields missing, defaults.

    const selectedLanguage = details.my_ac_language || details.language || 'cpp';
    const langOptions = ALLOWED_AC_LANGUAGES.map(l =>
      `<option value="${l}" ${l === selectedLanguage ? 'selected' : ''}>${languageLabel(l)}</option>`
    ).join('');

    const statusOptions = ['unsolved', 'attempted', 'solved'].map(s =>
      `<option value="${s}" ${s === (details.status || 'unsolved') ? 'selected' : ''}>${t('status_' + s)}</option>`
    ).join('');

    const safeKey = `${source}:${id}`.replace(/[^a-zA-Z0-9]/g, '-');

    container.innerHTML = `
        <div class="inline-form-container" style="background:var(--bg-card-hover); padding:1rem; border-radius:8px;">
            <div class="form-group-row">
                 <div class="form-group">
                     <label style="font-size:0.8rem">${t('label_difficulty')}</label>
                     <input type="number" id="edit-diff-${safeKey}" value="${details.difficulty || ''}" placeholder="Rating" class="form-input-sm">
                 </div>
                 <div class="form-group">
                     <label style="font-size:0.8rem">${t('label_status')}</label>
                     <select id="edit-status-${safeKey}" class="form-input-sm">
                         ${statusOptions}
                     </select>
                 </div>
            </div>
            <div class="form-group">
                <label style="font-size:0.8rem">${t('label_reflection')}</label>
                <textarea id="edit-reflection-${safeKey}" class="code-editor" rows="2" placeholder="${t('placeholder_reflection')}">${details.reflection || ''}</textarea>
            </div>
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <label style="font-size:0.8rem">${t('label_code')}</label>
                    <select id="edit-lang-${safeKey}" style="font-size:0.8rem; padding:2px;">${langOptions}</select>
                </div>
                <textarea id="edit-code-${safeKey}" class="code-editor" rows="6" placeholder="${t('placeholder_code')}">${details.my_ac_code || details.ac_code || ''}</textarea>
            </div>
            <div class="actions" style="margin-top:1rem; justify-content:flex-end; display:flex; gap:0.5rem;">
                <button class="btn btn-sm btn-secondary cancel-edit-btn">${t('btn_delete').replace('Delete', 'Cancel')}</button>
                <button class="btn btn-sm btn-primary save-edit-btn">${t('btn_save_details')}</button>
            </div>
        </div>
        `;

    // Bind events
    container.querySelector('.cancel-edit-btn').addEventListener('click', () => {
      $(`#edit-${safeKey}`).classList.add('hidden');
    });
    container.querySelector('.save-edit-btn').addEventListener('click', () => {
      saveInlineDetails(source, id, safeKey);
    });

  } catch (err) {
    container.innerHTML = `<div style="color:var(--accent-danger)">Error: ${err.message}</div>`;
  }
}

async function saveInlineDetails(source, id, safeKey) {
  const diffVal = $(`#edit-diff-${safeKey}`).value;
  const difficulty = diffVal ? Number(diffVal) : null;
  const status = $(`#edit-status-${safeKey}`).value;
  const reflection = $(`#edit-reflection-${safeKey}`).value;
  const code = $(`#edit-code-${safeKey}`).value;
  const language = $(`#edit-lang-${safeKey}`).value;

  const base = `/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
  const promises = [];

  // Difficulty
  promises.push(api(`${base}/difficulty`, {
    method: 'PUT',
    body: JSON.stringify({ difficulty })
  }));

  // Status
  promises.push(api(`${base}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }));

  // Reflection
  promises.push(api(`${base}/reflection`, {
    method: 'PUT',
    body: JSON.stringify({ reflection })
  }));

  // Code
  if (code && code.trim()) {
    promises.push(api(`${base}/ac-code`, {
      method: 'PUT',
      body: JSON.stringify({ code, language, mark_solved: status === 'solved' })
    }));
  }

  try {
    await Promise.all(promises);
    toast(t('msg_meta_saved'));
    // Reload list to update badges
    await loadProblems();
    // Note: loading problems rebuilds DOM, so the edit row closes. This is expected "Done" behavior.
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function loadProblems() {
  const keyword = $('#filter-keyword').value.trim();
  const status = $('#filter-status').value;
  const source = $('#filter-source').value;

  // Build Query
  const params = new URLSearchParams();
  if (keyword) params.append('keyword', keyword);
  if (status) params.append('status', status);
  if (source) params.append('source', source);

  try {
    const data = await api(`/api/problems?${params.toString()}`);
    renderProblemList(data.items || []);
  } catch (err) {
    toast(`Load Failed: ${err.message}`);
  }
}

async function deleteProblem(source, id) {
  if (!confirm(t('msg_confirm_delete'))) return;
  try {
    await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    toast(t('msg_deleted'));
    loadProblems(); // Reload list
  } catch (err) {
    toast(`Delete Error: ${err.message}`);
  }
}

async function translateProblem(source, id) {
  try {
    toast(t('msg_translation_started'));
    await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}/translate`, {
      method: 'POST',
      body: JSON.stringify({ force: true })
    });
    setTimeout(loadProblems, 500);
  } catch (err) {
    toast(`Translate Error: ${err.message}`);
  }
}

async function generateSolution(key) {
  try {
    toast(`${t('msg_starting_generation')} ${key}...`);
    await api('/api/solutions/tasks', {
      method: 'POST',
      body: JSON.stringify({ problem_keys: [key] })
    });
  } catch (err) {
    toast(`${t('msg_task_failed')}: ${err.message}`);
  }
}

// --- Settings Rendering ---

function renderSettings(settings) {
  const ai = settings.ai || {};
  const prompts = settings.prompts || {};
  const ui = settings.ui || {};
  const options = Array.isArray(ai.model_options) && ai.model_options.length ? ai.model_options : [ai.model || 'gpt-4o-mini'];

  const providerSelect = $('#ai-provider');
  if (providerSelect) providerSelect.value = ai.provider || 'mock';

  $('#ai-api-base').value = ai.api_base || '';
  $('#ai-api-key').value = ai.api_key || '';

  const modelInput = $('#ai-model');
  modelInput.value = ai.model || options[0] || 'gpt-4o-mini';

  const datalist = $('#ai-model-datalist');
  datalist.innerHTML = options.map(m => `<option value="${m}">`).join('');

  $('#ai-model-options').value = options.join('\n');

  $('#ai-temperature').value = ai.temperature ?? 0.2;
  $('#ai-timeout').value = ai.timeout_seconds ?? 120;

  $('#solution-template').value = prompts.solution_template || '';
  $('#weekly-template').value = prompts.insight_template || '';

  const solutionVarsEl = $('#solution-template-variables');
  if (solutionVarsEl) solutionVarsEl.textContent = SOLUTION_TEMPLATE_VARIABLES.join('\n');

  const weeklyVarsEl = $('#weekly-template-variables');
  if (weeklyVarsEl) weeklyVarsEl.textContent = WEEKLY_TEMPLATE_VARIABLES.join('\n');

  const weeklyStyleEl = $('#weekly-prompt-style');
  if (weeklyStyleEl) weeklyStyleEl.value = prompts.weekly_prompt_style || 'none';

  const styleDescRigorousEl = $('#style-desc-rigorous');
  if (styleDescRigorousEl) styleDescRigorousEl.value = prompts.weekly_style_rigorous_desc || '';

  const styleDescIntuitiveEl = $('#style-desc-intuitive');
  if (styleDescIntuitiveEl) styleDescIntuitiveEl.value = prompts.weekly_style_intuitive_desc || '';

  const styleDescConciseEl = $('#style-desc-concise');
  if (styleDescConciseEl) styleDescConciseEl.value = prompts.weekly_style_concise_desc || '';

  const styleInjectionRigorousEl = $('#style-injection-rigorous');
  if (styleInjectionRigorousEl) styleInjectionRigorousEl.value = prompts.weekly_style_rigorous_injection || '';

  const styleInjectionIntuitiveEl = $('#style-injection-intuitive');
  if (styleInjectionIntuitiveEl) styleInjectionIntuitiveEl.value = prompts.weekly_style_intuitive_injection || '';

  const styleInjectionConciseEl = $('#style-injection-concise');
  if (styleInjectionConciseEl) styleInjectionConciseEl.value = prompts.weekly_style_concise_injection || '';

  const defaultAcLanguage = ui.default_ac_language || 'cpp';
  const defaultLangEl = $('#default-ac-language');
  if (defaultLangEl) defaultLangEl.value = defaultAcLanguage;

  const acLangEl = $('#ac-language');
  if (acLangEl) acLangEl.value = defaultAcLanguage;
}

// --- API Actions ---

async function loadSettings() {
  const settings = await api('/api/settings');
  renderSettings(settings);
}

async function saveAISettings() {
  const currentOptionsStr = $('#ai-model-options').value || '';
  const options = currentOptionsStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const selected = $('#ai-model').value.trim();
  if (selected && !options.includes(selected)) {
    options.push(selected);
  }

  const payload = {
    provider: $('#ai-provider').value,
    api_base: $('#ai-api-base').value.trim(),
    api_key: $('#ai-api-key').value.trim(),
    model: selected || options[0] || 'gpt-4o-mini',
    model_options: options,
    temperature: Number($('#ai-temperature').value || 0.2),
    timeout_seconds: Number($('#ai-timeout').value || 120)
  };

  try {
    await api('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast(t('msg_ai_saved'));
    await loadOverview();
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function testAISettings() {
  const resEl = $('#ai-test-result');
  resEl.classList.remove('hidden');
  resEl.textContent = t('msg_testing');

  try {
    const data = await api('/api/settings/ai/test', { method: 'POST' });
    resEl.textContent = JSON.stringify(data, null, 2);
    if (data.ok) toast(t('msg_connection_success'));
    else toast(t('msg_connection_failed'));
  } catch (err) {
    resEl.textContent = err.message;
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function savePromptSettings() {
  const payload = {
    solution_template: $('#solution-template').value,
    insight_template: $('#weekly-template').value,
    weekly_prompt_style: $('#weekly-prompt-style').value,
    weekly_style_rigorous_desc: $('#style-desc-rigorous').value,
    weekly_style_intuitive_desc: $('#style-desc-intuitive').value,
    weekly_style_concise_desc: $('#style-desc-concise').value,
    weekly_style_rigorous_injection: $('#style-injection-rigorous').value,
    weekly_style_intuitive_injection: $('#style-injection-intuitive').value,
    weekly_style_concise_injection: $('#style-injection-concise').value
  };

  try {
    await api('/api/settings/prompts', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast(t('msg_templates_saved'));
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function saveUiSettings() {
  const payload = {
    default_ac_language: $('#default-ac-language').value
  };

  try {
    const data = await api('/api/settings/ui', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const lang = data?.ui?.default_ac_language || payload.default_ac_language;
    const acLangEl = $('#ac-language');
    if (acLangEl) acLangEl.value = lang;

    toast(t('msg_ui_saved'));
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function loadOverview() {
  const month = monthInputValueToApiMonth($('#month').value);
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const data = await api(`/api/dashboard/overview${query}`);

  renderStats(data.stats || {});
  renderPending(data.pending || []);
  renderTasks(data.tasks || []);

  const hasActive = (data.tasks || []).some((task) => task.status === 'queued' || task.status === 'running');
  if (hasActive) startPolling();
  else if (pollTimer) stopPolling();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      await loadOverview();
    } catch { }
  }, 3000);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

async function importProblems() {
  const source = ($('#import-source')?.value || '').trim() || 'manual';
  const id = ($('#import-id')?.value || '').trim();
  const title = ($('#import-title')?.value || '').trim();
  const status = ($('#import-status')?.value || 'unsolved').trim() || 'unsolved';
  const content = ($('#import-content')?.value || '').trim();
  const input_format = ($('#import-input-format')?.value || '').trim();
  const output_format = ($('#import-output-format')?.value || '').trim();
  const constraints = ($('#import-constraints')?.value || '').trim();
  const my_ac_code = ($('#import-ac-code')?.value || '').trim();
  const rawTags = ($('#import-tags')?.value || '').trim();

  if (!id || !title) {
    toast(t('msg_input_empty'));
    return;
  }

  const tags = rawTags
    ? rawTags.split(/[，,\s]+/).map(tag => tag.trim()).filter(Boolean)
    : [];

  const problems = [{
    source,
    id,
    title,
    status,
    content,
    input_format,
    output_format,
    constraints,
    my_ac_code,
    tags
  }];

  try {
    const resp = await api('/api/problems/import', {
      method: 'POST',
      body: JSON.stringify({ problems })
    });
    toast(`${t('msg_imported')}: ${resp.imported}, ${t('msg_updated')}: ${resp.updated}`);
    $('#import-id').value = '';
    $('#import-title').value = '';
    $('#import-content').value = '';
    $('#import-input-format').value = '';
    $('#import-output-format').value = '';
    $('#import-constraints').value = '';
    $('#import-ac-code').value = '';
    $('#import-tags').value = '';
    $('#import-status').value = 'unsolved';
    await loadOverview();
    await loadProblems();
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function generateAllPending() {
  try {
    const resp = await api('/api/solutions/tasks', {
      method: 'POST',
      body: JSON.stringify({ problem_keys: [] })
    });
    toast(`${resp.task_ids.length} ${t('msg_tasks_created')}`);
    startPolling();
    await loadOverview();
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

function parseProblemKey(raw) {
  const key = (raw || '').trim();
  const idx = key.indexOf(':');
  if (idx <= 0 || idx === key.length - 1) return null;
  return { source: key.slice(0, idx), id: key.slice(idx + 1) };
}

async function saveMetadata() {
  const parsed = parseProblemKey($('#ac-problem-key').value);
  if (!parsed) {
    toast(t('msg_invalid_key'));
    return;
  }

  const source = encodeURIComponent(parsed.source);
  const id = encodeURIComponent(parsed.id);
  const base = `/api/problems/${source}/${id}`;

  const promises = [];

  // 1. Difficulty
  const difficultyStr = $('#meta-difficulty').value.trim();
  const difficulty = difficultyStr ? Number(difficultyStr) : null;
  promises.push(api(`${base}/difficulty`, {
    method: 'PUT',
    body: JSON.stringify({ difficulty })
  }));

  // 2. Status
  const statusEl = $('#meta-status');
  if (statusEl && statusEl.value) {
    promises.push(api(`${base}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: statusEl.value })
    }));
  }

  // 3. Reflection
  const reflection = $('#meta-reflection').value;
  if (reflection !== undefined) {
    promises.push(api(`${base}/reflection`, {
      method: 'PUT',
      body: JSON.stringify({ reflection })
    }));
  }

  // 4. AC Code (only if provided)
  const code = $('#ac-code').value;
  if (code && code.trim()) {
    const payload = {
      code,
      language: $('#ac-language').value.trim(),
      mark_solved: statusEl.value === 'solved'
    };
    promises.push(api(`${base}/ac-code`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }));
  }

  try {
    await Promise.all(promises);
    toast(t('msg_meta_saved'));
    await loadOverview();
    // Use timeout to allow backend async updates if any, then reload problems
    setTimeout(() => loadProblems(), 200);
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

// Stats & Charts
async function loadStatsCharts() {
  const heatmapContainer = $('#chart-activity-heatmap');
  const weeklyContainer = $('#chart-weekly-bar');

  if (!heatmapContainer) return; // Not on view

  heatmapContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Loading...</div>`;

  try {
    const data = await api('/api/stats/charts');
    // data: { daily: [], weekly: [], monthly: ... }
    renderActivityHeatmap(data.daily || []);
    renderWeeklyBarChart(data.weekly || []);
    summarizeWeeklyData(data.weekly || []);
  } catch (err) {
    heatmapContainer.innerText = 'Err: ' + err.message;
  }
}

function renderActivityHeatmap(dailyData) {
  const container = $('#chart-activity-heatmap');
  // Simple SVG Heatmap (Last 26 weeks)

  // Convert data to map: "YYYY-MM-DD" -> count
  const map = {};
  dailyData.forEach(d => {
    map[d.period_start] = d.solved_count;
  });

  const boxSize = 12;
  const gap = 3;
  const weeks = 26; // Half a year roughly
  const days = 7;
  const width = weeks * (boxSize + gap);
  const height = days * (boxSize + gap);

  // Calculate start date (26 weeks ago Sunday)
  const end = new Date(); // Today
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7));

  // Align start to previous Sunday to keep grid clean? 
  // Or just simple loop. Let's do simple loop from start.
  const current = new Date(start);

  let svgContent = '';

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = current.toISOString().slice(0, 10);
      const count = map[iso] || 0;
      const x = w * (boxSize + gap);
      const y = d * (boxSize + gap);

      // Color scale
      let fill = 'var(--bg-input)';
      if (count > 0) fill = 'rgba(34, 197, 94, 0.4)';
      if (count > 2) fill = 'rgba(34, 197, 94, 0.6)';
      if (count > 5) fill = 'rgba(34, 197, 94, 0.8)';
      if (count > 10) fill = 'rgba(34, 197, 94, 1.0)';

      svgContent += `<rect x="${x}" y="${y}" width="${boxSize}" height="${boxSize}" rx="2" fill="${fill}" class="heatmap-cell">
                <title>${iso}: ${count} solved</title>
            </rect>`;

      current.setDate(current.getDate() + 1);
    }
  }

  container.innerHTML = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${svgContent}</svg>`;
}

function renderWeeklyBarChart(weeklyData) {
  const container = $('#chart-weekly-bar');
  // Take last 12 weeks
  const data = weeklyData.slice(-12);
  if (data.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-muted)">No data</div>`;
    return;
  }

  const maxVal = Math.max(...data.map(d => d.solved_count), 5); // at least 5 y-scale
  const barWidth = 20;
  const gap = 10;
  const height = 150;
  const width = data.length * (barWidth + gap);

  let svg = '';

  data.forEach((d, i) => {
    const h = (d.solved_count / maxVal) * (height - 20);
    const x = i * (barWidth + gap);
    const y = height - h - 20; // 20px padding bottom for labels

    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="var(--accent-primary)" class="chart-bar">
           <title>${d.period_start}: ${d.solved_count}</title>
        </rect>`;
    // Label
    if (i % 2 === 0) { // Show every other label
      // d.period_start is YYYY-MM-DD, show MM-DD
      const label = d.period_start.slice(5);
      svg += `<text x="${x}" y="${height - 5}" font-size="10" fill="var(--text-secondary)">${label}</text>`;
    }
  });

  container.innerHTML = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}

function summarizeWeeklyData(weeklyData) {
  const summaryEl = $('#weekly-visual-summary');
  if (!summaryEl) return;

  const data = (weeklyData || []).slice(-12);
  if (!data.length) {
    summaryEl.textContent = t('msg_no_weekly_data');
    return;
  }

  const totals = data.reduce(
    (acc, point) => {
      acc.solved += Number(point.solved_count || 0);
      acc.attempted += Number(point.attempted_count || 0);
      acc.unsolved += Number(point.unsolved_count || 0);
      return acc;
    },
    { solved: 0, attempted: 0, unsolved: 0 }
  );
  const activeWeeks = data.filter((point) => Number(point.total_count || 0) > 0).length;
  const best = data.reduce((bestPoint, point) => {
    if (!bestPoint) return point;
    return Number(point.solved_count || 0) > Number(bestPoint.solved_count || 0) ? point : bestPoint;
  }, null);

  const bestLabel = best
    ? `${best.period_start} (${best.solved_count})`
    : '-';

  summaryEl.textContent = `${t('weekly_summary_total')}: ${totals.solved} | ${t('weekly_summary_active_weeks')}: ${activeWeeks}/${data.length} | ${t('weekly_summary_best_week')}: ${bestLabel} | ${t('weekly_summary_attempted')}: ${totals.attempted} | ${t('weekly_summary_unsolved')}: ${totals.unsolved}`;
}

// Reports V2
async function handleReportAction(type, period) {
  // type: weekly
  // period: 2026-W06
  if (!period) {
    toast(t('msg_select_week'));
    return;
  }

  if (type !== 'weekly') {
    toast(`${t('msg_error')}: unsupported report type`);
    return;
  }

  toast(`${t('msg_generating')} ${period}...`);
  try {
    await api(`/api/reports/${type}/${period}/generate`, { method: 'POST' });
    toast(t('msg_report_generated'));
    pollReportStatus(type, period);
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function pollReportStatus(type, period) {
  for (let i = 0; i < 20; i++) {
    const data = await checkReportStatus(type, period);
    if (!data) return;
    if (data.status === 'ready' || data.status === 'failed') return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function checkReportStatus(type, period) {
  const el = $(`#status-${type}`); // status-weekly
  if (!el) return;

  el.textContent = 'Checking status...';
  try {
    const data = await api(`/api/reports/${type}/${period}/status`);
    // data.status: none | generating | ready | failed
    let color = 'var(--text-muted)';
    if (data.status === 'ready') color = 'var(--accent-success)';
    if (data.status === 'failed') color = 'var(--accent-danger)';
    if (data.status === 'generating') color = 'var(--accent-warning)';

    el.innerHTML = `<span style="color:${color}; font-weight:bold">${data.status.toUpperCase()}</span>`;
    return data;
  } catch (err) {
    el.textContent = 'Error checking status';
    return null;
  }
}

async function viewWeeklyReport() {
  const week = $('#week-picker')?.value || '';
  if (!week) {
    toast(t('msg_select_week'));
    return;
  }

  const preview = $('#weekly-report-preview');
  if (!preview) return;
  preview.classList.remove('hidden');
  preview.textContent = t('msg_loading');

  try {
    const data = await api(`/api/reports/weekly/${encodeURIComponent(week)}`);
    preview.textContent = data.content || t('msg_no_content');
    await checkReportStatus('weekly', week);
  } catch (err) {
    preview.textContent = '';
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function viewProblemMarkdown() {
  const parsed = parseProblemKey($('#ac-problem-key').value);
  if (!parsed) {
    toast(t('msg_invalid_key'));
    return;
  }

  const preview = $('#problem-md-preview');
  preview.classList.remove('hidden');
  preview.textContent = t('msg_loading');

  try {
    const data = await api(`/api/problems/${encodeURIComponent(parsed.source)}/${encodeURIComponent(parsed.id)}/markdown`);
    preview.textContent = data.content || t('msg_no_content');
  } catch (err) {
    preview.textContent = '';
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

// --- Init ---

async function init() {
  console.log('ACM Helper Dashboard Init...');
  // Apply translations on load
  applyTranslations();
  initTheme();

  const month = await getCurrentMonth();
  const monthInput = $('#month');
  if (monthInput) {
    monthInput.value = month;
    monthInput.addEventListener('change', loadOverview);
  }

  // Bind View Navigation
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = e.currentTarget.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Bind Language Toggle
  const langToggle = $('#lang-toggle');
  if (langToggle) langToggle.addEventListener('click', toggleLanguage);

  // Bind Theme Toggle
  const themeToggle = $('#theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Bind Actions
  const bind = (id, fn) => {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
  };

  // Bind Filters
  const bindChange = (id, fn) => {
    const el = $(id);
    if (el) el.addEventListener('change', fn);
    if (el) el.addEventListener('input', fn); // for text input instant search
  };

  bind('#refresh-btn', loadOverview);
  bind('#batch-generate-btn', generateAllPending);

  // Reports
  const btnGenWeekly = $('#btn-gen-weekly');
  if (btnGenWeekly) btnGenWeekly.addEventListener('click', () => handleReportAction('weekly', $('#week-picker').value));

  const btnViewWeekly = $('#btn-view-weekly');
  if (btnViewWeekly) btnViewWeekly.addEventListener('click', viewWeeklyReport);

  bind('#import-btn', importProblems);
  bind('#save-ai-btn', saveAISettings);
  bind('#test-ai-btn', testAISettings);
  bind('#save-prompts-btn', savePromptSettings);
  bind('#save-ui-settings-btn', saveUiSettings);

  // Metadata Save
  bind('#save-ac-btn', saveMetadata);
  bind('#view-problem-md-btn', viewProblemMarkdown);

  // Filters change
  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  bindChange('#filter-status', loadProblems);
  bindChange('#filter-source', loadProblems);
  bindChange('#filter-keyword', debounce(loadProblems, 500));

  await loadSettings();
  await loadOverview();
}

init().catch((err) => console.error(err));
