import fs from 'node:fs/promises';
import { parseHTML } from 'linkedom';
const report = JSON.parse(await fs.readFile('migration-report.json', 'utf8'));
const errors = [];
for (const page of [...report.pages, { url: '/search/' }]) {
  const file = '.' + page.url + 'index.html';
  const { document } = parseHTML(await fs.readFile(file, 'utf8'));
  if (!document.querySelector('#page-content')?.textContent.trim()) errors.push(file + ': empty');
  for (const el of document.querySelectorAll('[href], [src]')) {
    const url = el.getAttribute('href') || el.getAttribute('src');
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    let target = '.' + decodeURIComponent(url.split(/[?#]/)[0]);
    if (target.endsWith('/')) target += 'index.html';
    try { await fs.access(target); } catch { errors.push(file + ': missing ' + url); }
  }
  for (const el of document.querySelectorAll('*')) for (const attr of el.attributes) if (/^on/i.test(attr.name)) errors.push(file + ': inline event');
}
for (const name of await fs.readdir('assets')) if (name.endsWith('.css')) {
  const css = await fs.readFile('assets/' + name, 'utf8');
  for (const match of css.matchAll(/url\(["']?(\/assets\/[^"')]+)["']?\)/g)) try { await fs.access('.' + match[1].split('#')[0]); } catch { errors.push(name + ': missing ' + match[1]); }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Validated ${report.pages.length + 1} pages, links, assets, and event cleanup. Source download failures: ${report.failures.length}`);
