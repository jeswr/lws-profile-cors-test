const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://127.0.0.1:8001/?b=Chromium-cloud');await p.waitForFunction(()=>document.title==='DONE');await b.close();})();
