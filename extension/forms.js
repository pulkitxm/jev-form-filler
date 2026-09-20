export function inspectForm() {
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const fields = [];
  const elements = new Map();
  const token = crypto.randomUUID();
  for (const node of document.querySelectorAll('input,textarea,select')) {
    const type = node.tagName === 'TEXTAREA' ? 'textarea' : node.tagName === 'SELECT' ? 'select' : node.type;
    if (!['text', 'email', 'tel', 'url', 'textarea', 'select', 'number'].includes(type) || node.disabled || node.readOnly || node.multiple || !visible(node) || node.closest('[inert]')) continue;
    const labelled = (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const label = ([...node.labels || []].map(label => label.textContent).join(' ') || labelled || node.getAttribute('aria-label') || node.placeholder || node.name || node.id).replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!label || /password|credit.?card|card.?number|cvv|social.?security|\bssn\b|passport|bank.?account|routing.?number|one.?time|verification.?code/i.test(`${label} ${node.autocomplete}`)) continue;
    const id = `field${fields.length}`;
    const options = type === 'select' ? [...node.options].filter(option => !option.disabled && !option.closest('optgroup[disabled]')).map(option => ({ value: option.value, label: option.textContent.trim() })).slice(0, 180) : [];
    fields.push({ id, label, type, value: node.value, maxLength: node.maxLength > 0 ? node.maxLength : 12000, options });
    elements.set(id, { node, original: node.value, type, label });
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
    if (!node?.isConnected || node.disabled || node.readOnly || !node.getClientRects().length || node.value !== entry.original) { results.push({ id: answer.id, status: 'Skipped: field changed or is unavailable' }); continue; }
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
  for (const { node, before, after } of session.undo.reverse()) {
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
