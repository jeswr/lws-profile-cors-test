// Sanity check: drive nav-self.js page in Chrome by clicking the button, to validate the popup method.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false });
  const p = await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8004/?b=Chrome-selfcheck');
  await p.click('#go');
  await p.waitForFunction(() => document.getElementById('out').textContent.includes('DONE'), null, { timeout: 30000 });
  await b.close();
})();
