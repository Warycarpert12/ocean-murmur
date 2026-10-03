// QA v24: где JS тратит время кадра — выборочный профиль процессора (CDP Profiler) за N секунд живого мира, телефонный
// экран, CPU ×4. Печатает функции по собственному времени (доля от всего JS) и сборку мусора.
//   node jsprof.mjs <адрес сайта> <имя> [секунд=10] [сутки: day|night] [CPU ×4]
import { launch, sleep, phone } from './cdp.mjs';
const [url, name, secs = '10', tod = 'day', cpu = '4'] = process.argv.slice(2);
const s = await launch({ gpu: true });
await phone(s, { w: 812, h: 360, dpr: 3.5 });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', 'high'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=${tod === 'night' ? .02 : .5}`);
await s.until('window.__om?.visual?.assets', 90000);
await sleep(5000);
await s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.camera.position.set(0, 73, 75); v.controls.target.set(0, 2, 0); v.controls.update(); })()`);
await s.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
await sleep(2000);
await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 200 }); await s.send('Profiler.start');
await sleep(+secs * 1000);
const { profile } = await s.send('Profiler.stop');
const nodes = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(); let total = 0, idle = 0;
const dts = profile.timeDeltas;
profile.samples.forEach((id, i) => { const n = nodes.get(id), f = n.callFrame, dt = (dts[i + 1] ?? dts[i]) / 1000;
  if (/^\((idle|program)\)$/.test(f.functionName)) { idle += dt; return; }
  const k = `${f.functionName || '(аноним)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt); total += dt; });
console.log(`${name}: JS ${(total / 1000).toFixed(1)} с из ${secs} с (простой ${(idle / 1000).toFixed(1)} с)`);
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${(100 * t / total).toFixed(1).padStart(5)}%  ${(t / +secs).toFixed(1).padStart(6)} мс/с  ${k}`);
s.close(); process.exit(0);
