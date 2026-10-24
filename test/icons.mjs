import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const svg = fs.readFileSync('icons/icon.svg', 'utf8');
const b = await pw.chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `icons/icon-${size}.png`, omitBackground: true });
}
await b.close();
