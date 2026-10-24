import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const [,, url, out, w, h] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w || 960, height: +h || 1300 } });
p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto(url); await p.waitForTimeout(800); await p.screenshot({ path: out }); await b.close();
