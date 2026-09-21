import { inspectForm, applyAnswers, applyFileAnswer, undoAnswers } from './forms.js';

export function embeddedOrigins() {
  return [...new Set([...document.querySelectorAll('iframe')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]')).map(node => {
    try { const url = new URL(node.src); return /^https?:$/.test(url.protocol) && url.origin !== location.origin ? `${url.origin}/*` : null; } catch { return null; }
  }).filter(Boolean))];
}

export async function framePermissions(tabId) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: embeddedOrigins });
  const missing = [];
  for (const origin of result.result || []) {
    if (!await chrome.permissions.contains({ origins: [origin] })) missing.push(origin);
  }
  return missing;
}

export async function executeForm(tabId, func, args = []) {
  if (func === inspectForm) {
    const missing = await framePermissions(tabId);
    if (missing.length) throw new Error('This page embeds a form from another site. Open the extension popup and click Fill Details to allow access to the embedded form.');
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func, args });
    const included = new Set(results.filter(item => item.frameId === 0));
    for (const parent of included) {
      for (const frame of parent.result?.frames || []) {
        if (!frame.visible || !/^https?:/.test(frame.url)) continue;
        const origin = new URL(frame.url).origin;
        const siblings = parent.result.frames.filter(item => /^https?:/.test(item.url) && new URL(item.url).origin === origin);
        const candidates = results.filter(item => !included.has(item) && item.result?.url === frame.url);
        if (candidates.length === 1 && !siblings.some(item => !item.visible && item.url === frame.url)) included.add(candidates[0]);
        else if (siblings.length === 1) {
          const navigated = results.filter(item => !included.has(item) && /^https?:/.test(item.result?.url || '') && new URL(item.result.url).origin === origin);
          if (navigated.length === 1) included.add(navigated[0]);
        }
      }
    }
    const documents = [...included];
    const sessions = documents.filter(item => item.result?.fields.length).map(item => ({ documentId: item.documentId, frameId: item.frameId, token: item.result.token }));
    const fields = documents.flatMap(item => (item.result?.fields || []).map(field => ({ ...field, id: `${item.frameId}:${field.id}` })));
    const page = results.find(item => item.frameId === 0)?.result || results[0]?.result;
    return { token: sessions, fields, title: page?.title || '', url: page?.url || '' };
  }
  const [sessions, ...rest] = args;
  const results = [];
  for (const session of sessions) {
    let inputs = rest;
    const prefix = `${session.frameId}:`;
    if (func === applyAnswers) {
      inputs = [rest[0].filter(answer => answer.id.startsWith(prefix)).map(answer => ({ ...answer, id: answer.id.slice(prefix.length) }))];
      if (!inputs[0].length) continue;
    }
    if (func === applyFileAnswer) {
      if (!rest[0].startsWith(prefix)) continue;
      inputs = [rest[0].slice(prefix.length), rest[1]];
    }
    const [result] = await chrome.scripting.executeScript({ target: { tabId, documentIds: [session.documentId] }, func, args: [session.token, ...inputs] });
    if (result?.error) throw new Error(result.error.message);
    if (func === undoAnswers) results.push(result.result);
    else results.push(...[result.result].flat().map(item => ({ ...item, id: `${prefix}${item.id}` })));
  }
  return func === undoAnswers ? results.reduce((sum, count) => sum + count, 0) : func === applyFileAnswer ? results[0] : results;
}
