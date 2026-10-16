// Drive the public tunnel page in a Chromium-based browser: auto fetch matrix, then click the address-bar test.
// Usage: node public-chromium.js <Name> <executablePath> <pageUrl>
const { chromium } = require('playwright');
const [name, exe, url] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: exe, headless: false, args: ['--no-first-run', '--no-default-browser-check'] });
  const p = await (await b.newContext()).newPage();
  await p.goto(url + '/?b=' + name);
  const done = t => p.waitForFunction(s => document.getElementById('out').textContent.includes(s), t, { timeout: 90000 });
  await done('fetch tests DONE');
  await p.click('#go');
  await done('address-bar test DONE');
  console.log(name, b.version(), 'done');
  await b.close();
})().catch(e => { console.error(name, 'FAILED', e.message.split('\n')[0]); process.exit(1); });
