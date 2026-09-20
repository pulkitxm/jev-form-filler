import { safeUrl } from './model.js';
export const extractionVersion = 4;
export function socialKind(value) {
  try {
    const url = safeUrl(value);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.split('/').filter(Boolean);
    if (host === 'linkedin.com' && path[0] === 'in' && path[1]) return 'linkedin';
    if (['x.com', 'twitter.com'].includes(host) && path.length === 1 && !['home', 'intent', 'share', 'search', 'explore', 'i', 'login', 'signup', 'settings', 'messages', 'notifications', 'compose'].includes(path[0])) return 'twitter';
    if (host === 'github.com' && path.length === 1 && !['login', 'signup', 'explore', 'features', 'settings'].includes(path[0])) return 'github';
  } catch {}
  return null;
}
export const isBlockedPage = title => /checking your browser|just a moment|security verification|access denied|verify (?:you are|you're) human|recaptcha|sign in.*linkedin|linkedin.*sign in|join linkedin|linkedin login|log in to x/i.test(title);
export function extractDocument(doc, url) {
  const title = doc.querySelector('title')?.textContent || '';
  if (isBlockedPage(title)) throw new Error('This is a sign-in or browser-check page, not profile content. Open the actual profile and import the loaded page.');
  const candidates = [];
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const add = (kind, value, context = '', extra = {}) => {
    value = clean(value);
    context = clean(context).slice(0, 1400);
    if (value && value.length <= 1200 && !candidates.some(item => item.kind === kind && item.value === value && item.context === context)) candidates.push({ kind, value, context, ...extra });
  };
  const addUrl = (value, context, kind, extra = {}) => {
    try { const href = safeUrl(value, url).href; add(kind || socialKind(href) || 'link', href, context, extra); } catch {}
  };
  const current = text => /\b(?:current(?:ly)?|present|working (?:at|for)|work (?:at|for))\b/i.test(text) && !/\b(?:previously|formerly|used to|no longer)\b/i.test(text);
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (data, depth = 0) => {
        if (!data || typeof data !== 'object' || depth > 8) return;
        if ([data['@type']].flat().includes('Person')) {
          const context = `Structured Person: ${clean(data.name)}. ${clean(data.description)}.`;
          for (const [key, kind] of Object.entries({ name: 'name', email: 'email', telephone: 'phone', jobTitle: 'role', url: 'website', description: 'bio' })) if (typeof data[key] === 'string') add(kind, data[key], context, { structured: true });
          for (const organization of [data.worksFor].flat()) {
            if (typeof organization === 'string') add('company', organization, context, { current: true });
            else if (organization?.name) {
              add('company', organization.name, context, { current: true });
              if (organization.url) addUrl(organization.url, `Current employer: ${organization.name}`, 'companyWebsite');
            }
          }
          if (typeof data.address === 'string') add('location', data.address, context);
          else if (data.address && typeof data.address === 'object') {
            for (const [key, kind] of Object.entries({ addressLocality: 'city', addressRegion: 'state', addressCountry: 'country', postalCode: 'postalCode', streetAddress: 'address' })) {
              const value = typeof data.address[key] === 'string' ? data.address[key] : data.address[key]?.name;
              if (value) add(kind, value, context, { structured: true });
            }
            add('location', [data.address.addressLocality, data.address.addressRegion, typeof data.address.addressCountry === 'string' ? data.address.addressCountry : data.address.addressCountry?.name].filter(Boolean).join(', '), context);
          }
          for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && !key.startsWith('@') && !['name', 'description', 'email', 'telephone', 'url', 'jobTitle'].includes(key)) add(key, value, context, { structured: true });
            if (['alumniOf', 'knowsLanguage', 'hasCredential', 'award', 'knowsAbout'].includes(key)) for (const entry of [value].flat()) if (typeof entry === 'string' || entry?.name) add(key, typeof entry === 'string' ? entry : entry.name, context, { structured: true });
          }
          for (const link of [data.sameAs].flat()) if (typeof link === 'string') addUrl(link, context, undefined, { structured: true });
        }
        for (const value of Object.values(data)) if (typeof value === 'object') visit(value, depth + 1);
      };
      visit(JSON.parse(script.textContent));
    } catch {}
  }
  for (const term of doc.querySelectorAll('dt')) {
    const value = term.nextElementSibling;
    if (value?.tagName === 'DD' && !term.closest('form')) add(clean(term.textContent), value.textContent, term.parentElement?.textContent);
  }
  for (const row of doc.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('th,td');
    if (cells.length === 2 && !row.closest('form')) add(clean(cells[0].textContent), cells[1].textContent, row.textContent);
  }
  add('name candidate', doc.querySelector('h1')?.textContent, `Page heading on ${title}`);
  add('title', title);
  add('bio', doc.querySelector('meta[name="description"],meta[property="og:description"]')?.content, title);
  for (const link of doc.querySelectorAll('a[href]')) {
    if (link.closest('form,[hidden],[aria-hidden="true"]')) continue;
    const href = link.getAttribute('href');
    const text = clean(link.textContent);
    const context = clean(link.closest('p,li,article,section')?.textContent || link.parentElement?.textContent).slice(0, 1400);
    if (href.startsWith('mailto:')) { add('email', href.slice(7).split('?')[0], context); continue; }
    if (href.startsWith('tel:')) { add('phone', href.slice(4), context); continue; }
    let target;
    try { target = safeUrl(href, url); } catch { continue; }
    const social = socialKind(target.href);
    if (social) add(social, target.href, `${text}. ${context}`);
    else if (!/\.(?:png|webp|jpe?g|gif|svg|pdf|zip)(?:$|\?)/i.test(target.pathname)) {
      add('link', target.href, `${text}. ${context}`);
      if (text && text.length < 150 && /\b(?:work|working|engineer|developer|founder|company|employer|venture|joined)\b/i.test(context)) {
        add('company', text, context, { current: current(context) });
        if (target.origin !== new URL(url).origin) add('companyWebsite', target.href, `${text}. ${context}`, { current: current(context) });
      }
    }
  }
  const host = new URL(url).hostname;
  add(socialKind(url) || 'website', url, `Imported page: ${title}`);
  for (const node of doc.querySelectorAll('script,style,noscript,nav,footer,aside,form,button,input,textarea,select,[hidden],[aria-hidden="true"]')) node.remove();
  const root = doc.querySelector('main,article,[role="main"]') || doc.body;
  const blocks = [...root?.querySelectorAll('h1,h2,h3,p,li,dt,dd,[data-title],[data-testid="UserDescription"],div,span') || []];
  for (const node of blocks) {
    if (['DIV', 'SPAN'].includes(node.tagName) && node.children.length && !node.hasAttribute('data-title')) continue;
    const text = clean(node.textContent);
    if (!text) continue;
    const context = clean(node.closest('a,li,article,section')?.textContent || node.parentElement?.textContent).slice(0, 1400);
    const chunks = text.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) || [text];
    for (const chunk of text.length > 1200 ? chunks : [text]) add('passage', chunk, context);
    if (node.hasAttribute('data-title')) add('company', text, context, { current: current(context) });
    const role = text.match(/^(?:senior |junior |staff |lead |founding |principal )?(?:software |full[ -]stack |frontend |backend |product )?(?:engineer|developer|designer|founder|manager)(?:\b|$)/i);
    if (role) add('role', role[0], context, { current: current(context) });
    for (const match of text.matchAll(/\b(?:working|work)\s+(?:at|for)\s+([\p{L}\p{N}][\p{L}\p{N}.& -]{1,70}?)(?=\s*[,;!]|\.\s|\s+(?:as|where|and|since)\b|$)/gu)) add('company', match[1].replace(/\.$/, ''), text, { current: current(text) });
    for (const match of text.matchAll(/\bbased in ([\p{L}][\p{L} ,]{1,70}?)(?=,?\s+(?:working|building|and)|[.!]|$)/gu)) add('location', match[1].replace(/,$/, ''), text);
    for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) add('email', match[0], text);
  }
  const passages = candidates.filter(item => item.kind === 'passage');
  const facts = candidates.filter(item => item.kind !== 'passage');
  return { url, title: title || host, candidates: [...facts.slice(0, 200), ...passages.slice(0, 300)], importedAt: new Date().toISOString(), extractionVersion };
}
export function parseHtml(html, url) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('base').forEach(node => node.remove());
  return extractDocument(new DOMParser().parseFromString(template.innerHTML, 'text/html'), url);
}
export function sitemapEntries(xml, origin) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The sitemap is not valid XML.');
  const index = doc.documentElement.localName === 'sitemapindex';
  if (!index && doc.documentElement.localName !== 'urlset') throw new Error('This URL is not a sitemap.');
  const urls = [...doc.getElementsByTagNameNS('*', 'loc')].flatMap(node => {
    try {
      const url = safeUrl(node.textContent.trim());
      return url.origin === origin ? [url.href] : [];
    } catch { return []; }
  });
  return { index, urls: [...new Set(urls)].slice(0, 100) };
}
export async function fetchText(url, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { credentials: 'omit', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}. Open the page and use Import open page instead.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw new Error('Source exceeds the 2 MB import limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function discoverPages(value, options = {}) {
  const url = safeUrl(value);
  const queue = [new URL('/sitemap.xml', url).href];
  try {
    const robots = await fetchText(new URL('/robots.txt', url).href, options);
    for (const match of robots.matchAll(/^sitemap:\s*(\S+)/gim)) {
      try { const entry = safeUrl(match[1]); if (entry.origin === url.origin) queue.push(entry.href); } catch {}
    }
  } catch (error) { if (options.signal?.aborted) throw error; }
  const visited = new Set();
  const pages = new Set([url.href]);
  const warnings = [];
  while (queue.length && visited.size < 5 && pages.size < 100) {
    options.signal?.throwIfAborted();
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);
    try {
      const sitemap = sitemapEntries(await fetchText(next, options), url.origin);
      if (sitemap.index) queue.push(...sitemap.urls);
      else for (const page of sitemap.urls) pages.add(page);
    } catch (error) { if (options.signal?.aborted) throw error; warnings.push(`${next}: ${error.message}`); }
  }
  return { urls: [...pages].slice(0, 100), warnings };
}
export async function importGithub(value, options = {}) {
  const url = safeUrl(value);
  const username = url.pathname.split('/').filter(Boolean)[0];
  if (url.hostname !== 'github.com' || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username || '')) throw new Error('Enter a GitHub profile URL, such as https://github.com/username.');
  const user = JSON.parse(await fetchText(`https://api.github.com/users/${username}`, options));
  const candidates = Object.entries({ name: user.name, bio: user.bio, company: user.company, location: user.location, email: user.email, website: user.blog, github: user.html_url }).filter(([, value]) => typeof value === 'string' && value.trim()).map(([kind, value]) => ({ kind, value: value.slice(0, 1200) }));
  let warning = '';
  try {
    const repositories = JSON.parse(await fetchText(`https://api.github.com/users/${username}/repos?sort=updated&per_page=20`, options));
    const languages = new Set();
    for (const repository of repositories.filter(item => !item.fork)) {
      if (repository.language) languages.add(repository.language);
      candidates.push({ kind: 'passage', value: `${repository.name}: ${repository.description || 'Public repository'}. ${repository.language ? `Language: ${repository.language}. ` : ''}${repository.html_url}`.slice(0, 1200) });
    }
    if (languages.size) candidates.push({ kind: 'skills', value: [...languages].join(', ') });
  } catch (error) { if (options.signal?.aborted) throw error; warning = 'Profile imported, but public repositories could not be read.'; }
  return { url: user.html_url, title: user.name || username, candidates, warning, extractionVersion, importedAt: new Date().toISOString() };
}
export function capturePage() {
  let content = document;
  if (!document.querySelector('main,[role="main"],article')) {
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        if (frame.getClientRects().length && getComputedStyle(frame).visibility !== 'hidden' && frame.contentDocument?.querySelector('main,[role="main"],article')) { content = frame.contentDocument; break; }
      } catch {}
    }
  }
  const root = content.querySelector('main,[role="main"],article') || content.body;
  const clone = root.cloneNode(true);
  const originals = [...root.querySelectorAll('*')];
  const copies = [...clone.querySelectorAll('*')];
  for (const [index, original] of originals.entries()) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'FOOTER', 'ASIDE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(original.tagName) || original.isContentEditable || original.getAttribute('role') === 'dialog' || original.hidden || original.getAttribute('aria-hidden') === 'true' || getComputedStyle(original).display === 'none' || getComputedStyle(original).visibility === 'hidden') copies[index].remove();
  }
  const head = document.createElement('head');
  const title = document.createElement('title');
  title.textContent = document.title;
  head.append(title);
  for (const meta of content.querySelectorAll('meta[name="description"],meta[property="og:description"],script[type="application/ld+json"]')) head.append(meta.cloneNode(true));
  return { url: location.href, html: `<html>${head.outerHTML}<body>${clone.outerHTML}</body></html>`.slice(0, 1_500_000) };
}
