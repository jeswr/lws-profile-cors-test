// Usage: node cors-matrix.js  -> then open http://127.0.0.1:8001/?b=<BrowserName> in each browser.
// Results are printed and saved to results-<BrowserName>.json in the current folder.
const http = require('http'), fs = require('fs');
const P = 'https://www.w3.org/ns/lws/v1';
const seen = new Map(); // case id -> {options:bool, actual:bool}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), mode = u.searchParams.get('mode'), id = u.searchParams.get('id');
  if (u.pathname === '/seen') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.end(JSON.stringify(seen.get(id) || {})); }
  const s = seen.get(id) || {}; if (req.method === 'OPTIONS') s.options = true; else s.actual = true; seen.set(id, s);
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8001');
  if (req.method === 'OPTIONS') {
    if (mode !== 'none') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST');
      res.setHeader('Access-Control-Allow-Headers', mode === 'wildcard' ? '*' : 'accept, content-type');
    }
    res.statusCode = 204; return res.end();
  }
  res.setHeader('Content-Type', `application/ld+json; profile="${P}"`); res.end('{}');
}).listen(8002);
const page = `<!doctype html><pre id=o>running…</pre><script>
const P=${JSON.stringify(P)}, b=new URLSearchParams(location.search).get('b')||'unknown';
const cases=[['GET Accept: application/lws+json','GET',{Accept:'application/lws+json'}],
 ['GET Accept: application/ld+json','GET',{Accept:'application/ld+json'}],
 ['GET Accept: application/ld+json; profile="URL"','GET',{Accept:'application/ld+json; profile="'+P+'"'}],
 ['GET Accept: application/ld+json;profile=URL (unquoted)','GET',{Accept:'application/ld+json;profile='+P}],
 ['PUT Content-Type: application/lws+json','PUT',{'Content-Type':'application/lws+json'}],
 ['PUT Content-Type: application/ld+json; profile="URL"','PUT',{'Content-Type':'application/ld+json; profile="'+P+'"'}]];
(async()=>{const out=[];const run=Date.now();
 for(const mode of ['none','explicit','wildcard'])for(const [name,method,headers] of cases){
  const id=run+'-'+mode+'-'+out.length, url='http://localhost:8002/r?mode='+mode+'&id='+id;let r;
  try{const res=await fetch(url,{method,headers,body:method==='GET'?undefined:'{}'});r='OK, response Content-Type readable: '+res.headers.get('content-type');}catch(e){r='REJECTED ('+e.message+')';}
  const s=await (await fetch('http://localhost:8002/seen?id='+id)).json();
  out.push({mode,name,preflight:!!s.options,result:r});}
 document.getElementById('o').textContent=JSON.stringify(out,null,1);
 await fetch('/result?b='+encodeURIComponent(b),{method:'POST',body:JSON.stringify({ua:navigator.userAgent,out})});
 document.title='DONE';})();</script>`;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/result') { let d=''; req.on('data',c=>d+=c); return req.on('end',()=>{ const b=u.searchParams.get('b');
    fs.writeFileSync(`results-${b}.json`, d); const j=JSON.parse(d); console.log(`\n== ${b} | ${j.ua}`);
    for (const o of j.out) console.log(`[${o.mode}] ${o.name}: preflight=${o.preflight} -> ${o.result}`); res.end('ok'); }); }
  res.setHeader('Content-Type','text/html'); res.end(page);
}).listen(8001, () => console.log('Open http://127.0.0.1:8001/?b=<BrowserName> in each browser'));
