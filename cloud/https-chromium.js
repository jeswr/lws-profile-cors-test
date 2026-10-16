const https = require('https'), fs = require('fs');
const { chromium } = require('playwright');
const P = 'https://www.w3.org/ns/lws/v1', opts = { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') };
const body = JSON.stringify({"@context":"https://www.w3.org/ns/lws/v1","id":"https://pod.test:8443/c/","type":"Container","items":[]});
let log = [];
https.createServer(opts, (req, res) => {
  const u = new URL(req.url, 'https://x'); log.push(req.method + ' ' + req.url);
  const allow = u.searchParams.get('cors') !== 'none';
  if (allow) res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { if (allow) { res.setHeader('Access-Control-Allow-Headers','accept, content-type'); res.setHeader('Access-Control-Allow-Methods','GET, PUT'); } res.statusCode = 204; return res.end(); }
  res.setHeader('Content-Type', u.searchParams.get('ct') || `application/ld+json; profile="${P}"`); res.end(body);
}).listen(8443);
https.createServer(opts, (q, r) => { r.setHeader('content-type','text/html'); r.end('<p>app'); }).listen(9443);
(async () => {
  const b = await chromium.launch({ args: ['--host-resolver-rules=MAP pod.test 127.0.0.1, MAP app.test 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'] });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true }); const p = await ctx.newPage();
  // 1. Navigation (address bar) to a public container
  for (const ct of [`application/ld+json; profile="${P}"`, 'application/lws+json', 'application/ld+json']) {
    let dl = false; p.once('download', () => dl = true);
    try { const r = await p.goto('https://pod.test:8443/c/?ct=' + encodeURIComponent(ct)); await p.waitForTimeout(300);
      const txt = await p.evaluate(() => document.body ? document.body.innerText.slice(0, 60) : '(no body)');
      console.log(`NAV ${ct}: status=${r.status()} download=${dl} shown=${JSON.stringify(txt)}`);
    } catch (e) { console.log(`NAV ${ct}: ${dl ? 'DOWNLOADED' : 'ERR ' + e.message.split('\n')[0]}`); }
  }
  // 2. Scripts from https://app.test (secure context) to https://pod.test
  await p.goto('https://app.test:9443/');
  const cases = [['GET, no custom headers', 'GET', {}, ''], ['GET Accept lws+json', 'GET', {Accept:'application/lws+json'}, ''],
    ['GET Accept ld+json;profile', 'GET', {Accept:`application/ld+json; profile="${P}"`}, ''],
    ['GET Accept ld+json;profile, server ignores preflight', 'GET', {Accept:`application/ld+json; profile="${P}"`}, '&cors=none'],
    ['PUT CT ld+json;profile', 'PUT', {'Content-Type':`application/ld+json; profile="${P}"`}, '']];
  for (const [n, m, h, q] of cases) { log = [];
    const r = await p.evaluate(async ([u, m, h]) => { try { const res = await fetch(u, {method: m, headers: h, body: m === 'PUT' ? '{}' : undefined});
      return `OK ct=${res.headers.get('content-type')} body=${(await res.text()).slice(0, 30)}`; } catch (e) { return 'REJECTED ' + e.message; } },
      [`https://pod.test:8443/c/?n=${encodeURIComponent(n)}${q}`, m, h]);
    console.log(`SCRIPT ${n}: preflight=${log.some(l => l.startsWith('OPTIONS'))} -> ${r}`);
  }
  console.log('secure context:', await p.evaluate(() => isSecureContext));
  await b.close(); process.exit(0);
})();
