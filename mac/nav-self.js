// Self-reporting address-bar test. A button (user gesture) opens one same-origin popup and navigates it
// top-level to each JSON URL, then reads what the browser did: rendered document vs. nothing (download).
// Results are POSTed back to /results and saved as results-nav-<label>.json.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8004);
const TYPES = {
  '/nav/profile': 'application/ld+json; profile="https://www.w3.org/ns/lws/v1"',
  '/nav/lws': 'application/lws+json',
  '/nav/ldjson': 'application/ld+json',
};

const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Address-bar test</title>
<button id=go style="font-size:1.4em;padding:.6em 1em">Run address-bar test</button><pre id=out></pre><script>
const out = document.getElementById('out');
const label = new URLSearchParams(location.search).get('b') || '';
document.getElementById('go').onclick = async () => {
  const w = window.open('about:blank', 'navtest');
  const results = [];
  for (const p of Object.keys(${JSON.stringify(TYPES)})) {
    const target = location.origin + p;
    w.location.href = target;
    let r = { path: p, outcome: 'not rendered (likely downloaded)' };
    for (let i = 0; i < 40; i++) {
      await new Promise(f => setTimeout(f, 100));
      try {
        if (w.location.href === target && w.document.readyState === 'complete' && w.document.body) {
          r = { path: p, outcome: 'displayed', documentContentType: w.document.contentType,
                bodyText: w.document.body.innerText.slice(0, 120) };
          break;
        }
      } catch (e) { r.error = String(e); }
    }
    try { r.finalHref = w.location.href; } catch (e) {}
    results.push(r);
    out.textContent += p + ': ' + r.outcome + '\\n';
  }
  w.close();
  const payload = { label, userAgent: navigator.userAgent, results };
  await fetch('/results?b=' + encodeURIComponent(label), { method: 'POST', body: JSON.stringify(payload) });
  out.textContent += 'DONE (posted)\\n' + JSON.stringify(payload, null, 1);
};
</script>`;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (TYPES[u.pathname]) {
    console.log('NAV', u.pathname, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': TYPES[u.pathname] });
    return res.end(JSON.stringify({ '@context': 'https://www.w3.org/ns/lws/v1', '@id': u.pathname, type: 'Container', servedAs: TYPES[u.pathname] }));
  }
  if (req.method === 'POST' && u.pathname === '/results') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      const d = JSON.parse(body);
      const name = (u.searchParams.get('b') || 'ua-' + Date.now()).replace(/[^A-Za-z0-9_-]/g, '');
      fs.writeFileSync(path.join(__dirname, 'results-nav-' + name + '.json'), JSON.stringify(d, null, 2));
      console.log('RESULTS', name, d.results.map(r => r.path + '=' + r.outcome).join(' '));
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(PORT, '127.0.0.1');
console.log('listening', PORT);
