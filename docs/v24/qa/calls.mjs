// вызовы отрисовки по частям сцены и их цена в JS (обёртка renderer.renderBufferDirect), CPU ×4
import { launch, phone, sleep } from './cdp.mjs';
const [url, cpu = "4", spawn = ""] = process.argv.slice(2);
const s = await launch({ gpu: true });
await phone(s, { w: 801, h: 373, dpr: 3.375, sw: 843, sh: 374 });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', 'high'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.5&spawn=${spawn}`);
await s.until('window.__om?.visual?.assets', 90000); await sleep(5000);
await s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.camera.position.set(30, 32, 100); v.controls.target.set(0, 3, 15); v.controls.update(); })()`);
await s.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
const r = await s.eval(`(async () => { const v = window.__om.visual, R = v.renderer, names = new Map(), cat = new Map(), T = new Map(), N = new Map();
  for (const [k, x] of Object.entries(v)) { if (x?.isObject3D) names.set(x, k); if (Array.isArray(x)) x.forEach(y => { if (y?.isObject3D) names.set(y, k); else if (y?.m?.isObject3D) names.set(y.m, k); }); }
  const label = o => { if (cat.has(o)) return cat.get(o); let p = o, L = null;
    while (p && !L) { for (const a of v.agents.values()) if (a.obj === p || a.fish?.some(f => f.obj === p)) L = 'зверь:' + a.sp; if (!L && names.has(p)) L = names.get(p); p = p.parent; }
    L ||= (o.material?.type || '?') + ':' + o.type; cat.set(o, L); return L; };
  const orig = R.renderBufferDirect; let on = false;
  R.renderBufferDirect = function (cam, sc, g, m, o, gr) { if (!on) return orig.apply(this, arguments); const t = performance.now(); orig.apply(this, arguments); const L = label(o); T.set(L, (T.get(L) || 0) + performance.now() - t); N.set(L, (N.get(L) || 0) + 1); };
  let fr = 0, tr = 0; const of = v.frame; v.frame = function (...a) { if (on) fr++; const t = performance.now(); const x = of.apply(this, a); if (on) tr += performance.now() - t; return x; };
  const ou = v.scene.updateMatrixWorld.bind(v.scene); let tu = 0; v.scene.updateMatrixWorld = function (f) { const t = performance.now(); ou(f); if (on) tu += performance.now() - t; };
  let nObj = 0; v.scene.traverse(() => nObj++);
  await new Promise(r => setTimeout(r, 1500)); on = true; await new Promise(r => setTimeout(r, 6000)); on = false;
  return { fr, frameMs: tr / fr, matrixMs: tu / fr, nObj, rows: [...T].map(([k, t]) => [k, t / fr, N.get(k) / fr]).sort((a, b) => b[1] - a[1]) }; })()`);
console.log(`кадров ${r.fr}, кадр visual.frame ${r.frameMs.toFixed(2)} мс, updateMatrixWorld ${r.matrixMs.toFixed(2)} мс, объектов в сцене ${r.nObj}`);
let sum = 0, cs = 0; for (const [k, t, n] of r.rows) { sum += t; cs += n; console.log(`${t.toFixed(3).padStart(7)} мс  ${n.toFixed(1).padStart(5)} вызовов  ${k}`); }
console.log(`итого отрисовка ${sum.toFixed(2)} мс, ${cs.toFixed(0)} вызовов`);
s.close(); process.exit(0);
