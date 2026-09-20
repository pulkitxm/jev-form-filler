import { safeUrl } from './model.js';
export function extractDocument(doc, url) {
  const candidates = [];
  const add = (kind, value) => {
    value = String(value || '').replace(/\s+/g, ' ').trim();
    if (value && value.length <= 1200 && !candidates.some(item => item.kind === kind && item.value === value)) candidates.push({ kind, value });
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (data, depth = 0) => {
        if (!data || typeof data !== 'object' || depth > 8) return;
        if ([data['@type']].flat().includes('Person')) {
          for (const [key, kind] of Object.entries({ name: 'name', email: 'email', telephone: 'phone', jobTitle: 'role', url: 'website', description: 'bio' })) if (typeof data[key] === 'string') add(kind, data[key]);
          if (typeof data.worksFor?.name === 'string') add('company', data.worksFor.name);
          if (typeof data.address?.addressLocality === 'string') add('location', data.address.addressLocality);
        }
        for (const value of Object.values(data)) if (typeof value === 'object') visit(value, depth + 1);
      };
      visit(JSON.parse(script.textContent));
    } catch {}
  }
  add('name candidate', doc.querySelector('h1')?.textContent);
  add('title', doc.querySelector('title')?.textContent);
  add('bio', doc.querySelector('meta[name="description"],meta[property="og:description"]')?.content);
  for (const link of doc.querySelectorAll('a[href^="mailto:"]')) add('email', link.getAttribute('href').slice(7).split('?')[0]);
  for (const link of doc.querySelectorAll('a[href^="tel:"]')) add('phone', link.getAttribute('href').slice(4));
  const host = new URL(url).hostname;
  add((host === 'linkedin.com' || host.endsWith('.linkedin.com')) ? 'linkedin' : ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(host) ? 'twitter' : host === 'github.com' ? 'github' : 'website', url);
  for (const node of doc.querySelectorAll('script,style,noscript,nav,footer,form,button,input,textarea,select,[hidden],[aria-hidden="true"]')) node.remove();
  const root = doc.querySelector('main,article,[role="main"]') || doc.body;
  for (const node of root?.querySelectorAll('h1,h2,h3,p,li,dt,dd,[data-testid="UserDescription"]') || []) add('passage', node.textContent);
  if (candidates.filter(item => item.kind === 'passage').length < 2) {
    for (const line of (root?.textContent || '').split(/\n+/)) add('passage', line);
  }
  return { url, title: candidates.find(item => item.kind === 'title')?.value || host, candidates: candidates.slice(0, 160), importedAt: new Date().toISOString() };
}
export function parseHtml(html, url) {
  return extractDocument(new DOMParser().parseFromString(html, 'text/html'), url);
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
  return { url: user.html_url, title: user.name || username, candidates, warning, importedAt: new Date().toISOString() };
}
export function capturePage() {
  const root = document.querySelector('main,[role="main"],article') || document.body;
  const clone = root.cloneNode(true);
  const originals = [...root.querySelectorAll('*')];
  const copies = [...clone.querySelectorAll('*')];
  for (const [index, original] of originals.entries()) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'FOOTER', 'ASIDE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(original.tagName) || original.hidden || original.getAttribute('aria-hidden') === 'true' || getComputedStyle(original).display === 'none' || getComputedStyle(original).visibility === 'hidden') copies[index].remove();
  }
  const head = document.createElement('head');
  const title = document.createElement('title');
  title.textContent = document.title;
  head.append(title);
  for (const meta of document.querySelectorAll('meta[name="description"],meta[property="og:description"],script[type="application/ld+json"]')) head.append(meta.cloneNode(true));
  return { url: location.href, html: `<html>${head.outerHTML}<body>${clone.outerHTML}</body></html>`.slice(0, 1_500_000) };
}
