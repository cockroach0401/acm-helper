import { api, getCurrentMonth } from '../utils/api.js';
import { t, getLang, setLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let pollTimer = null;
let aiProfilesState = {
  activeProfileId: '',
  selectedProfileId: '',
  profiles: []
};
let aiSaveQueue = Promise.resolve(true);
let aiSaveInProgress = false;
let isSolutionTemplateVarsOpen = false;
let isWeeklyTemplateVarsOpen = false;

const ALLOWED_AC_LANGUAGES = ['c', 'cpp', 'python', 'java'];
const ALLOWED_PROMPT_STYLES = ['custom', 'rigorous', 'intuitive', 'concise'];
const TAG_CHART_COLORS = [
  '#f07f73', '#ea6e9f', '#c06ad7', '#9b7de2', '#7f8ddf',
  '#71b8dd', '#66c4de', '#64d0d3', '#66c4b9', '#84d58a',
  '#b4e27f', '#e5ea78', '#ece873', '#ecea5b', '#f0cf58',
  '#f3a067', '#f07c72'
];

const SOLUTION_TEMPLATE_VARIABLES = [
  '{{source}}',
  '{{id}}',
  '{{title}}',
  '{{status}}',
  '{{prompt_style}}',
  '{{style_prompt_injection}}',
  '{{content}}',
  '{{input_format}}',
  '{{output_format}}',
  '{{constraints}}',
  '{{reflection}}',
  '{{my_ac_code}}',
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

  renderTemplateVarsVisibility();
}

function toggleLanguage() {
  const newLang = getLang() === 'zh' ? 'en' : 'zh';
  setLang(newLang);
  applyTranslations();
  // Rerender lists to update status badges etc if they use raw text
  loadOverview().catch(() => { });
  loadProblems().catch(() => { });
  loadSettings(aiProfilesState.selectedProfileId).catch(() => { });
}

function showSetupOverlay() {
  const overlay = $('#setup-overlay');
  const pickBtn = $('#setup-pick-dir-btn');
  const defaultBtn = $('#setup-use-default-btn');
  const errorBox = $('#setup-error');

  if (!overlay || !pickBtn || !defaultBtn) {
    console.error('Setup overlay or buttons not found in DOM');
    return;
  }

  console.log('Showing setup overlay');
  overlay.classList.remove('hidden');

  // Remove old listeners to avoid duplication
  pickBtn.replaceWith(pickBtn.cloneNode(true));
  defaultBtn.replaceWith(defaultBtn.cloneNode(true));
  const newPickBtn = $('#setup-pick-dir-btn');
  const newDefaultBtn = $('#setup-use-default-btn');

  // Handle "Pick Directory" button
  newPickBtn.addEventListener('click', async () => {
    newPickBtn.disabled = true;
    if (errorBox) errorBox.classList.add('hidden');

    try {
      console.log('User clicked pick directory button');
      // 1. Ask backend to open folder picker
      const { selected, path } = await api('/api/settings/storage/pick-directory', { method: 'POST' });

      if (!selected || !path) {
        console.log('User cancelled directory picker');
        newPickBtn.disabled = false;
        return;
      }

      console.log(`User selected directory: ${path}`);

      // 2. Set the directory
      await api('/api/settings/ui', {
        method: 'PUT',
        body: JSON.stringify({ storage_base_dir: path })
      });

      console.log('Directory saved, reloading page');
      // 3. Success -> Reload to initialize everything properly
      window.location.reload();

    } catch (err) {
      console.error('Error during setup:', err);
      if (errorBox) {
        errorBox.textContent = extractApiErrorMessage(err) || t('msg_error_unknown');
        errorBox.classList.remove('hidden');
      }
      newPickBtn.disabled = false;
    }
  });

  // Handle "Use Default Directory" button
  newDefaultBtn.addEventListener('click', async () => {
    newDefaultBtn.disabled = true;
    if (errorBox) errorBox.classList.add('hidden');

    try {
      console.log('User clicked use default directory button');

      // Get the default directory from backend status
      const status = await api('/api/settings/status');
      const defaultPath = status.storage_base_dir;

      if (!defaultPath) {
        throw new Error('Failed to get default directory path');
      }

      console.log(`Using default directory: ${defaultPath}`);

      // Set the default directory
      await api('/api/settings/ui', {
        method: 'PUT',
        body: JSON.stringify({ storage_base_dir: defaultPath })
      });

      console.log('Default directory saved, reloading page');
      window.location.reload();

    } catch (err) {
      console.error('Error using default directory:', err);
      if (errorBox) {
        errorBox.textContent = extractApiErrorMessage(err) || t('msg_error_unknown');
        errorBox.classList.remove('hidden');
      }
      newDefaultBtn.disabled = false;
    }
  });
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

function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.dataset.type = type;
  el.style.display = 'block';
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'slideIn 0.3s ease';

  setTimeout(() => {
    el.style.display = 'none';
  }, 2400);
}

function extractApiErrorMessage(err) {
  const raw = String(err?.message || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
  } catch {
    // Keep raw message as fallback.
  }
  return raw;
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

function renderTasks(items, overviewAi = null) {
  const tbody = $('#task-table tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1rem;">${t('no_tasks')}</td></tr>`;
    return;
  }

  const activeProviderName = String(overviewAi?.provider_name || '').trim();

  tbody.innerHTML = items
    .map((task) => {
      let statusClass = 'status-warning';
      if (task.status === 'done' || task.status === 'succeeded') statusClass = 'status-completed';
      if (task.status === 'failed') statusClass = 'status-failed';

      const taskType = String(task.task_type || 'solution');
      const targetLabel = (taskType === 'solution' || taskType === 'ai_tag')
        ? (String(task.problem_key || '-').split(':').slice(1).join(':') || '-')
        : (task.report_target || '-');
      const providerName = String(task.provider_name || '').trim() || activeProviderName || '-';

      let msgPrefix = '';
      if (taskType === 'weekly_report') msgPrefix = `[${t('task_type_weekly_report')}] `;
      if (taskType === 'phased_report') msgPrefix = `[${t('task_type_phased_report')}] `;
      if (taskType === 'ai_tag') msgPrefix = `[${t('task_type_ai_tag')}] `;

      return `
      <tr>
        <td><span style="font-family:var(--font-mono); font-size:0.8rem;">${targetLabel}</span></td>
        <td>${providerName}</td>
        <td><span class="status-badge ${statusClass}">${task.status}</span></td>
        <td style="word-break: break-word; min-width: 200px;">
            ${msgPrefix}${task.error_message || task.output_path || '-'}
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
    const tags = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];

    const transBadge = isTranslated
      ? `<span class="status-badge status-completed">${t('translated_done')}</span>`
      : '';

    const solutionStatus = p.solution_status || 'none';
    const solutionStatusClass = {
      done: 'completed',
      running: 'warning',
      queued: 'pending',
      failed: 'failed',
      none: 'pending'
    }[solutionStatus] || 'pending';
    const solutionStatusText = t(`solution_status_${solutionStatus}`) || solutionStatus;
    const solutionBadge = `<span class="status-badge status-${solutionStatusClass}">${solutionStatusText}</span>`;

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

    // AI Auto Tag + Difficulty
    const hasSolution = p.solution_status === 'done';
    actions.push(`<button class="btn btn-sm btn-secondary action-auto-tag" data-s="${p.source}" data-i="${p.id}" data-has-sol="${hasSolution ? '1' : '0'}">${t('btn_auto_tag')}</button>`);

    // Delete
    actions.push(`<button class="btn btn-sm btn-danger action-del" data-s="${p.source}" data-i="${p.id}">${t('btn_delete')}</button>`);

    const diffBadge = p.difficulty ? `<span style="font-size:0.7rem; background:var(--bg-input); padding:2px 4px; border-radius:4px; margin-left:4px;">${p.difficulty}</span>` : '';

    const safeTitle = escapeHtml(p.title || '');
    const safeUrl = escapeHtml(p.url || '');
    const titleHtml = safeUrl
      ? `<a class="problem-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle || '-'}</a>`
      : (safeTitle || '-');

    const tagsHtml = tags.length
      ? `<div class="problem-tags">${tags.map(tag => `<span class="problem-tag-chip" title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}</div>`
      : `<div class="problem-tags problem-tags-empty">-</div>`;

    return `
      <tr class="problem-row">
         <td>
            <div style="font-weight:600; color:var(--text-primary); display:flex; align-items:center;">
                ${titleHtml} ${diffBadge}
            </div>
            <div class="problem-subline">${escapeHtml(p.source)}:${escapeHtml(String(p.id || ''))}</div>
            ${tagsHtml}
         </td>
         <td>${solutionBadge}</td>
         <td><span class="status-badge status-${p.status === 'solved' ? 'completed' : (p.status === 'attempted' ? 'warning' : 'pending')}">${t('status_' + p.status) || p.status}</span></td>
         <td>${transBadge}</td>
         <td class="problem-actions-cell">
            <div class="problem-actions">${actions.join('')}</div>
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
  tbody.querySelectorAll('.action-auto-tag').forEach(btn => {
    btn.addEventListener('click', () => autoTagProblem(btn.dataset.s, btn.dataset.i, btn.dataset.hasSol === '1'));
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
    const tagsValue = Array.isArray(details.tags) ? details.tags.join(', ') : '';

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
                <label style="font-size:0.8rem">${t('label_import_tags')}</label>
                <input id="edit-tags-${safeKey}" type="text" class="form-input-sm" value="${escapeHtml(tagsValue)}" placeholder="${t('placeholder_import_tags')}">
            </div>
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <label style="font-size:0.8rem">${t('label_solution_images')}</label>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${t('hint_solution_images')}</span>
                </div>
                <div class="solution-images-container" id="images-container-${safeKey}">
                    <!-- Images will be rendered here -->
                    <div class="loading-placeholder" style="font-size:0.8rem;">Loading images...</div>
                </div>
                <div class="image-upload-area" id="upload-area-${safeKey}">
                    <div class="upload-placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); margin-bottom:0.5rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <div style="font-size:0.8rem; color:var(--text-muted); text-align:center;">${t('drag_drop_images')}</div>
                        <button class="btn btn-sm btn-secondary" style="margin-top:0.5rem;" id="btn-select-images-${safeKey}">${t('btn_upload_image')}</button>
                        <input type="file" id="file-input-${safeKey}" multiple accept="image/png, image/jpeg, image/gif, image/webp" style="display:none;">
                    </div>
                </div>
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

    // Initialize Image Upload Logic
    initImageUpload(source, id, safeKey);

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
  const tagsRaw = ($(`#edit-tags-${safeKey}`)?.value || '').trim();
  const tags = [...new Set(tagsRaw
    .split(/[\n,，]/)
    .map(v => v.trim())
    .filter(Boolean))];

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

  // Tags
  promises.push(api(base, {
    method: 'PUT',
    body: JSON.stringify({ tags })
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

async function autoTagProblem(source, id, hasSolution) {
  if (!hasSolution) {
    const ok = confirm(t('msg_confirm_auto_tag_without_solution'));
    if (!ok) return;
  }

  try {
    toast(t('msg_auto_tag_task_creating'));
    const resp = await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}/auto-tag/task`, {
      method: 'POST'
    });

    const taskId = Array.isArray(resp?.task_ids) ? String(resp.task_ids[0] || '') : '';
    if (taskId) {
      toast(`${t('msg_auto_tag_task_queued')} #${taskId.slice(0, 8)}`);
    } else {
      toast(t('msg_auto_tag_task_queued'));
    }

    startPolling();
    await loadOverview();
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    toast(`${t('msg_error')}: ${detail || err.message}`);
  }
}

// --- Image Upload Logic ---

async function initImageUpload(source, id, safeKey) {
  const container = $(`#images-container-${safeKey}`);
  const uploadArea = $(`#upload-area-${safeKey}`);
  const fileInput = $(`#file-input-${safeKey}`);
  const selectBtn = $(`#btn-select-images-${safeKey}`);

  // Load existing images
  await loadImages(source, id, container);

  // File Select
  selectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files, source, id, container));

  // Drag & Drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files, source, id, container);
    }
  });

  // Paste from clipboard
  // Make focusable to catch paste events
  uploadArea.setAttribute('tabindex', '0');
  uploadArea.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        files.push(items[i].getAsFile());
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files, source, id, container);
    }
  });
}

