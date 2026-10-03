// Мини-пульт для Edge по CDP (без Playwright): запуск безголового Edge, вкладка, команды, evaluate, снимок.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ port = 9333 + Math.floor(Math.random() * 500), args = [], gpu = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'edgeqa-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-extensions', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${dir}`,
    `--remote-debugging-port=${port}`, ...(gpu ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...args, 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 100 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const s = await session(page.webSocketDebuggerUrl);
  s.close = () => { try { s.ws.close(); } catch {} proc.kill(); };
  return s;
}

async function session(url) {
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), handlers = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const [r, j] = wait.get(d.id); wait.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) for (const h of handlers) h(d);
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, [r, j]); ws.send(JSON.stringify({ id: i, method, params })); });
  const s = {
    ws, send, on: h => handlers.push(h),
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async until(expr, ms = 90000, step = 200) { const t = Date.now(); while (Date.now() - t < ms) { if (await s.eval(`!!(${expr})`).catch(() => false)) return Date.now() - t; await sleep(step); } throw new Error('timeout: ' + expr); },
    async goto(u) { await send('Page.navigate', { url: u }); await sleep(300); await s.until('document.readyState === "complete"', 60000); },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async tapSel(sel) { const r = await s.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`); await s.tap(r[0], r[1]); },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); },
  };
  await send('Page.enable'); await send('Runtime.enable');
  s.on(d => { if (d.method === 'Runtime.exceptionThrown') console.log('  [pageerror]', d.params.exceptionDetails.exception?.description?.split('\n')[0]);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('  [console.error]', d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); });
  return s;
}

// телефон горизонтально: CSS-размер, плотность, экран; сенсор (pointer: coarse)
export async function phone(s, { w, h, dpr = 3, sw = w, sh = h }) {
  await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true, screenWidth: sw, screenHeight: sh,
    screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
