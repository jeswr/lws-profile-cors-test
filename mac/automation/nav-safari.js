// Address-bar navigation + fetch matrix for macOS Safari via safaridriver (selenium-webdriver).
// Usage: node nav-safari.js <navBase> <outFile>
const { Builder } = require('selenium-webdriver');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
(async () => {
  const driver = await new Builder().forBrowser('safari').build();
  const caps = await driver.getCapabilities();
  const results = [];
  for (const p of ['/profile', '/lws', '/ldjson']) {
    const r = { path: p, url: base + p };
    try { await driver.get(base + p); } catch (e) { r.getError = String(e.message).split('\n')[0]; }
    await driver.sleep(2000);
    r.currentUrl = await driver.getCurrentUrl();
    r.documentContentType = await driver.executeScript('return document.contentType').catch(e => 'ERR ' + e.message.split('\n')[0]);
    r.bodyText = String(await driver.executeScript('return document.body ? document.body.innerText : ""').catch(() => '')).slice(0, 120);
    r.outcome = r.currentUrl === base + p && r.bodyText.includes('servedAs') ? 'displayed' : 'other (possibly downloaded)';
    results.push(r);
  }
  // Also run the fetch matrix page (port 8001) and wait for it to post results.
  await driver.get('http://127.0.0.1:8001/?b=Safari-webdriver');
  await driver.wait(async () => (await driver.executeScript("return document.getElementById('out').textContent")).startsWith('DONE'), 60000);
  await driver.quit();
  fs.writeFileSync(out, JSON.stringify({ browser: 'Safari', version: caps.get('browserVersion'), base, results }, null, 2));
  console.log('Safari', caps.get('browserVersion'), results.map(r => r.path + '=' + r.outcome).join(' '));
})().catch(e => { console.error('Safari FAILED', e.message.split('\n')[0]); process.exit(1); });