async function loadImages(source, id, container) {
  try {
    const images = await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}/solution-images`);
    renderImages(images, source, id, container);
  } catch (err) {
    container.innerHTML = `<div style="color:var(--accent-danger)">Load failed: ${err.message}</div>`;
  }
}

function renderImages(images, source, id, container) {
  if (!images || images.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Get API base for static URL construction
  // In extensions, we usually store this or default to localhost:8000
  // Since we are inside the dashboard which loads api.js, let's just peek at local storage directly or assume standard behavior.
  // The backend returns a relative path like 'backend/data/...'.
  // Our static mount point is /static/solution-images/
  // But wait, the FileManager implementation of 'relative_path' is relative to workspace root?
  // Let's check backend implementation: relative_path = file_path.relative_to(self.base).as_posix()
  // And base is usually backend/data (or whatever UI settings say).
  // The static route: @app.get("/static/solution-images/{relative_path:path}")
  // So if we pass the same relative path, it should resolve.
  // We need the API base URL.

  chrome.storage.local.get('acm_helper_api_base', (res) => {
      const apiBase = res.acm_helper_api_base || 'http://localhost:8000';
      
      container.innerHTML = images.map(img => {
          const src = `${apiBase}/static/solution-images/${img.relative_path}`;
          return `
            <div class="solution-image-item" title="${img.filename}">
                <div class="img-wrapper">
                    <img src="${src}" alt="${img.filename}">
                </div>
                <button class="btn-delete-image" data-id="${img.id}">&times;</button>
            </div>
          `;
      }).join('');

      // Bind delete events
      container.querySelectorAll('.btn-delete-image').forEach(btn => {
          btn.addEventListener('click', () => deleteImage(source, id, btn.dataset.id, container));
      });
  });
}

async function handleFiles(files, source, id, container) {
  if (!files || files.length === 0) return;

  toast(t('msg_uploading_image'));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}/solution-images`, {
        method: 'POST',
        body: formData
      });
      toast(t('msg_image_uploaded'));
    } catch (err) {
      toast(`${t('msg_image_upload_failed')}: ${err.message}`);
    }
  }

  // Reload
  await loadImages(source, id, container);
}

