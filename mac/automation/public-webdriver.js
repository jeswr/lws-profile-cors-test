// Drive the public tunnel page in Firefox (geckodriver) or Safari (safaridriver).
// Usage: node public-webdriver.js <firefox|safari> <Name> <pageUrl>
const { Builder, By } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const [kind, name, url] = process.argv.slice(2);
(async () => {
  let builder = new Builder().forBrowser(kind);
  if (kind === 'firefox') builder = builder
    .setFirefoxOptions(new firefox.Options().setBinary('/Applications/Firefox.app/Contents/MacOS/firefox'))
    .setFirefoxService(new firefox.ServiceBuilder('/opt/homebrew/bin/geckodriver'));
  const d = await builder.build();
  const out = () => d.executeScript("return document.getElementById('out').textContent");
  await d.get(url + '/?b=' + name);
  await d.wait(async () => (await out()).includes('fetch tests DONE'), 90000);
  await d.findElement(By.id('go')).click();
  await d.wait(async () => (await out()).includes('address-bar test DONE'), 90000);
  console.log(name, (await d.getCapabilities()).get('browserVersion'), 'done');
  await d.quit();
})().catch(e => { console.error(name, 'FAILED', e.message.split('\n')[0]); process.exit(1); });
