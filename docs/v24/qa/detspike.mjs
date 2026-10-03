// QA v24: редкие долгие кадры на 123–149-й с прогона detframe (один и тот же мир, шаг 1/60, CPU ×4). Кадр разложен на
// части: шаг мира, каждый вид зверя (_stepAgent), путь в обход мели (_via), расталкивание, флора, звуки рядом, наведение,
// журнал, отрисовка; и куча JS до/после (сборка мусора). Печатает долгие кадры (> 50 мс) с частями и численностью видов.
//   node detspike.mjs <адрес сайта> <имя> [секунд=150] [CPU ×4]
import { launch, sleep } from './cdp.mjs';
const [url, name, secs = '150', cpu = '4'] = process.argv.slice(2);
const s = await launch({ gpu: true, args: ['--enable-precise-memory-info'] });
await s.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame = () => 0' });
await s.goto(`${url}?noaudio=1&qa&seed=7&rseed=7&tod=.5`);
await s.until('window.__om?.visual?.assets && !document.body.classList.contains("gate-open")', 180000);
await sleep(2000);
await s.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
const r = await s.eval(`(async () => { const { world, visual: v } = window.__om, acc = {}, rows = [];
  const W = (obj, fn, key) => { const f = obj[fn].bind(obj); obj[fn] = (...a) => { const t = performance.now(); try { return f(...a); } finally { const k = typeof key === 'function' ? key(...a) : key; acc[k] = (acc[k] || 0) + performance.now() - t; } }; };
  W(world, 'step', 'мир'); W(v, '_stepAgent', o => 'зверь:' + o.sp); W(v, '_via', o => 'путь:' + o.sp); W(v, '_separate', 'расталкивание');
  W(v, '_nearSounds', 'звуки рядом'); W(v, '_floraAvoid', 'флора'); W(v, '_updateHover', 'наведение'); W(v, '_stepLog', 'журнал');
  if (v._stepAmbient) W(v, '_stepAmbient', 'стайки'); W(v, '_stepFollow', 'слежение'); W(v.renderer, 'render', 'отрисовка');
  let wt = 0;
  for (let i = 0; i < ${+secs * 60}; i++) {
    await new Promise(r => setTimeout(r, 0));
    for (const k in acc) delete acc[k];
    const h0 = performance.memory.usedJSHeapSize, t0 = performance.now();
    world.step(1 / 60); v.frame(1 / 60, wt += 1 / 60, 1 / 60);
    const d = performance.now() - t0, h1 = performance.memory.usedJSHeapSize;
    if (d > 50 && i > 600) { const census = {}; for (const o of v.agents.values()) census[o.sp] = (census[o.sp] || 0) + 1;
      rows.push((i / 60).toFixed(2) + 'с ' + d.toFixed(0) + ' мс | ' + Object.entries(acc).filter(([, x]) => x > 2).sort((a, b) => b[1] - a[1]).map(([k, x]) => k + ' ' + x.toFixed(0)).join(', ')
        + ' | куча ' + ((h1 - h0) / 1048576).toFixed(1) + ' МБ | ' + Object.entries(census).map(([k, n]) => k + ':' + n).join(' ')); }
  }
  return rows; })()`);
console.log(`${name}: долгих кадров ${r.length}`); for (const x of r.slice(0, 200)) console.log('  ' + x);
s.close(); process.exit(0);
