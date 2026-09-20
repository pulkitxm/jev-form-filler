export function inspectForm() {
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const fields = [];
  const elements = new Map();
  const token = crypto.randomUUID();
  for (const node of document.querySelectorAll('input,textarea,select')) {
    const type = node.tagName === 'TEXTAREA' ? 'textarea' : node.tagName === 'SELECT' ? 'select' : node.type;
    if (!['text', 'email', 'tel', 'url', 'textarea', 'select', 'number', 'file'].includes(type) || node.disabled || node.readOnly || type === 'select' && node.multiple || !visible(node) || node.closest('[inert]')) continue;
    const labelled = (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const label = ([...node.labels || []].map(label => { const copy = label.cloneNode(true); copy.querySelectorAll('input,textarea,select,button').forEach(child => child.remove()); return copy.textContent; }).join(' ') || labelled || node.getAttribute('aria-label') || node.placeholder || node.name || node.id).replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!label || /password|credit.?card|card.?number|cvv|social.?security|\bssn\b|passport|bank.?account|routing.?number|one.?time|verification.?code/i.test(`${label} ${node.autocomplete}`)) continue;
    const id = `field${fields.length}`;
    const options = type === 'select' ? [...node.options].filter(option => !option.disabled && !option.closest('optgroup[disabled]')).map(option => ({ value: option.value, label: option.textContent.trim() })).slice(0, 180) : [];
    fields.push({ id, label, type, name: node.name, autocomplete: node.autocomplete, accept: node.accept || '', multiple: Boolean(node.multiple), context: (node.closest('fieldset')?.querySelector('legend')?.textContent || '') + ' ' + (node.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').slice(0, 500), value: node.value, maxLength: node.maxLength > 0 ? node.maxLength : 12000, options });
    elements.set(id, { node, original: node.value, type, label, identity: JSON.stringify([node.name, node.id, node.getAttribute('type'), node.autocomplete]) });
    if (fields.length === 60) break;
  }
  globalThis.__jevFormSession = { token, url: location.href, elements, undo: [] };
  return { token, url: location.href, title: document.title, fields };
}
export function applyAnswers(token, answers) {
  const session = globalThis.__jevFormSession;
  if (!session || session.token !== token || session.url !== location.href) throw new Error('The page changed. Scan the form again.');
  const results = [];
  for (const answer of answers) {
    const entry = session.elements.get(answer.id);
    const node = entry?.node;
    if (!node?.isConnected || node.disabled || node.readOnly || node.multiple || node.closest('[inert]') || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden' || node.value !== entry.original) { results.push({ id: answer.id, status: 'Skipped: field changed or is unavailable' }); continue; }
    const currentLabel = ([...node.labels || []].map(label => { const copy = label.cloneNode(true); copy.querySelectorAll('input,textarea,select,button').forEach(child => child.remove()); return copy.textContent; }).join(' ') || (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || node.getAttribute('aria-label') || node.placeholder || node.name || node.id).replace(/\s+/g, ' ').trim().slice(0, 240);
    if (currentLabel !== entry.label || JSON.stringify([node.name, node.id, node.getAttribute('type'), node.autocomplete]) !== entry.identity) { results.push({ id: answer.id, status: 'Skipped: field identity changed' }); continue; }
    const value = String(answer.value);
    if (node.maxLength > 0 && value.length > node.maxLength) { results.push({ id: answer.id, status: 'Skipped: answer is too long' }); continue; }
    if (node.tagName === 'SELECT' && ![...node.options].some(option => option.value === value && !option.disabled && !option.closest('optgroup[disabled]'))) { results.push({ id: answer.id, status: 'Skipped: option changed' }); continue; }
    const prototype = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(node, value);
    if (node.value !== value || !node.validity.valid && ['email', 'url', 'number'].includes(node.type)) { setter.call(node, entry.original); results.push({ id: answer.id, status: 'Skipped: invalid value' }); continue; }
    session.undo.push({ node, before: entry.original, after: value });
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    results.push({ id: answer.id, status: 'Filled' });
  }
  return results;
}
export function undoAnswers(token) {
  const session = globalThis.__jevFormSession;
  if (!session || session.token !== token || session.url !== location.href) throw new Error('The page changed. Undo is no longer available.');
  let restored = 0;
  for (const { node, before, after, files } of session.undo.reverse()) {
    if (files) {
      if (!node.isConnected || node.files.length !== after.length || !after.every((file, index) => node.files[index] === file)) continue;
      const transfer = new DataTransfer();
      before.forEach(file => transfer.items.add(file));
      node.files = transfer.files;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      restored++;
      continue;
    }
    if (!node.isConnected || node.value !== after) continue;
    const prototype = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, before);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    restored++;
  }
  session.undo = [];
  return restored;
}

export function applyFileAnswer(token, id, file) {
  const session = globalThis.__jevFormSession;
  if (!session || session.token !== token || session.url !== location.href) throw new Error('The page changed. Click Fill Details again.');
  const entry = session.elements.get(id);
  const node = entry?.node;
  if (!node?.isConnected || node.type !== 'file' || node.disabled || node.files.length || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden' || node.closest('[inert]')) return { id, status: 'Skipped: upload field changed or already has a file' };
  const label = ([...node.labels || []].map(label => { const copy = label.cloneNode(true); copy.querySelectorAll('input,textarea,select,button').forEach(child => child.remove()); return copy.textContent; }).join(' ') || (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || node.getAttribute('aria-label') || node.placeholder || node.name || node.id).replace(/\s+/g, ' ').trim().slice(0, 240);
  if (entry.label !== label || JSON.stringify([node.name, node.id, node.getAttribute('type'), node.autocomplete]) !== entry.identity) return { id, status: 'Skipped: upload field identity changed' };
  const types = { pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', zip: 'application/zip' };
  const mime = (file.type || types[file.name.split('.').pop().toLowerCase()] || '').toLowerCase();
  if (node.accept && !node.accept.toLowerCase().split(',').some(value => { const rule = value.trim(); return rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? mime.startsWith(rule.slice(0, -1)) : mime === rule; })) return { id, status: 'Skipped: file type is not accepted' };
  const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], file.name, { type: mime, lastModified: file.lastModified }));
  node.files = transfer.files;
  session.undo.push({ node, before: [], after: [...node.files], files: true });
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return { id, status: 'Filled' };
}
