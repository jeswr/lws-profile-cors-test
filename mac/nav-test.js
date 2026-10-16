// Serves a small JSON body under three Content-Types to check top-level navigation behaviour.
const http = require('http');
const TYPES = {
  '/profile': 'application/ld+json; profile="https://www.w3.org/ns/lws/v1"',
  '/lws': 'application/lws+json',
  '/ldjson': 'application/ld+json',
};
http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const ct = TYPES[p];
  if (!ct) { res.writeHead(404); return res.end(); }
  console.log(req.method, p, 'ua=' + req.headers['user-agent']);
  res.writeHead(200, { 'Content-Type': ct });
  res.end(JSON.stringify({ '@context': 'https://www.w3.org/ns/lws/v1', '@id': 'http://127.0.0.1:8003' + p, type: 'Container', servedAs: ct }));
}).listen(8003, '127.0.0.1');
console.log('listening 8003');
