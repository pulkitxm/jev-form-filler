import { profileFields, safeUrl, inferProfile, selectedCandidate, decide, answerCandidates, answerQuestion } from './model.js';
import { parseHtml, extractionVersion, isBlockedPage, discoverPages, fetchText, importGithub, capturePage } from './sources.js';
import { inspectForm, applyAnswers, undoAnswers } from './forms.js';
import { createCredentialBridge } from './credentials.js';
const $ = selector => document.querySelector(selector);
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const credentials = createCredentialBridge({ runtime: chrome.runtime, storage: chrome.storage.local });
await credentials.sync();
const stored = await chrome.storage.local.get(['sources', 'profile', 'apiKey']);
let sources = (stored.sources || []).map(source => isBlockedPage(source.title) ? { ...source, excluded: true } : source);
let profile = stored.profile || {};
let hasKey = Boolean(stored.apiKey);
let currentConnector = 'website';
let draft = null;
let profileDiagnostics = {};
let controller = null;
let scan = null;
let suggestions = [];
const targetId = Number(new URL(location.href).searchParams.get('tab')) || null;
function status(message, error = false) {
  $('#status-bar').hidden = false;
  $('#status-bar').classList.toggle('error', error);
  $('#status').textContent = message;
}
function showView(view) {
  document.querySelectorAll('.view').forEach(node => node.hidden = node.id !== `view-${view}`);
  document.querySelectorAll('.nav').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#breadcrumb').textContent = { sources: 'Sources', profile: 'Your profile', fill: 'Fill a form', settings: 'Settings' }[view];
  if (view === 'profile') renderProfile();
}
function refreshKey() {
  $('#key-label').textContent = hasKey ? 'TypeSafe connected' : 'Connect TypeSafe';
  $('#key-indicator').classList.toggle('connected', hasKey);
  $('#key-state').textContent = hasKey ? 'A key is saved. Leave this field empty to keep it.' : 'No key saved yet.';
}
async function run(task) {
  if (controller) return;
  controller = new AbortController();
  $('#cancel').hidden = false;
  document.querySelectorAll('button:not(#cancel):not(.nav):not(#key-shortcut):not(#close-dialog)').forEach(node => node.disabled = true);
  try { await task(controller.signal); }
  catch (error) {
    const message = controller.signal.aborted ? 'Stopped. Completed imports remain saved.' : error.message;
    status(message, true);
    if ($('#source-dialog').open) $('#source-status').textContent = message;
  } finally {
    controller = null;
    $('#cancel').hidden = true;
    document.querySelectorAll('button').forEach(node => node.disabled = false);
  }
}
function sourceIcon(url) {
  const host = new URL(url).hostname;
  if (host === 'github.com') return ['github', '⌘'];
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return ['linkedin', 'in'];
  if (['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(host)) return ['twitter', '𝕏'];
  return ['website', '↗'];
}
function renderSources() {
  $('#source-count').textContent = sources.length;
  $('#list-count').textContent = sources.length;
  $('#sources-list').replaceChildren();
  if (!sources.length) {
    const empty = create('div', 'empty');
    empty.append(create('span', '', '↗'), create('h3', '', 'Your story starts with a source.'), create('p', '', 'Connect a profile above, or import the page you have open.'));
    $('#sources-list').append(empty);
  }
  for (const source of sources) {
    const row = create('div', 'source-row');
    const [kind, icon] = sourceIcon(source.url);
    const text = create('div', 'source-text');
    text.append(create('strong', '', source.title), create('p', '', source.url));
    const meta = create('div', 'source-meta', `${source.candidates.length} details`);
    meta.append(create('span', '', source.excluded ? 'Needs reimport' : source.extractionVersion !== extractionVersion ? 'Refresh needed' : '✓ Imported'));
    const remove = create('button', 'icon-button', '×');
    remove.setAttribute('aria-label', `Remove ${source.title}`);
    remove.addEventListener('click', () => run(async () => {
      sources = sources.filter(item => item.url !== source.url);
      for (const [key, fact] of Object.entries(profile)) if (fact.source === source.url) delete profile[key];
      draft = null;
      suggestions = [];
      $('#answers').replaceChildren();
      $('#apply').hidden = true;
      await chrome.storage.local.set({ sources, profile });
      renderSources();
      status('Source removed, including saved facts taken from it.');
    }));
    row.append(create('span', `connector-icon ${kind}`, icon), text, meta, remove);
    $('#sources-list').append(row);
  }
}
async function saveSource(source) {
  if (source.candidates.length < 2) throw new Error('This page did not expose enough profile information. Open it in your browser and use Import open page.');
  const next = [...sources.filter(item => item.url !== source.url), source];
  if (next.length > 30) throw new Error('The workspace holds up to 30 source pages. Remove a source first.');
  await chrome.storage.local.set({ sources: next });
  sources = next;
  renderSources();
}
function renderProfile() {
  const values = draft || profile;
  $('#draft-notice').hidden = !draft;
  $('#profile-fields').replaceChildren();
  for (const [key, label] of Object.entries(profileFields)) {
    const field = create('div', `profile-field ${['bio', 'skills'].includes(key) ? 'wide' : ''}`);
    const caption = create('label', '', label);
    caption.htmlFor = `profile-${key}`;
    const input = create(['bio', 'skills'].includes(key) ? 'textarea' : 'input');
    input.id = `profile-${key}`;
    input.name = key;
    input.value = values[key]?.value || '';
    input.maxLength = 2400;
    input.placeholder = 'Add this detail';
    const fact = values[key];
    const decision = profileDiagnostics[key];
    const missing = decision ? decision.choice === 'skip' ? `Jev found no clear match among ${decision.options} candidates.` : `Match withheld: ${Math.round(decision.confidence * 100)}% confidence among ${decision.options} candidates.` : 'Add manually or build from your sources';
    field.append(caption, input, create('p', 'provenance', fact?.source ? `Source: ${fact.source}${fact.confidence < 0.65 ? ` · Review carefully: ${Math.round(fact.confidence * 100)}% model confidence` : ''}` : missing));
    $('#profile-fields').append(field);
  }
}
async function buildProfile(signal) {
  if (sources.some(source => !source.excluded && source.extractionVersion !== extractionVersion)) throw new Error('Your sources were imported with the older extractor. Choose Refresh sources to recover links and employment context, then rebuild your profile.');
  const { apiKey } = await chrome.storage.local.get('apiKey');
  profileDiagnostics = {};
  const next = await inferProfile(sources, { apiKey, signal, onProgress: status, onDecision: (field, decision) => profileDiagnostics[field] = decision });
  signal.throwIfAborted();
  draft = { ...Object.fromEntries(Object.entries(profile).filter(([, fact]) => fact.source === 'Entered by you')), ...next };
  showView('profile');
  status('Profile suggestions are ready. Review the details, then save your profile.');
}
async function execute(func, args = []) {
  if (!targetId) throw new Error('Open the target page and click the extension toolbar button first.');
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: targetId }, func, args });
    if (result[0]?.error) throw new Error(result[0].error.message);
    if (result[0]?.result === undefined) throw new Error('No page result');
    return result[0].result;
  } catch (error) { throw new Error(`Cannot access this page. Open a normal website and click the toolbar button again. ${error.message}`); }
}
function renderAnswers() {
  $('#answers').replaceChildren();
  for (const suggestion of suggestions) {
    const card = create('div', 'answer-card');
    const label = create('label');
    const checkbox = create('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.answer = suggestion.field.id;
    checkbox.checked = Boolean(suggestion.answer) && !suggestion.field.value;
    label.append(checkbox, document.createTextNode(suggestion.field.label), create('span', 'badge', suggestion.field.value ? 'Existing value: review before replacing' : suggestion.answer ? 'Source-backed suggestion' : 'Needs your input'));
    const input = create(suggestion.field.options.length ? 'select' : suggestion.field.type === 'textarea' ? 'textarea' : 'input');
    input.setAttribute('aria-label', `Answer for ${suggestion.field.label}`);
    input.dataset.value = suggestion.field.id;
    if (suggestion.field.options.length) {
      input.append(new Option('Select an answer', ''));
      for (const option of suggestion.field.options) if (option.value) input.append(new Option(option.label, option.value));
    } else { input.rows = 2; input.maxLength = suggestion.field.maxLength; }
    input.value = suggestion.answer?.value || '';
    input.placeholder = 'No supported answer found. Add your own or leave unchecked.';
    card.append(label, input, create('p', 'provenance', suggestion.answer ? `Source: ${suggestion.answer.source}` : 'No reliable answer in your saved information.'));
    $('#answers').append(card);
  }
  $('#apply').hidden = !suggestions.length;
}
for (const nav of document.querySelectorAll('.nav')) nav.addEventListener('click', () => showView(nav.dataset.view));
$('#key-shortcut').onclick = () => showView('settings');
$('#cancel').onclick = () => controller?.abort();
$('#dismiss-status').onclick = () => $('#status-bar').hidden = true;
$('#build-profile').onclick = $('#rebuild').onclick = () => run(buildProfile);
$('#profile-form').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const next = {};
    for (const [key, value] of new FormData(event.target)) {
      const old = (draft || profile)[key];
      if (value.trim()) next[key] = { value: value.trim(), source: old?.value === value.trim() ? old.source : 'Entered by you' };
    }
    await chrome.storage.local.set({ profile: next });
    profile = next;
    draft = null;
    suggestions = [];
    $('#apply').hidden = true;
    $('#answers').replaceChildren();
    renderProfile();
    status('Profile saved on this device. Ready for your next form.');
  });
};
$('#show-key').onclick = () => {
  const show = $('#api-key').type === 'password';
  $('#api-key').type = show ? 'text' : 'password';
  $('#show-key').textContent = show ? 'Hide' : 'Show';
};
$('#settings-form').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const value = $('#api-key').value.trim();
    if (value && (value.length > 512 || /\s/.test(value))) throw new Error('Enter an API key without spaces.');
    if (value) await credentials.save(value);
    hasKey = hasKey || Boolean(value);
    $('#api-key').value = '';
    $('#api-key').type = 'password';
    $('#show-key').textContent = 'Show';
    refreshKey();
    status(value ? 'API key saved and shared with your Jev extensions.' : 'Existing key kept.');
  });
};
$('#remove-key').onclick = () => run(async () => {
  await credentials.remove();
  hasKey = false;
  $('#api-key').value = '';
  refreshKey();
  status('API key removed.');
});
$('#clear-data').onclick = () => {
  if (!confirm('Delete all saved sources, profile details, and the API key from this extension?')) return;
  run(async () => {
    await chrome.storage.local.clear();
    await credentials.remove();
    sources = []; profile = {}; draft = null; suggestions = []; scan = null; hasKey = false;
    $('#api-key').value = '';
    $('#answers').replaceChildren(); $('#apply').hidden = true; $('#undo').hidden = true;
    refreshKey(); renderSources(); renderProfile();
    status('All local extension data deleted.');
  });
};
for (const button of document.querySelectorAll('[data-connector]')) button.onclick = () => {
  currentConnector = button.dataset.connector;
  const names = { linkedin: 'Connect LinkedIn', twitter: 'Connect X / Twitter', github: 'Connect GitHub', website: 'Add a website' };
  $('#source-heading').textContent = names[currentConnector];
  $('#source-help').textContent = ['linkedin', 'twitter'].includes(currentConnector) ? 'For best results, open your profile, click the extension toolbar button, then choose Import open page. URL imports work only when public HTML is available.' : currentConnector === 'github' ? 'Import your public GitHub profile directly. No GitHub token needed.' : 'Import one page, or discover pages from the site’s sitemap.';
  $('#crawl-row').hidden = currentConnector !== 'website';
  $('#crawl').checked = false;
  $('#source-url').value = '';
  $('#source-status').textContent = '';
  $('#discovery').hidden = true;
  $('#connect-source').hidden = false;
  $('#source-dialog').showModal();
};
$('#close-dialog').onclick = () => $('#source-dialog').close();
$('#source-form').onsubmit = event => {
  event.preventDefault();
  let url;
  try {
    url = safeUrl($('#source-url').value);
    if (currentConnector === 'linkedin' && url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) throw new Error('Enter a LinkedIn profile URL.');
    if (currentConnector === 'twitter' && !['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname)) throw new Error('Enter an X or Twitter profile URL.');
    if (currentConnector === 'github' && url.hostname !== 'github.com') throw new Error('Enter a GitHub profile URL.');
  } catch (error) { $('#source-status').textContent = error.message; return; }
  const origins = currentConnector === 'github' ? ['https://api.github.com/*'] : [`${url.origin}/*`];
  const permission = chrome.permissions.request({ origins });
  run(async signal => {
    if (!await permission) throw new Error('Website access was not granted. No source was imported.');
    status('Reading your source…');
    $('#source-status').textContent = 'Reading your source…';
    if ($('#crawl').checked && currentConnector === 'website') {
      const result = await discoverPages(url.href, { signal });
      $('#discovered-pages').replaceChildren();
      for (const [index, page] of result.urls.entries()) {
        const label = create('label', 'check-row');
        const checkbox = create('input'); checkbox.type = 'checkbox'; checkbox.value = page; checkbox.checked = index < 10;
        label.append(checkbox, document.createTextNode(page));
        $('#discovered-pages').append(label);
      }
      $('#discovery').hidden = false;
      $('#connect-source').hidden = true;
      const message = `Found ${result.urls.length} page${result.urls.length === 1 ? '' : 's'}.${result.warnings.length ? ' Some sitemap files could not be read. You can still import the listed pages.' : ''}`;
      $('#source-status').textContent = message;
      status(message);
    } else {
      const source = currentConnector === 'github' ? await importGithub(url.href, { signal }) : parseHtml(await fetchText(url.href, { signal }), url.href);
      signal.throwIfAborted();
      await saveSource(source);
      $('#source-dialog').close();
      status(source.warning || 'Source imported. Build your profile when you’re ready.');
    }
  });
};
$('#import-selected').onclick = () => run(async signal => {
  const urls = [...document.querySelectorAll('#discovered-pages input:checked')].map(node => node.value);
  if (!urls.length || urls.length > 10) throw new Error('Select between 1 and 10 pages.');
  let imported = 0;
  const failed = [];
  for (const [index, url] of urls.entries()) {
    signal.throwIfAborted();
    status(`Importing page ${index + 1} of ${urls.length}…`);
    $('#source-status').textContent = `Importing page ${index + 1} of ${urls.length}…`;
    try { const source = parseHtml(await fetchText(url, { signal }), url); signal.throwIfAborted(); await saveSource(source); imported++; }
    catch (error) { if (signal.aborted) throw error; failed.push(`${url}: ${error.message}`); }
  }
  $('#source-dialog').close();
  status(`${imported} page${imported === 1 ? '' : 's'} imported.${failed.length ? ` ${failed.length} failed: ${failed.join(' ')}` : ' Ready to build your profile.'}`, Boolean(failed.length));
});
$('#refresh-sources').onclick = () => {
  if (!sources.length) { status('Add a source first.'); return; }
  const origins = [...new Set(sources.map(source => source.url.startsWith('https://github.com/') ? 'https://api.github.com/*' : `${safeUrl(source.url).origin}/*`))];
  const permission = chrome.permissions.request({ origins });
  run(async signal => {
    if (!await permission) throw new Error('Website access was not granted. Your sources are unchanged.');
    let refreshed = 0;
    const failures = [];
    for (const source of [...sources]) {
      signal.throwIfAborted();
      status(`Refreshing ${refreshed + failures.length + 1} of ${sources.length}: ${source.title}…`);
      try {
        const updated = source.url.startsWith('https://github.com/') ? await importGithub(source.url, { signal }) : parseHtml(await fetchText(source.url, { signal }), source.url);
        signal.throwIfAborted();
        await saveSource(updated);
        refreshed++;
      } catch (error) {
        if (signal.aborted) throw error;
        failures.push(`${source.title}: ${error.message}`);
        if (/browser-check page/.test(error.message)) {
          sources = sources.map(item => item.url === source.url ? { ...item, excluded: true } : item);
          await chrome.storage.local.set({ sources });
        }
      }
    }
    draft = null;
    renderSources();
    status(`${refreshed} sources refreshed. ${failures.length ? failures.join(' ') : 'Build your profile to use the recovered context.'}`, Boolean(failures.length));
  });
};
$('#import-open').onclick = () => run(async () => {
  status('Reading the open page…');
  const captured = await execute(capturePage);
  safeUrl(captured.url);
  await saveSource(parseHtml(captured.html, captured.url));
  status('Open page imported. Build your profile to review its details.');
});
$('#scan').onclick = () => run(async signal => {
  if (!Object.values(profile).some(fact => fact.value)) throw new Error('Save some profile details before filling a form.');
  status('Finding form fields…');
  suggestions = [];
  $('#answers').replaceChildren();
  $('#apply').hidden = true;
  $('#undo').hidden = true;
  scan = await execute(inspectForm);
  $('#target-title').textContent = scan.title;
  $('#target-url').textContent = scan.url;
  if (!scan.fields.length) throw new Error('No supported, visible form fields found. Embedded frames and custom controls are not supported yet.');
  const { apiKey } = await chrome.storage.local.get('apiKey');
  const next = [];
  for (let offset = 0; offset < scan.fields.length; offset += 12) {
    signal.throwIfAborted();
    const batch = scan.fields.slice(offset, offset + 12);
    const candidates = batch.map(field => answerCandidates(field, profile, sources));
    status(`Matching profile details to fields ${offset + 1} to ${Math.min(offset + 12, scan.fields.length)}…`);
    const questions = Object.fromEntries(batch.map((field, i) => [field.id, answerQuestion(field, candidates[i])]));
    const answers = await decide(apiKey, { profile, purpose: 'Answer only from the profile owner’s evidence. Skip unknowns.' }, questions, { signal });
    for (const [i, field] of batch.entries()) next.push({ field, answer: selectedCandidate(answers[field.id], candidates[i]) });
  }
  signal.throwIfAborted();
  suggestions = next;
  renderAnswers();
  status(`${suggestions.length} fields found. Review the answers and choose what to fill.`);
});
$('#apply').onclick = () => run(async () => {
  const chosen = [...document.querySelectorAll('[data-answer]:checked')].map(node => ({ id: node.dataset.answer, value: document.querySelector(`[data-value="${node.dataset.answer}"]`).value }));
  if (!chosen.length) throw new Error('Select at least one answer to fill.');
  const results = await execute(applyAnswers, [scan.token, chosen]);
  const filled = results.filter(result => result.status === 'Filled').length;
  $('#undo').hidden = !filled;
  $('#apply').hidden = true;
  status(`${filled} fields filled. ${results.length - filled} skipped. Nothing was submitted.${results.some(result => result.status !== 'Filled') ? ' ' + results.filter(result => result.status !== 'Filled').map(result => `${suggestions.find(item => item.field.id === result.id)?.field.label}: ${result.status}`).join('; ') : ''}`);
});
$('#undo').onclick = () => run(async () => {
  const count = await execute(undoAnswers, [scan.token]);
  $('#undo').hidden = true;
  status(`Restored ${count} fields. Any values you edited afterward were left alone.`);
});
renderSources();
renderProfile();
refreshKey();
if (targetId) {
  try {
    const tab = await chrome.tabs.get(targetId);
    $('#target-title').textContent = tab.title || 'Linked page';
    $('#target-url').textContent = tab.url || 'Click Scan form to read this page.';
  } catch { $('#target-url').textContent = 'The original tab is closed. Open a page and click the toolbar button again.'; }
}