async function deleteImage(source, id, imageId, container) {
  if (!confirm(t('msg_confirm_delete') || 'Delete?')) return;
  try {
      await api(`/api/problems/${encodeURIComponent(source)}/${encodeURIComponent(id)}/solution-images/${imageId}`, {
          method: 'DELETE'
      });
      toast(t('msg_image_deleted'));
      await loadImages(source, id, container);
  } catch (err) {
      toast(`${t('msg_image_delete_failed')}: ${err.message}`);
  }
}

// --- Settings Rendering ---

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAiProfile(raw, fallbackId, fallbackName) {
  const id = String(raw?.id || fallbackId || '').trim() || fallbackId;
  const name = String(raw?.name || fallbackName || '').trim() || fallbackName;
  const provider = raw?.provider === 'anthropic' ? 'anthropic' : 'openai_compatible';
  const api_base = String(raw?.api_base || '').trim();
  const api_key = String(raw?.api_key || '').trim();
  const modelOptionsRaw = Array.isArray(raw?.model_options) ? raw.model_options : [];
  const model_options = [...new Set(modelOptionsRaw.map(v => String(v).trim()).filter(Boolean))];
  const model = String(raw?.model || model_options[0] || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  if (!model_options.length) model_options.push(model);
  if (!model_options.includes(model)) model_options.push(model);
  const temperatureValue = Number(raw?.temperature);
  const timeoutValue = Number(raw?.timeout_seconds);

  return {
    id,
    name,
    provider,
    api_base,
    api_key,
    model,
    model_options,
    temperature: Number.isFinite(temperatureValue) ? temperatureValue : 0.2,
    timeout_seconds: Number.isFinite(timeoutValue) ? timeoutValue : 600
  };
}

function normalizeAiSettings(ai) {
  let profiles = [];
  if (Array.isArray(ai?.profiles) && ai.profiles.length) {
    profiles = ai.profiles.map((raw, idx) => normalizeAiProfile(raw, `profile-${idx + 1}`, `Provider ${idx + 1}`));
  } else {
    profiles = [normalizeAiProfile(ai || {}, 'default-1', 'Default')];
  }

  const usedIds = new Set();
  profiles = profiles.map((profile, idx) => {
    let nextId = profile.id || `profile-${idx + 1}`;
    if (!nextId) nextId = `profile-${idx + 1}`;
    let candidate = nextId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${nextId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return { ...profile, id: candidate };
  });

  let activeProfileId = String(ai?.active_profile_id || '').trim();
  if (!profiles.some(profile => profile.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
  }

  return { activeProfileId, profiles };
}

function applyAiSettingsState(ai, preferredProfileId = '') {
  const normalized = normalizeAiSettings(ai || {});
  aiProfilesState.activeProfileId = normalized.activeProfileId;
  aiProfilesState.profiles = normalized.profiles;

  let selectedProfileId = preferredProfileId || aiProfilesState.selectedProfileId || normalized.activeProfileId;
  if (!aiProfilesState.profiles.some(profile => profile.id === selectedProfileId)) {
    selectedProfileId = normalized.activeProfileId || aiProfilesState.profiles[0]?.id || '';
  }
  aiProfilesState.selectedProfileId = selectedProfileId;
  return selectedProfileId;
}

function getAiProfileById(profileId) {
  return aiProfilesState.profiles.find(profile => profile.id === profileId) || null;
}

function renderModelOptions(options, selectedModel) {
  const datalist = $('#ai-model-datalist');
  if (datalist) datalist.innerHTML = options.map(m => `<option value="${escapeHtml(m)}">`).join('');

  const modelListEl = $('#ai-model-list');
  if (!modelListEl) return;

  modelListEl.innerHTML = options.map(model => `
      <div class="model-tag">
        <span>${escapeHtml(model)}</span>
        <button type="button" class="delete-model-btn" data-model="${escapeHtml(model)}" aria-label="delete-model">x</button>
      </div>
    `).join('');

  modelListEl.querySelectorAll('.delete-model-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const model = btn.dataset.model || '';
      const currentOptions = ($('#ai-model-options').value || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      let nextOptions = currentOptions.filter(item => item !== model);
      const modelInput = $('#ai-model');
      const currentModel = (modelInput?.value || '').trim();
      if (!nextOptions.length) {
        nextOptions = [currentModel || 'gpt-4o-mini'];
      }
      if (modelInput && currentModel === model) {
        modelInput.value = nextOptions[0];
      }
      $('#ai-model-options').value = nextOptions.join('\n');
      renderModelOptions(nextOptions, modelInput?.value?.trim() || nextOptions[0]);
    });
  });
}

function readAiProfileForm() {
  const modelInput = $('#ai-model');
  const currentOptionsStr = $('#ai-model-options').value || '';
  const modelOptions = [...new Set(
    currentOptionsStr
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  )];

  const selectedModel = (modelInput?.value || '').trim();
  const model = selectedModel || modelOptions[0] || 'gpt-4o-mini';
  if (!modelOptions.length) modelOptions.push(model);
  if (!modelOptions.includes(model)) modelOptions.push(model);

  const temperature = Number($('#ai-temperature').value);
  const timeout = Number($('#ai-timeout').value);

  return {
    name: ($('#ai-provider-name').value || '').trim(),
    provider: $('#ai-provider').value || 'openai_compatible',
    api_base: ($('#ai-api-base').value || '').trim(),
    api_key: ($('#ai-api-key').value || '').trim(),
    model,
    model_options: modelOptions,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    timeout_seconds: Number.isFinite(timeout) ? timeout : 600
  };
}

function normalizeAiPayloadForCompare(payload) {
  const options = [...new Set((payload.model_options || []).map(v => String(v).trim()).filter(Boolean))];
  const model = String(payload.model || options[0] || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  if (!options.length) options.push(model);
  if (!options.includes(model)) options.push(model);
  return {
    name: String(payload.name || '').trim(),
    provider: payload.provider === 'anthropic' ? 'anthropic' : 'openai_compatible',
    api_base: String(payload.api_base || '').trim(),
    api_key: String(payload.api_key || '').trim(),
    model,
    model_options: options,
    temperature: Number(payload.temperature ?? 0.2),
    timeout_seconds: Number(payload.timeout_seconds ?? 600)
  };
}

function isAiProfileDirty(profileId = aiProfilesState.selectedProfileId) {
  const profile = getAiProfileById(profileId);
  if (!profile) return false;
  const currentForm = normalizeAiPayloadForCompare(readAiProfileForm());
  const baseline = normalizeAiPayloadForCompare(profile);
  return JSON.stringify(currentForm) !== JSON.stringify(baseline);
}

function fillAiProfileForm(profile) {
  if (!profile) return;
  $('#ai-provider-name').value = profile.name || '';

  const providerSelect = $('#ai-provider');
  const provider = profile.provider || 'openai_compatible';
  const exists = Array.from(providerSelect.options).some(opt => opt.value === provider);
  providerSelect.value = exists ? provider : 'openai_compatible';

  $('#ai-api-base').value = profile.api_base || '';
  $('#ai-api-key').value = profile.api_key || '';
  $('#ai-model').value = profile.model || profile.model_options[0] || 'gpt-4o-mini';
  $('#ai-model-options').value = (profile.model_options || []).join('\n');
  $('#ai-temperature').value = profile.temperature ?? 0.2;
  $('#ai-timeout').value = profile.timeout_seconds ?? 600;
  renderModelOptions(profile.model_options || [profile.model || 'gpt-4o-mini'], profile.model);
}

async function selectAiProfile(profileId) {
  if (!profileId || profileId === aiProfilesState.selectedProfileId) return;
  if (isAiProfileDirty(aiProfilesState.selectedProfileId)) {
    if (!confirm(t('msg_unsaved_ai_changes') || 'You have unsaved AI settings changes. Discard?')) return;
  }
  aiProfilesState.selectedProfileId = profileId;
  fillAiProfileForm(getAiProfileById(profileId));
  renderAiProfileCards();
}

function renderAiProfileCards() {
  const container = $('#ai-profile-list');
  if (!container) return;

  container.innerHTML = aiProfilesState.profiles.map(profile => {
    const isActive = profile.id === aiProfilesState.activeProfileId;
    const isSelected = profile.id === aiProfilesState.selectedProfileId;
    const activePart = isActive
      ? `<span class="ai-active-badge">${t('label_active_provider')}</span>`
      : `<button type="button" class="btn btn-sm btn-secondary ai-activate-btn" data-profile-id="${escapeHtml(profile.id)}">${t('btn_activate_provider')}</button>`;
    const disabledDelete = aiProfilesState.profiles.length <= 1 ? 'disabled' : '';

    return `
      <div class="ai-profile-card${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}" data-profile-id="${escapeHtml(profile.id)}">
        <div class="ai-profile-main">
          <div class="ai-profile-name">${escapeHtml(profile.name)}</div>
          <div class="ai-profile-meta">${escapeHtml(profile.provider)} · ${escapeHtml(profile.model)}</div>
        </div>
        <div class="ai-profile-actions">
          ${activePart}
          <button type="button" class="btn btn-sm btn-secondary ai-edit-btn" data-profile-id="${escapeHtml(profile.id)}">${t('btn_edit_provider')}</button>
          <button type="button" class="btn btn-sm btn-danger ai-delete-btn" data-profile-id="${escapeHtml(profile.id)}" ${disabledDelete}>${t('btn_delete_provider')}</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.ai-profile-card').forEach(card => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      selectAiProfile(card.dataset.profileId || '');
    });
  });

  container.querySelectorAll('.ai-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => selectAiProfile(btn.dataset.profileId || ''));
  });

  container.querySelectorAll('.ai-activate-btn').forEach(btn => {
    btn.addEventListener('click', () => activateAiProfile(btn.dataset.profileId || ''));
  });

  container.querySelectorAll('.ai-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAiProfile(btn.dataset.profileId || ''));
  });
}

function renderAiSettings(ai, preferredProfileId = '') {
  const selectedProfileId = applyAiSettingsState(ai, preferredProfileId);
  fillAiProfileForm(getAiProfileById(selectedProfileId));
  renderAiProfileCards();
}

function renderSettings(settings, preferredProfileId = '') {
  const ai = settings.ai || {};
  const prompts = settings.prompts || {};
  const ui = settings.ui || {};

  renderAiSettings(ai, preferredProfileId);

  $('#solution-template').value = prompts.solution_template || '';
  $('#weekly-template').value = prompts.insight_template || '';

  const solutionVarsEl = $('#solution-template-variables');
  if (solutionVarsEl) solutionVarsEl.textContent = SOLUTION_TEMPLATE_VARIABLES.join('\n');

  const weeklyVarsEl = $('#weekly-template-variables');
  if (weeklyVarsEl) weeklyVarsEl.textContent = WEEKLY_TEMPLATE_VARIABLES.join('\n');

  renderTemplateVarsVisibility();

  const weeklyStyleEl = $('#weekly-prompt-style');
  if (weeklyStyleEl) {
    const style = prompts.weekly_prompt_style || 'rigorous';
    weeklyStyleEl.value = ALLOWED_PROMPT_STYLES.includes(style) ? style : 'rigorous';

    weeklyStyleEl.removeEventListener('change', updateStyleInjectionVisibility);
    weeklyStyleEl.addEventListener('change', updateStyleInjectionVisibility);
    updateStyleInjectionVisibility();
  }

  const styleInjectionCustomEl = $('#style-injection-custom');
  if (styleInjectionCustomEl) styleInjectionCustomEl.value = prompts.weekly_style_custom_injection || '';

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

  const storageBaseDir = (ui.storage_base_dir || '').trim();
  const storageBaseDirEl = $('#storage-base-dir');
  if (storageBaseDirEl) {
    storageBaseDirEl.value = storageBaseDir;
    storageBaseDirEl.dataset.currentPath = storageBaseDir;
  }

  const obsidianModeEl = $('#obsidian-mode-enabled');
  if (obsidianModeEl) {
    obsidianModeEl.checked = !!ui.obsidian_mode_enabled;
  }
}

function renderTemplateVarsVisibility() {
  const solutionPanel = $('#solution-template-vars-panel');
  if (solutionPanel) {
    solutionPanel.classList.toggle('hidden', !isSolutionTemplateVarsOpen);
  }

  const weeklyPanel = $('#weekly-template-vars-panel');
  if (weeklyPanel) {
    weeklyPanel.classList.toggle('hidden', !isWeeklyTemplateVarsOpen);
  }

  const solutionBtn = $('#toggle-solution-template-vars-btn');
  if (solutionBtn) {
    solutionBtn.textContent = isSolutionTemplateVarsOpen ? t('btn_hide_template_vars') : t('btn_show_template_vars');
  }

  const weeklyBtn = $('#toggle-weekly-template-vars-btn');
  if (weeklyBtn) {
    weeklyBtn.textContent = isWeeklyTemplateVarsOpen ? t('btn_hide_template_vars') : t('btn_show_template_vars');
  }
}

function toggleSolutionTemplateVars() {
  isSolutionTemplateVarsOpen = !isSolutionTemplateVarsOpen;
  renderTemplateVarsVisibility();
}

function toggleWeeklyTemplateVars() {
  isWeeklyTemplateVarsOpen = !isWeeklyTemplateVarsOpen;
  renderTemplateVarsVisibility();
}

function updateStyleInjectionVisibility() {
  const style = $('#weekly-prompt-style').value;
  const ids = ['custom', 'rigorous', 'intuitive', 'concise'];

  ids.forEach(id => {
    const el = $(`#style-injection-${id}`);
    if (el) {
      el.classList.toggle('hidden', id !== style);
    }
  });
}

// --- API Actions ---

async function loadSettings(preferredProfileId = '') {
  const settings = await api('/api/settings');
  renderSettings(settings, preferredProfileId);
}

function saveAISettings(options = {}) {
  aiSaveQueue = aiSaveQueue
    .catch(() => true)
    .then(() => saveAISettingsNow(options));
  return aiSaveQueue;
}

async function saveAISettingsNow({ silent = false, refresh = true, onlyIfDirty = false, suppressValidationToast = false } = {}) {
  if (aiSaveInProgress) {
    return onlyIfDirty ? true : false;
  }
  aiSaveInProgress = true;

  try {
    let profileId = aiProfilesState.selectedProfileId;
    let profile = getAiProfileById(profileId);
    if (!profile && aiProfilesState.profiles.length > 0) {
      profile = aiProfilesState.profiles[0];
      profileId = profile.id;
      aiProfilesState.selectedProfileId = profileId;
    }
    if (!profile || !profileId) return false;

    const payload = readAiProfileForm();
    if (!payload.name) {
      if (!suppressValidationToast) toast(t('msg_provider_name_empty'));
      return false;
    }

    if (onlyIfDirty) {
      const baseline = normalizeAiPayloadForCompare(profile);
      const current = normalizeAiPayloadForCompare(payload);
      if (JSON.stringify(current) === JSON.stringify(baseline)) {
        return true;
      }
    }

    const applySavedSettings = (settings, preferredProfileId) => {
      if (settings?.ai) {
        const selectedProfileId = applyAiSettingsState(settings.ai, preferredProfileId);
        if (refresh) fillAiProfileForm(getAiProfileById(selectedProfileId));
        renderAiProfileCards();
        return;
      }

      const index = aiProfilesState.profiles.findIndex(item => item.id === preferredProfileId);
      if (index >= 0) {
        aiProfilesState.profiles[index] = normalizeAiProfile(
          { ...aiProfilesState.profiles[index], ...payload, id: preferredProfileId },
          preferredProfileId,
          payload.name || aiProfilesState.profiles[index].name || `Provider ${index + 1}`
        );
        if (refresh) fillAiProfileForm(getAiProfileById(preferredProfileId));
        renderAiProfileCards();
      }
    };

    try {
      const settings = await api(`/api/settings/ai/profiles/${encodeURIComponent(profileId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      applySavedSettings(settings, profileId);
      if (!silent) toast(t('msg_ai_saved'));
      if (refresh) await loadOverview();
      return true;
    } catch (err) {
      const detail = extractApiErrorMessage(err).toLowerCase();
      const isProfileNotFound = detail.includes('not found') || detail.includes('profile not found');

      if (!isProfileNotFound) {
        toast(`${t('msg_error')}: ${extractApiErrorMessage(err) || err.message}`);
        return false;
      }

      try {
        const created = await api('/api/settings/ai/profiles', {
          method: 'POST',
          body: JSON.stringify({ ...payload, set_active: true })
        });

        if (created?.ai) {
          const selectedProfileId = applyAiSettingsState(created.ai, created.ai.active_profile_id || '');
          if (refresh) fillAiProfileForm(getAiProfileById(selectedProfileId));
          renderAiProfileCards();
        } else {
          await loadSettings();
        }

        if (!silent) toast(t('msg_ai_saved'));
        if (refresh) await loadOverview();
        return true;
      } catch (createErr) {
        toast(`${t('msg_error')}: ${extractApiErrorMessage(createErr) || createErr.message}`);
        return false;
      }
    }
  } finally {
    aiSaveInProgress = false;
  }
}

async function testAISettings() {
  const resEl = $('#ai-test-result');
  if (resEl) {
    resEl.classList.add('hidden');
    resEl.textContent = '';
  }
  toast(t('msg_testing'));

  // Ensure the current profile is saved before testing
  if (isAiProfileDirty()) {
    const saved = await saveAISettings({ silent: true, refresh: false });
    if (!saved) {
      toast(t('msg_error'), 'error');
      return;
    }
  }

  try {
    const profileId = aiProfilesState.selectedProfileId;
    const endpoint = profileId
      ? `/api/settings/ai/profiles/${encodeURIComponent(profileId)}/test`
      : '/api/settings/ai/test';
    const data = await api(endpoint, { method: 'POST' });
    if (data.ok) toast(t('msg_test_success'), 'success');
    else toast(t('msg_connection_failed'), 'error');
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    toast(`${t('msg_error')}: ${detail || err.message}`, 'error');
  }
}

async function addAiProvider() {
  if (isAiProfileDirty()) {
    if (!confirm(t('msg_unsaved_ai_changes') || 'You have unsaved AI settings changes. Discard?')) return;
  }

  const nextIndex = aiProfilesState.profiles.length + 1;
  const payload = {
    name: `${t('default_provider_name_prefix')} ${nextIndex}`,
    provider: 'openai_compatible',
    api_base: '',
    api_key: '',
    model: 'gpt-4o-mini',
    model_options: ['gpt-4o-mini'],
    temperature: 0.2,
    timeout_seconds: 600,
    set_active: true
  };

  try {
    const settings = await api('/api/settings/ai/profiles', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast(t('msg_provider_added'));
    if (settings?.ai) {
      renderAiSettings(settings.ai, settings.ai.active_profile_id || '');
    } else {
      await loadSettings();
    }
    await loadOverview();
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function activateAiProfile(profileId) {
  if (!profileId) return;

  if (isAiProfileDirty()) {
    if (!confirm(t('msg_unsaved_ai_changes') || 'You have unsaved AI settings changes. Discard?')) return;
  }

  try {
    const settings = await api(`/api/settings/ai/profiles/${encodeURIComponent(profileId)}/activate`, {
      method: 'POST'
    });
    toast(t('msg_provider_switched'));
    if (settings?.ai) {
      renderAiSettings(settings.ai, profileId);
    } else {
      await loadSettings(profileId);
    }
    await loadOverview();
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    if (detail.toLowerCase().includes('not found')) {
      // Profile doesn't exist on server; refresh from server to resync state
      await loadSettings();
      toast(`${t('msg_error')}: profile not found, settings refreshed`);
    } else {
      toast(`${t('msg_error')}: ${detail || err.message}`);
    }
  }
}

async function deleteAiProfile(profileId) {
  const profile = getAiProfileById(profileId);
  if (!profile) return;
  if (!confirm(`${t('msg_confirm_delete_provider')} ${profile.name}?`)) return;

  try {
    const settings = await api(`/api/settings/ai/profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE'
    });
    toast(t('msg_deleted'));
    if (settings?.ai) {
      renderAiSettings(settings.ai, settings.ai.active_profile_id || '');
    } else {
      await loadSettings();
    }
    await loadOverview();
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    if (detail.toLowerCase().includes('not found')) {
      // Profile already gone on server; just refresh
      await loadSettings();
      toast(t('msg_deleted'));
    } else {
      toast(`${t('msg_error')}: ${detail || err.message}`);
    }
  }
}

async function saveAllSettings() {
  const selectedStyle = $('#weekly-prompt-style').value;
  const promptPayload = {
    solution_template: $('#solution-template').value,
    insight_template: $('#weekly-template').value,
    weekly_prompt_style: ALLOWED_PROMPT_STYLES.includes(selectedStyle) ? selectedStyle : 'custom',
    weekly_style_custom_injection: $('#style-injection-custom').value,
    weekly_style_rigorous_injection: $('#style-injection-rigorous').value,
    weekly_style_intuitive_injection: $('#style-injection-intuitive').value,
    weekly_style_concise_injection: $('#style-injection-concise').value
  };

  const storageBaseDirEl = $('#storage-base-dir');
  const previousStoragePath = (storageBaseDirEl?.dataset.currentPath || '').trim();
  const uiPayload = {
    default_ac_language: $('#default-ac-language').value,
    storage_base_dir: (storageBaseDirEl?.value || '').trim(),
    obsidian_mode_enabled: !!$('#obsidian-mode-enabled')?.checked
  };

  try {
    // 1. Save Prompts
    await api('/api/settings/prompts', {
      method: 'PUT',
      body: JSON.stringify(promptPayload)
    });

    // 2. Save UI Settings
    const uiData = await api('/api/settings/ui', {
      method: 'PUT',
      body: JSON.stringify(uiPayload)
    });

    // Update UI state based on response
    const lang = uiData?.ui?.default_ac_language || uiPayload.default_ac_language;
    const acLangEl = $('#ac-language');
    if (acLangEl) acLangEl.value = lang;

    const savedStoragePath = (uiData?.ui?.storage_base_dir || uiPayload.storage_base_dir || '').trim();
    if (storageBaseDirEl) {
      storageBaseDirEl.value = savedStoragePath;
      storageBaseDirEl.dataset.currentPath = savedStoragePath;
    }

    if (previousStoragePath && savedStoragePath && previousStoragePath !== savedStoragePath) {
      toast(`${t('msg_templates_saved')} & ${t('msg_storage_path_saved')}`);
    } else {
      toast(`${t('msg_templates_saved')} & ${t('msg_ui_saved')}`);
    }
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    if (detail.includes('queued or running')) {
      toast(t('msg_storage_path_switch_blocked_running'));
      return;
    }
    toast(`${t('msg_error')}: ${detail || err.message}`);
  }
}

async function pickStorageDirectory() {
  try {
    const data = await api('/api/settings/storage/pick-directory', { method: 'POST' });
    if (!data?.selected) return;

    const path = String(data.path || '').trim();
    if (!path) return;
    const storageBaseDirEl = $('#storage-base-dir');
    if (storageBaseDirEl) storageBaseDirEl.value = path;
    toast(t('msg_storage_path_picked'));
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    toast(`${t('msg_error')}: ${detail || err.message}`);
  }
}

async function resetPromptTemplate(target) {
  const normalizedTarget = target === 'solution' ? 'solution' : (target === 'insight' ? 'insight' : 'both');
  try {
    const settings = await api('/api/settings/prompts/reset', {
      method: 'POST',
      body: JSON.stringify({ target: normalizedTarget })
    });

    const prompts = settings?.prompts || {};
    if (normalizedTarget === 'solution') {
      $('#solution-template').value = prompts.solution_template || '';
      toast(t('msg_solution_template_reset'));
    } else if (normalizedTarget === 'insight') {
      $('#weekly-template').value = prompts.insight_template || '';
      toast(t('msg_weekly_template_reset'));
    } else {
      $('#solution-template').value = prompts.solution_template || '';
      $('#weekly-template').value = prompts.insight_template || '';
      toast(t('msg_templates_reset'));
    }
  } catch (err) {
    const detail = extractApiErrorMessage(err);
    toast(`${t('msg_error')}: ${detail || err.message}`);
  }
}

async function loadOverview() {
  const month = monthInputValueToApiMonth($('#month').value);
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const data = await api(`/api/dashboard/overview${query}`);

  renderStats(data.stats || {});
  renderPending(data.pending || []);
  renderTasks(data.tasks || [], data.ai || null);

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
  const url = ($('#import-url')?.value || '').trim();
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
    url,
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
    $('#import-url').value = '';
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
  const tagsRingContainer = $('#chart-tags-ring');
  const tagsLegendContainer = $('#chart-tags-legend');
  const rangeSelector = $('#heatmap-mode');

  if (!heatmapContainer) return; // Not on view

  heatmapContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Loading...</div>`;
  if (weeklyContainer) {
    weeklyContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Loading...</div>`;
  }
  if (tagsRingContainer) {
    tagsRingContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Loading...</div>`;
  }
  if (tagsLegendContainer) {
    tagsLegendContainer.innerHTML = '';
  }

  try {
    let query = '';
    const range = rangeSelector ? rangeSelector.value : '365';

    if (range === 'year') {
      const today = new Date();
      const year = today.getFullYear();
      const start = `${year}-01-01`;
      const end = today.toISOString().slice(0, 10);
      query = `?from_date=${start}&to_date=${end}`;
    } else {
      // 365: default is 365 days in backend.
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 365);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = today.toISOString().slice(0, 10);
      query = `?from_date=${startStr}&to_date=${endStr}`;
    }

    const data = await api(`/api/stats/charts${query}`);
    // data: { daily: [], weekly: [], monthly: ..., from_date, to_date, tags_distribution }
    renderActivityHeatmap(data.daily || [], data.from_date, data.to_date);
    renderWeeklyBarChart(data.weekly || []);
    summarizeWeeklyData(data.weekly || []);
    renderTagsDonutChart(data.tags_distribution || []);
  } catch (err) {
    const message = 'Err: ' + err.message;
    heatmapContainer.innerText = message;
    if (weeklyContainer) weeklyContainer.innerText = message;
    if (tagsRingContainer) tagsRingContainer.innerText = message;
    if (tagsLegendContainer) tagsLegendContainer.innerHTML = '';
  }
}

function renderActivityHeatmap(dailyData, fromDateStr, toDateStr) {
  const container = $('#chart-activity-heatmap');

  const map = {};
  dailyData.forEach(d => {
    map[d.period_start] = d.solved_count;
  });

  const boxSize = 12;
  const gap = 3;
  const days = 7;

  // Determine date range
  let start, end;

  if (fromDateStr && toDateStr) {
    start = new Date(fromDateStr);
    end = new Date(toDateStr);
  } else {
    // Fallback to last 365 days (approx) if not provided
    end = new Date();
    start = new Date(end);
    start.setDate(start.getDate() - 365);
  }

  // Align start to Sunday
  // This ensures the first column starts with Sunday
  const dayOfWeek = start.getDay(); // 0 is Sunday
  start.setDate(start.getDate() - dayOfWeek);

  // Calculate weeks needed to cover until end
  // We might go a bit past 'end' to complete the week column
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  // Add 1 to include end date, then divide by 7
  const weeks = Math.ceil((diffDays + 1) / 7) + 1; // +1 buffer

  const width = weeks * (boxSize + gap);
  const height = days * (boxSize + gap);

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

function renderTagsDonutChart(tagsDistribution) {
  const ringContainer = $('#chart-tags-ring');
  const legendContainer = $('#chart-tags-legend');
  if (!ringContainer || !legendContainer) return;

  const rows = Array.isArray(tagsDistribution)
    ? tagsDistribution
      .map((item) => ({
        tag: String(item?.tag || '').trim(),
        count: Number(item?.count || 0)
      }))
      .filter((item) => item.tag && Number.isFinite(item.count) && item.count > 0)
    : [];

  if (!rows.length) {
    ringContainer.innerHTML = `<div style="text-align:center;color:var(--text-muted)">${escapeHtml(t('msg_no_tags_data'))}</div>`;
    legendContainer.innerHTML = '';
    return;
  }

  const total = rows.reduce((acc, cur) => acc + cur.count, 0);
  const topRows = rows.slice(0, 20);
  const cx = 170;
  const cy = 170;
  const outerR = 145;
  const innerR = 70;

  let startAngle = -Math.PI / 2;
  const paths = [];
  const legends = [];

  for (let i = 0; i < topRows.length; i++) {
    const row = topRows[i];
    const ratio = row.count / total;
    const delta = ratio * Math.PI * 2;
    const endAngle = startAngle + delta;
    const color = TAG_CHART_COLORS[i % TAG_CHART_COLORS.length];

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);

    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    const largeArcFlag = delta > Math.PI ? 1 : 0;
    const pathData = `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} L ${x3.toFixed(3)} ${y3.toFixed(3)} A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${x4.toFixed(3)} ${y4.toFixed(3)} Z`;
    const percent = (ratio * 100).toFixed(1);

    paths.push(`<path d="${pathData}" fill="${color}" stroke="var(--bg-card)" stroke-width="1"><title>${escapeHtml(row.tag)}: ${row.count} (${percent}%)</title></path>`);
    legends.push(`
      <div class="chart-tags-legend-item" title="${escapeHtml(row.tag)}">
        <span class="chart-tags-legend-color" style="background:${color}"></span>
        <span class="chart-tags-legend-label">${escapeHtml(row.tag)} : ${row.count}</span>
      </div>
    `);

    startAngle = endAngle;
  }

  const centerLabel = escapeHtml(t('label_tags_total'));
  ringContainer.innerHTML = `
    <svg width="100%" viewBox="0 0 340 340" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tags solved donut chart">
      ${paths.join('')}
      <circle cx="${cx}" cy="${cy}" r="${innerR - 1}" fill="var(--bg-app)"></circle>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" style="font-size:12px; fill: var(--text-muted);">${centerLabel}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" style="font-size:24px; font-weight:700; fill: var(--text-primary);">${total}</text>
    </svg>
  `;
  legendContainer.innerHTML = legends.join('');
}

// Reports V2
function getPhasedWeekRange() {
  const startWeek = $('#phased-start-week')?.value || '';
  const endWeek = $('#phased-end-week')?.value || '';
  return { startWeek, endWeek };
}

function reportPath(type, target, suffix = '') {
  if (type === 'weekly') {
    return `/api/reports/weekly/${encodeURIComponent(target)}${suffix}`;
  }
  if (type === 'phased') {
    const [startWeek, endWeek] = String(target || '').split('__', 2);
    return `/api/reports/phased/${encodeURIComponent(startWeek || '')}/${encodeURIComponent(endWeek || '')}${suffix}`;
  }
  throw new Error('unsupported report type');
}

async function handleReportAction(type, target) {
  if (!target) {
    toast(t('msg_select_week'));
    return;
  }

  toast(`${t('msg_generating')} ${target}...`);
  try {
    await api(reportPath(type, target, '/generate'), { method: 'POST' });
    toast(t('msg_report_generated'));
    pollReportStatus(type, target);
    startPolling();
  } catch (err) {
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function pollReportStatus(type, target) {
  for (let i = 0; i < 20; i++) {
    const data = await checkReportStatus(type, target);
    if (!data) return;
    if (data.status === 'ready' || data.status === 'failed') return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function checkReportStatus(type, target) {
  const el = $(`#status-${type}`);
  if (!el) return;

  el.textContent = 'Checking status...';
  try {
    const data = await api(reportPath(type, target, '/status'));
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
    const data = await api(reportPath('weekly', week));
    preview.textContent = data.content || t('msg_no_content');
    await checkReportStatus('weekly', week);
  } catch (err) {
    preview.textContent = '';
    toast(`${t('msg_error')}: ${err.message}`);
  }
}

async function viewPhasedReport() {
  const { startWeek, endWeek } = getPhasedWeekRange();
  if (!startWeek || !endWeek) {
    toast(t('msg_select_week'));
    return;
  }

  const target = `${startWeek}__${endWeek}`;
  const preview = $('#phased-report-preview');
  if (!preview) return;
  preview.classList.remove('hidden');
  preview.textContent = t('msg_loading');

  try {
    const data = await api(reportPath('phased', target));
    preview.textContent = data.content || t('msg_no_content');
    await checkReportStatus('phased', target);
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

  // Check if storage directory has been configured FIRST
  try {
    console.log('Checking storage configuration status...');
    const status = await api('/api/settings/status');
    console.log('Storage status:', status);

    if (!status.is_configured) {
      console.log('Storage not configured, showing setup overlay');
      showSetupOverlay();
      return; // Don't load anything else until user picks a directory
    }
    console.log('Storage configured, proceeding with normal init');
  } catch (err) {
    console.error('Failed to check storage status:', err);
    // Continue anyway in case of error
  }

  // Rest of init only runs if storage is configured
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

  const btnGenPhased = $('#btn-gen-phased');
  if (btnGenPhased) {
    btnGenPhased.addEventListener('click', () => {
      const { startWeek, endWeek } = getPhasedWeekRange();
      if (!startWeek || !endWeek) {
        toast(t('msg_select_week'));
        return;
      }
      handleReportAction('phased', `${startWeek}__${endWeek}`);
    });
  }

  const btnViewPhased = $('#btn-view-phased');
  if (btnViewPhased) btnViewPhased.addEventListener('click', viewPhasedReport);

  bind('#import-btn', importProblems);
  bind('#add-ai-provider-btn', addAiProvider);
  bind('#save-ai-btn', () => saveAISettings({ silent: false, refresh: true }));
  bind('#test-ai-btn', testAISettings);
  bind('#toggle-solution-template-vars-btn', toggleSolutionTemplateVars);
  bind('#toggle-weekly-template-vars-btn', toggleWeeklyTemplateVars);
  bind('#reset-solution-template-btn', () => resetPromptTemplate('solution'));
  bind('#reset-weekly-template-btn', () => resetPromptTemplate('insight'));
  bind('#save-settings-btn', saveAllSettings);
  bind('#pick-storage-dir-btn', pickStorageDirectory);

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

  const rangeSelector = $('#heatmap-mode');
  if (rangeSelector) {
    rangeSelector.addEventListener('change', () => loadStatsCharts());
  }

  await loadSettings();
  await loadOverview();
}

init().catch((err) => console.error(err));
