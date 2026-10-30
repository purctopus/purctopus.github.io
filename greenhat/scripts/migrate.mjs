import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

const origin = 'https://greenhat.wikidot.com';
const cache = '.migration-cache';
await fs.mkdir(cache, { recursive: true });
await fs.mkdir('assets', { recursive: true });
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 20);
const failures = [], externalPages = new Set(), assets = new Map(), pages = new Map();
const excluded = slug => /^(?:deleted:|admincss:|forum[:/]|help:|main:|legal:|home:|css:|system:|search:|_admin)/.test(slug);
const route = slug => slug === 'start' ? '/' : '/' + slug.split(/[:/]/).map(encodeURIComponent).join('/') + '/';
async function download(url) {
  const file = path.join(cache, hash(url));
  try { return await fs.readFile(file); } catch {}
  for (let i = 0; i < 2; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(file, data);
      return data;
    } catch (error) { if (i === 1) throw error; }
  }
}
function absolute(value, base) {
  try { return new URL(value.replaceAll('&amp;', '&'), base).href; } catch { return null; }
}
async function asset(value, base) {
  if (!value || /^(?:data:|#|javascript:)/i.test(value)) return value;
  let url = absolute(value, base);
  if (!url || !/^https?:/.test(url)) return value;
  const parsed = new URL(url), fragment = parsed.hash;
  parsed.hash = ''; url = parsed.href;
  if (assets.has(url)) return assets.get(url) + fragment;
  let ext = path.extname(parsed.pathname).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) ext = '.bin';
  const local = '/assets/' + hash(url) + ext;
  assets.set(url, local);
  try {
    let data = await download(url);
    if (ext === '.css') data = await rewriteCSS(data.toString('utf8'), url);
    await fs.writeFile('.' + local, data);
    console.log(`Asset: ${new URL(url).pathname}`);
    return local + fragment;
  } catch (error) {
    assets.set(url, url);
    failures.push({ type: 'asset', url, error: String(error) });
    console.log(`Unavailable asset: ${url}`);
    return url + fragment;
  }
}
async function rewriteCSS(css, base) {
  const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)|@import\s+(['"])(.*?)\3/g)];
  const targets = await Promise.all(matches.map(m => asset(m[2] ?? m[4], base)));
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i], target = targets[i];
    const replacement = m[2] !== undefined ? `url("${target}")` : `@import "${target}"`;
    css = css.slice(0, m.index) + replacement + css.slice(m.index + m[0].length);
  }
  return css;
}
const sitemap = (await download(origin + '/sitemap.xml')).toString('utf8');
const queue = [...new Set(['start', ...[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname.slice(1).replace(/\/$/, '') || 'start')])];
for (let i = 0; i < queue.length && i < 250; i++) {
  const slug = queue[i];
  if (excluded(slug)) continue;
  try {
    const raw = (await download(origin + '/' + slug)).toString('utf8');
    const { document } = parseHTML(raw);
    if (!document.querySelector('#page-content')) throw new Error('Page content missing');
    pages.set(slug, document);
    console.log(`Read ${i + 1}/${queue.length}: ${slug}`);
  } catch (error) { failures.push({ type: 'page', slug, error: String(error) }); }
}
const index = [];
for (const [slug, doc] of pages) {
  const base = origin + '/' + slug;
  const title = doc.querySelector('title')?.textContent.replace(/ - 绿帽社$/, '') || slug;
  index.push({ title, url: route(slug), text: doc.querySelector('#page-content').textContent.replace(/\s+/g, ' ').trim() });
  for (const el of doc.querySelectorAll('script, #footer-bar, #login-status, #page-options-container, #page-options-bottom-tips, #page-options-bottom-2-tips, #dummy-ondomready-block, .new-page-box, link[rel="alternate"]')) el.remove();
  for (const el of doc.querySelectorAll('#side-bar h1')) if (el.textContent.includes('创建新页面')) el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
  }
  for (const el of doc.querySelectorAll('.join-box')) el.remove();
  for (const el of doc.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href');
    if (/^(?:https?:\/\/greenhat\.wikidot\.com)?\/(?:_admin|forum[:/])/.test(href)) { (el.closest('li') || el).remove(); continue; }
    if (href.startsWith('#') || /^(mailto:|tel:)/.test(href)) continue;
    if (/^javascript:/i.test(href)) { el.setAttribute('href', base); continue; }
    const resolved = absolute(href, base);
    if (!resolved) continue;
    const u = new URL(resolved);
    if (u.hostname === 'greenhat.wikidot.com') {
      if (u.pathname.startsWith('/local--files/')) el.setAttribute('href', await asset(resolved, base));
      else {
        const target = decodeURIComponent(u.pathname.slice(1)).replace(/\/$/, '') || 'start';
        if (pages.has(target) && !u.search) el.setAttribute('href', route(target) + u.hash);
        else { el.setAttribute('href', resolved); externalPages.add(resolved); }
      }
    } else el.setAttribute('href', resolved);
  }
  for (const el of doc.querySelectorAll('img[src], source[src], audio[src], video[src], input[src]')) {
    el.setAttribute('src', await asset(el.getAttribute('src'), base));
    if (el.localName === 'img') el.setAttribute('loading', 'lazy');
  }
  for (const el of doc.querySelectorAll('iframe[src]')) el.setAttribute('src', absolute(el.getAttribute('src'), base));
  for (const el of doc.querySelectorAll('link[href]')) {
    if (/stylesheet|icon/.test(el.getAttribute('rel') || '')) el.setAttribute('href', await asset(el.getAttribute('href'), base));
  }
  for (const el of doc.querySelectorAll('style')) el.textContent = await rewriteCSS(el.textContent, base);
  for (const el of doc.querySelectorAll('[style]')) el.setAttribute('style', await rewriteCSS(el.getAttribute('style'), base));
  for (const form of doc.querySelectorAll('form')) {
    form.setAttribute('action', '/search/'); form.setAttribute('method', 'get');
    for (const el of form.querySelectorAll('input[type="text"]')) {
      el.setAttribute('name', 'q'); el.setAttribute('value', ''); el.setAttribute('placeholder', '搜索绿帽社'); el.setAttribute('aria-label', '搜索绿帽社');
    }
  }
  doc.documentElement.setAttribute('lang', 'zh-CN');
  doc.head.insertAdjacentHTML('afterbegin', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  doc.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/assets/migration.css"><script src="/assets/site.js" defer></script>');
  const footer = doc.querySelector('#footer');
  if (footer) footer.innerHTML = `<a href="/all-pages/">页面目录</a> · <a href="/search/">全文搜索</a> · <a href="${base}">Wikidot 原页</a>`;
  const out = '.' + route(slug);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'index.html'), '<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
  console.log(`Saved: ${slug}`);
}
const escapeHTML = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
// Replace platform-oriented landing pages with the archive's reading entry points.
const { document: home } = parseHTML(await fs.readFile('index.html', 'utf8'));
home.querySelector('#page-content').innerHTML = `<h1>绿帽社档案馆</h1><p>青青子衿，悠悠我心</p><div class="archive-sections"><section><h2><a href="/archive-center/">璃珠遗影</a></h2><p><a href="/greenhat-history/">绿帽史</a> · <a href="/guozhongmishi/">国中秘史</a> · <a href="/other-classified-archives-center/">其他归档档案</a></p></section><section><h2><a href="/zihai-archive/">紫海流华</a></h2><p><a href="/sheding/zihai/">紫海设定集</a> · <a href="/zihai/sector-25919/">三秋录</a> · <a href="/zihai/wujizhi/">无机质</a></p></section><section><h2><a href="/wubilian/">汉对语文献</a></h2><p><a href="/wubilian-intro/">汉对语介绍</a></p></section></div><p><a href="/all-pages/">浏览全部档案</a> · <a href="/search/">全文搜索</a></p>`;
await fs.writeFile('index.html', '<!DOCTYPE html>\n' + home.documentElement.outerHTML);
const { document: directory } = parseHTML(await fs.readFile('all-pages/index.html', 'utf8'));
directory.querySelector('#page-content').innerHTML = '<h1>全部档案</h1><ul>' + index.filter(p => !/^\/(?:nav|private-images|welcome|tagcloud|all-pages)\//.test(p.url) && p.url !== '/').map(p => `<li><a href="${p.url}">${escapeHTML(p.title)}</a></li>`).join('') + '</ul>';
await fs.writeFile('all-pages/index.html', '<!DOCTYPE html>\n' + directory.documentElement.outerHTML);
index.find(p => p.url === '/').title = '绿帽社档案馆';
index.find(p => p.url === '/').text = home.querySelector('#page-content').textContent;
index.find(p => p.url === '/all-pages/').text = directory.querySelector('#page-content').textContent;
await fs.writeFile('assets/search-index.json', JSON.stringify(index));
await fs.writeFile('.nojekyll', '');
await fs.writeFile('migration-report.json', JSON.stringify({ source: origin, migratedAt: new Date().toISOString(), pages: index.map(({title,url})=>({title,url})), assets: assets.size, exclusions: queue.filter(excluded), externalPages: [...externalPages].sort(), failures }, null, 2));
// Reuse the original shell for the independent search page.
const { document: search } = parseHTML(await fs.readFile('index.html', 'utf8'));
search.querySelector('title').textContent = '搜索 - 绿帽社';
search.querySelector('#page-content').innerHTML = '<h1>搜索绿帽社</h1><form action="/search/"><input name="q" aria-label="搜索内容" placeholder="输入标题或正文关键词"><button>搜索</button></form><p id="search-status" role="status"></p><div id="search-results"></div>';
await fs.mkdir('search', { recursive: true });
await fs.writeFile('search/index.html', '<!DOCTYPE html>\n' + search.documentElement.outerHTML);
console.log(JSON.stringify({ pages: pages.size, assets: assets.size, failures: failures.length }));
