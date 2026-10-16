// Public-HTTPS variant of cors-test.js + nav-self.js, for running behind two tunnels (two distinct HTTPS origins).
// PAGE_ORIGIN / API_ORIGIN are the public https origins of the page port (8011) and API port (8012).
// The page auto-runs the fetch matrix, then offers a one-tap address-bar test; both post results back.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PAGE_ORIGIN = process.env.PAGE_ORIGIN;
const API_ORIGIN = process.env.API_ORIGIN;
const OUT = path.join(__dirname, 'public-results');
fs.mkdirSync(OUT, { recursive: true });
const PROFILE_CT = 'application/ld+json; profile="https://www.w3.org/ns/lws/v1"';
const NAV = {
  '/nav/profile': PROFILE_CT,
  '/nav/lws': 'application/lws+json',
  '/nav/ldjson': 'application/ld+json',
};
const preflights = {};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const mode = u.searchParams.get('mode');
  const id = u.searchParams.get('id');
  // Echo the page origin only (not '*'), as a real deployment would.
  const cors = { 'Access-Control-Allow-Origin': PAGE_ORIGIN, 'Vary': 'Origin', 'Access-Control-Max-Age': '0' };
  if (req.method === 'OPTIONS') {
    preflights[id] = { method: req.headers['access-control-request-method'], headers: req.headers['access-control-request-headers'] || null };
    console.log('PREFLIGHT', mode, id, JSON.stringify(preflights[id]));
    if (mode === 'none') { res.writeHead(404); return res.end(); }
    if (mode === 'explicit') Object.assign(cors, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Accept, Content-Type' });
    if (mode === 'wildcard') Object.assign(cors, { 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    res.writeHead(204, cors);
    return res.end();
  }
  if (u.pathname === '/preflights') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(preflights));
  }
  req.resume();
  req.on('end', () => {
    console.log(req.method, mode, id, 'origin=' + req.headers.origin, 'accept=' + req.headers.accept, 'ct=' + (req.headers['content-type'] || ''));
    res.writeHead(200, { ...cors, 'Content-Type': PROFILE_CT });
    res.end(JSON.stringify({ '@id': 'urn:x', accept: req.headers.accept, contentType: req.headers['content-type'] || null }));
  });
}).listen(8012, '127.0.0.1');

const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>LWS profile CORS test</title>
<p>This page tests cross-origin fetches with profiled JSON-LD media types, then (on tap) address-bar navigation. Results are posted back to the test server.</p>
<button id=go disabled style="font-size:1.3em;padding:.6em 1em">Run address-bar test</button>
<pre id=out>running fetch tests…\n</pre><script>
const API = ${JSON.stringify(API_ORIGIN)} + '/r';
const P = ${JSON.stringify(PROFILE_CT)};
const B = new URLSearchParams(location.search).get('b') || '';
const out = document.getElementById('out');
const post = (kind, payload) => fetch('/results?kind=' + kind + '&b=' + encodeURIComponent(B), { method: 'POST', body: JSON.stringify(payload) });
const cases = [
  ['GET  Accept ld+json;profile="url" (quoted)', 'GET', { Accept: P }],
  ['GET  Accept ld+json;profile=url (unquoted)', 'GET', { Accept: 'application/ld+json;profile=https://www.w3.org/ns/lws/v1' }],
  ['GET  Accept application/lws+json', 'GET', { Accept: 'application/lws+json' }],
  ['GET  Accept application/ld+json', 'GET', { Accept: 'application/ld+json' }],
  ['GET  no custom headers (read profiled response CT)', 'GET', {}],
  ['POST Content-Type ld+json;profile="url"', 'POST', { 'Content-Type': P }],
  ['POST Content-Type application/lws+json', 'POST', { 'Content-Type': 'application/lws+json' }],
  ['POST Content-Type text/plain (control)', 'POST', { 'Content-Type': 'text/plain' }],
];
(async () => {
  const results = [];
  const run = Math.random().toString(36).slice(2, 8);
  let n = 0;
  for (const mode of ['none', 'explicit', 'wildcard']) for (const [name, method, headers] of cases) {
    const id = run + '-' + mode + '-' + (n++);
    const r = { mode, name, id };
    try {
      const res = await fetch(API + '?mode=' + mode + '&id=' + id, { method, headers, body: method === 'POST' ? '{}' : undefined });
      r.ok = true; r.status = res.status; r.responseContentType = res.headers.get('content-type');
      r.body = await res.json();
    } catch (e) { r.ok = false; r.error = String(e); }
    results.push(r);
    out.textContent += mode.padEnd(9) + (r.ok ? 'OK   ' : 'FAIL ') + name + '\\n';
  }
  const pf = await (await fetch(${JSON.stringify(API_ORIGIN)} + '/preflights')).json();
  for (const r of results) r.preflight = pf[r.id] || null;
  await post('fetch', { label: B, pageOrigin: location.origin, apiOrigin: ${JSON.stringify(API_ORIGIN)}, isSecureContext, userAgent: navigator.userAgent, results });
  out.textContent += 'fetch tests DONE (posted)\\n';
  document.getElementById('go').disabled = false;
})();
document.getElementById('go').onclick = async () => {
  const w = window.open('about:blank', 'navtest');
  const results = [];
  for (const p of ${JSON.stringify(Object.keys(NAV))}) {
    const target = location.origin + p;
    w.location.href = target;
    let r = { path: p, outcome: 'not rendered (likely downloaded)' };
    for (let i = 0; i < 60; i++) {
      await new Promise(f => setTimeout(f, 100));
      try {
        if (w.location.href === target && w.document.readyState === 'complete' && w.document.body) {
          r = { path: p, outcome: 'displayed', documentContentType: w.document.contentType, bodyText: w.document.body.innerText.slice(0, 120) };
          break;
        }
      } catch (e) { r.error = String(e); }
    }
    results.push(r);
    out.textContent += p + ': ' + r.outcome + '\\n';
  }
  w.close();
  await post('nav', { label: B, userAgent: navigator.userAgent, results });
  out.textContent += 'address-bar test DONE (posted)\\n';
};
</script>`;

let written = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (NAV[u.pathname]) {
    console.log('NAV', u.pathname, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': NAV[u.pathname] });
    return res.end(JSON.stringify({ '@context': 'https://www.w3.org/ns/lws/v1', '@id': PAGE_ORIGIN + u.pathname, type: 'Container', servedAs: NAV[u.pathname] }));
  }
  if (req.method === 'POST' && u.pathname === '/results') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      if (written++ > 200) { res.writeHead(429); return res.end(); }
      let d; try { d = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(); }
      const kind = u.searchParams.get('kind') === 'nav' ? 'nav' : 'fetch';
      const label = (u.searchParams.get('b') || 'ua').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'ua';
      const file = path.join(OUT, kind + '-' + label + '-' + Date.now() + '.json');
      fs.writeFileSync(file, JSON.stringify(d, null, 2));
      console.log('RESULTS', kind, label, String(d.userAgent).slice(0, 120));
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(8011, '127.0.0.1');
console.log('page', PAGE_ORIGIN, '-> :8011; api', API_ORIGIN, '-> :8012');
