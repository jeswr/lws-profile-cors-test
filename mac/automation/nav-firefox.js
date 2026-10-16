// Address-bar navigation check for the installed Firefox via geckodriver (selenium-webdriver).
// Usage: node nav-firefox.js <baseUrl> <outFile>
const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
const DL = fs.mkdtempSync('/tmp/lws-cors/auto/ffdl-');
(async () => {
  const opts = new firefox.Options()
    .setBinary('/Applications/Firefox.app/Contents/MacOS/firefox')
    .setPreference('browser.download.dir', DL)
    .setPreference('browser.download.folderList', 2)
    .setPreference('browser.download.useDownloadDir', true)
    .setPreference('browser.download.always_ask_before_handling_new_types', false);
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts)
    .setFirefoxService(new firefox.ServiceBuilder('/opt/homebrew/bin/geckodriver')).build();
  const caps = await driver.getCapabilities();
  const results = [];
  for (const p of ['/profile', '/lws', '/ldjson']) {
    const before = new Set(fs.readdirSync(DL));
    const r = { path: p, url: base + p };
    try { await driver.get(base + p); } catch (e) { r.getError = String(e.message).split('\n')[0]; }
    await driver.sleep(2000);
    r.currentUrl = await driver.getCurrentUrl();
    r.documentContentType = await driver.executeScript('return document.contentType').catch(() => null);
    r.jsonViewer = await driver.executeScript("return !!document.querySelector('#json-tab, .jsonPanelBox, #viewer, .tabs-menu')").catch(() => null);
    r.bodyText = String(await driver.executeScript('return document.body ? document.body.innerText : ""').catch(() => '')).slice(0, 120);
    r.newDownloads = fs.readdirSync(DL).filter(f => !before.has(f));
    r.outcome = r.newDownloads.length ? 'download' : (r.jsonViewer ? 'displayed (JSON viewer)' : (r.bodyText.includes('servedAs') ? 'displayed (raw text)' : 'other'));
    results.push(r);
  }
  await driver.quit();
  fs.writeFileSync(out, JSON.stringify({ browser: 'Firefox', version: caps.get('browserVersion'), base, results }, null, 2));
  console.log('Firefox', caps.get('browserVersion'), results.map(r => r.path + '=' + r.outcome).join(' '));
})().catch(e => { console.error('Firefox FAILED', e.message.split('\n')[0]); process.exit(1); });
