// бестиарий на телефоне: умещается ли окно, листается ли пальцем и колесом, «Мелкие обитатели» достижимы
import { launch, sleep, phone } from './cdp.mjs';
const [url, tag = 'x', w = '812', h = '360', inset = '0'] = process.argv.slice(2);
const s = await launch({ gpu: true });
await phone(s, { w: +w, h: +h, dpr: 3 });
if (+inset) await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--sa-l:${inset}px}'; document.head.append(st); });` });
await s.goto(url + '?qa&noaudio=1&seed=7'); await s.until('window.__omReady && window.__om?.visual?.assets', 60000); await sleep(2500);
await s.tapSel('#bst-btn'); await sleep(600);
const st = () => s.eval(`(() => { const b = document.getElementById('bst-body'), win = document.getElementById('bst-win').getBoundingClientRect(), hs = [...b.querySelectorAll('h4')];
  const last = hs[hs.length - 1].getBoundingClientRect(), br = b.getBoundingClientRect();
  return { win: [Math.round(win.top), Math.round(win.bottom), innerHeight], body: [b.clientHeight, b.scrollHeight, Math.round(b.scrollTop)], lastSection: hs[hs.length - 1].textContent, lastTop: Math.round(last.top), visibleBottom: Math.round(Math.min(br.bottom, innerHeight)) }; })()`);
console.log(tag, 'открыт:', JSON.stringify(await st()));
// палец: снизу вверх по списку
const r = await s.eval(`(() => { const b = document.getElementById('bst-body').getBoundingClientRect(); return [b.left + b.width / 2, Math.min(b.bottom, innerHeight) - 20, b.top + 30]; })()`);
for (let k = 0; k < 3; k++) {
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0], y: r[1] }] });
  for (let i = 1; i <= 10; i++) await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r[0], y: r[1] + (r[2] - r[1]) * i / 10 }] });
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
}
console.log(tag, 'после листания пальцем:', JSON.stringify(await st()));
await s.shot(`bst_${tag}.png`); s.close(); process.exit(0);
