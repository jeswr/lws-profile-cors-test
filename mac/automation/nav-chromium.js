// Address-bar navigation check for Chromium-based browsers via Playwright (real installed binaries).
// Usage: node nav-chromium.js <Name> <executablePath> <baseUrl> <outFile>
const { chromium } = require('playwright');
const fs = require('fs');

const [name, exe, base, out] = process.argv.slice(2);
const PATHS = ['/profile', '/lws', '/ldjson'];

(async () => {
  const opts = { executablePath: exe, headless: false, args: ['--no-first-run', '--no-default-browser-check'] };
  // Vivaldi rejects extra browser contexts, so fall back to one persistent context with a temp profile.
  const persist = process.env.PERSIST === '1';
  const browser = persist ? null : await chromium.launch(opts);
  const shared = persist ? await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/lws-cors/auto/prof-'), { ...opts, acceptDownloads: true }) : null;
  const version = persist ? shared.browser() && shared.browser().version() : browser.version();
  const results = [];
  for (const p of PATHS) {
    const context = persist ? shared : await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const r = { path: p, url: base + p };
    let download = null;
    page.on('download', d => { download = d; });
    try {
      const res = await page.goto(base + p, { waitUntil: 'load', timeout: 15000 });
      r.status = res && res.status();
      r.responseContentType = res && res.headers()['content-type'];
    } catch (e) { r.gotoError = String(e.message).split('\n')[0]; }
    await page.waitForTimeout(1500);
    if (download) {
      r.outcome = 'download';
      r.suggestedFilename = download.suggestedFilename();
    } else {
      r.documentContentType = await page.evaluate(() => document.contentType).catch(() => null);
      r.bodyText = (await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')).slice(0, 120);
      r.outcome = r.bodyText.includes('"@id"') || r.bodyText.includes('servedAs') ? 'displayed' : 'other';
    }
    results.push(r);
    if (persist) await page.close(); else await context.close();
  }
  if (persist) await shared.close(); else await browser.close();
  fs.writeFileSync(out, JSON.stringify({ browser: name, version, base, results }, null, 2));
  console.log(name, version, results.map(r => r.path + '=' + r.outcome).join(' '));
})().catch(e => { console.error(name, 'FAILED', e.message.split('\n')[0]); process.exit(1); });
