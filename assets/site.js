document.querySelectorAll('.collapsible-block').forEach(block => {
  const folded = block.querySelector('.collapsible-block-folded');
  const open = block.querySelector('.collapsible-block-unfolded');
  if (!folded || !open) return;
  block.querySelectorAll('.collapsible-block-link').forEach(a => a.addEventListener('click', event => {
    event.preventDefault();
    const expand = open.style.display === 'none' || getComputedStyle(open).display === 'none';
    open.style.display = expand ? 'block' : 'none'; folded.style.display = expand ? 'none' : 'block';
  }));
});
document.querySelectorAll('.yui-navset').forEach(set => {
  const tabs = [...set.querySelectorAll(':scope > .yui-nav > li')];
  const panels = [...set.querySelectorAll(':scope > .yui-content > div')];
  function select(index) { tabs.forEach((tab, i) => tab.classList.toggle('selected', i === index)); panels.forEach((panel, i) => { panel.hidden = i !== index; panel.style.display = i === index ? 'block' : 'none'; }); }
  tabs.forEach((tab, i) => tab.querySelector('a')?.addEventListener('click', e => { e.preventDefault(); select(i); }));
  if (tabs.length) select(0);
});
const results = document.getElementById('search-results');
if (results) {
  const q = (new URLSearchParams(location.search).get('q') || '').trim();
  document.querySelector('#page-content input[name="q"]').value = q;
  const status = document.getElementById('search-status');
  if (!q) status.textContent = '输入关键词，搜索标题和正文。';
  else fetch('/assets/search-index.json').then(r => { if (!r.ok) throw new Error('search'); return r.json(); }).then(pages => {
    const terms = q.toLocaleLowerCase().split(/\s+/);
    const matches = pages.filter(p => terms.every(t => (p.title + ' ' + p.text).toLocaleLowerCase().includes(t)));
    status.textContent = `找到 ${matches.length} 个页面`;
    matches.forEach(p => { const article = document.createElement('article'), a = document.createElement('a'), excerpt = document.createElement('p'); a.href = p.url; a.textContent = p.title; const start = Math.max(0, p.text.toLocaleLowerCase().indexOf(terms[0]) - 40); excerpt.textContent = p.text.slice(start, start + 180); article.append(a, excerpt); results.append(article); });
  }).catch(() => { status.textContent = '搜索索引加载失败，请刷新重试。'; });
}
