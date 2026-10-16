// CORS test: do media types with a URL profile parameter cause problems cross-origin?
// Port 8002 = cross-origin API (modes: none | explicit | wildcard preflight handling).
// Port 8001 = test page; posts results back to /results?b=<name>.
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PROFILE_CT = 'application/ld+json; profile="https://www.w3.org/ns/lws"';
const preflights = {}; // id -> request headers seen in OPTIONS

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const mode = u.searchParams.get('mode');
  const id = u.searchParams.get('id');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Max-Age': '0' };
  if (req.method === 'OPTIONS') {
    preflights[id] = {
      method: req.headers['access-control-request-method'],
      headers: req.headers['access-control-request-headers'] || null,
    };
    console.log('PREFLIGHT', mode, id, JSON.stringify(preflights[id]));
    if (mode === 'none') { res.writeHead(404); return res.end(); }
    if (mode === 'explicit')
      Object.assign(cors, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Accept, Content-Type' });
    if (mode === 'wildcard')
      Object.assign(cors, { 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    res.writeHead(204, cors);
    return res.end();
  }
  if (u.pathname === '/preflights') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(preflights));
  }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    console.log(req.method, mode, id, 'accept=' + req.headers.accept, 'ct=' + (req.headers['content-type'] || ''));
    res.writeHead(200, { ...cors, 'Content-Type': PROFILE_CT });
    res.end(JSON.stringify({ '@id': 'urn:x', accept: req.headers.accept, contentType: req.headers['content-type'] || null }));
  });
}).listen(8002, '127.0.0.1');

const PAGE = `<!doctype html><meta charset=utf-8><title>CORS profile test</title><pre id=out>running…</pre><script>
const API = 'http://127.0.0.1:8002/r';
const P = 'application/ld+json; profile="https://www.w3.org/ns/lws"';
const B = new URLSearchParams(location.search).get('b') || 'unknown';
const cases = [
  ['GET  Accept ld+json;profile="url" (quoted)', 'GET', { Accept: P }],
  ['GET  Accept ld+json;profile=url (unquoted)', 'GET', { Accept: 'application/ld+json;profile=https://www.w3.org/ns/lws' }],
  ['GET  Accept application/lws+json', 'GET', { Accept: 'application/lws+json' }],
  ['GET  Accept application/ld+json', 'GET', { Accept: 'application/ld+json' }],
  ['GET  no custom headers (read profiled response CT)', 'GET', {}],
  ['POST Content-Type ld+json;profile="url"', 'POST', { 'Content-Type': P }],
  ['POST Content-Type application/lws+json', 'POST', { 'Content-Type': 'application/lws+json' }],
  ['POST Content-Type text/plain (control)', 'POST', { 'Content-Type': 'text/plain' }],
];
(async () => {
  const results = [];
  let n = 0;
  for (const mode of ['none', 'explicit', 'wildcard']) for (const [name, method, headers] of cases) {
    const id = B + '-' + mode + '-' + (n++);
    const r = { mode, name, id };
    try {
      const res = await fetch(API + '?mode=' + mode + '&id=' + id, { method, headers, body: method === 'POST' ? '{}' : undefined });
      r.ok = true; r.status = res.status; r.responseContentType = res.headers.get('content-type');
      r.body = await res.json();
    } catch (e) { r.ok = false; r.error = String(e); }
    results.push(r);
  }
  const pf = await (await fetch('http://127.0.0.1:8002/preflights')).json();
  for (const r of results) r.preflight = pf[r.id] || null;
  const payload = { userAgent: navigator.userAgent, results };
  await fetch('/results?b=' + encodeURIComponent(B), { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('out').textContent = 'DONE\\n' + JSON.stringify(payload, null, 1);
})();
</script>`;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/results') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const name = (u.searchParams.get('b') || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
      fs.writeFileSync(path.join(DIR, 'results-' + name + '.json'), JSON.stringify(JSON.parse(body), null, 2));
      console.log('RESULTS', name);
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(8001, '127.0.0.1');
console.log('listening 8001 (page) / 8002 (api)');
