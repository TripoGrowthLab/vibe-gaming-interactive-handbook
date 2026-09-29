// Opens a lab page from tools/lab in the installed Chrome via the Vite dev server and prints window.__result.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const page_ = process.argv[2], shot = process.argv[3];
const server = await createServer({ server: { port: 4318, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 900) } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'log') console.log('[page]', m.text()); });
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://localhost:4318/tools/lab/${page_}${process.env.Q ?? ''}`);
await page.waitForFunction(() => window.__result !== undefined, null, { timeout: 600000 });
if (shot) await page.screenshot({ path: shot });
const result = await page.evaluate(() => window.__result);
if (process.env.OUT) (await import('node:fs')).writeFileSync(process.env.OUT, JSON.stringify(result));
else console.log(JSON.stringify(result, null, 1));
if (errs.length) console.log('ERRORS:', errs);
await browser.close(); await server.close();
