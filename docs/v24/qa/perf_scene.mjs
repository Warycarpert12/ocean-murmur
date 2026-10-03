// QA v24: сколько стоит кадр — на видеокарте ПК (Edge = Chromium, ANGLE D3D11, без ограничения частоты кадров).
// Время видеокарты — таймеры EXT_disjoint_timer_query_webgl2 вокруг отрисовки сцены (с MSAA и мип-уровнями для свечения)
// и пост-обработки; JS кадра — world.step + visual.frame; частота и худшие 1% — по интервалам requestAnimationFrame.
// Камера неподвижна (вид облёта), мир один и тот же (?seed&rseed). «Что сколько стоит» — тот же кадр со скрытой частью
// сцены: разница времени видеокарты и вызовов отрисовки.
//   node perf_scene.mjs <адрес сайта> <имя> [экран: pc|phone] [сутки: day|night] [качество: high|low|lite] [разбор: 0|1] [CPU ×N]
import { launch, sleep, phone } from './cdp.mjs';
const [url, name, scr = 'phone', tod = 'day', q = 'high', parts = '0', cpu = '1'] = process.argv.slice(2);
const s = await launch({ gpu: true });
// телефон: экран HUAWEI Pura 70 Ultra 2844×1260 — 812×360 CSS при плотности 3.5; ПК — 1920×1080
if (scr === 'phone') await phone(s, { w: 812, h: 360, dpr: 3.5 });
else await s.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', '${q}'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}
  // таймеры видеокарты и интервалы кадров
  window.__pf = { iv: [], js: [], gs: [], gp: [], last: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => { const P = window.__pf, t0 = performance.now(); if (P.last) P.iv.push(t0 - P.last); P.last = t0; try { cb(ts); } finally { P.js.push(performance.now() - t0); } });` });
await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=${tod === 'night' ? .02 : .5}`);
await s.until('window.__om?.visual?.assets', 90000);
await sleep(5000);
// таймеры вокруг двух вызовов render (сцена → буфер, буфер → экран), камера — неподвижный вид облёта
await s.eval(`(() => { const v = window.__om.visual, R = v.renderer, gl = R.getContext(), X = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = window.__pf;
  v._freeCam = true; v.camera.position.set(0, 73, 75); v.controls.target.set(0, 2, 0); v.controls.update();
  const pend = []; P.hide = new Set();
  const render = R.render.bind(R);
  R.render = (sc, cam) => {
    const hid = []; if (sc === v.scene) for (const o of P.hide) if (o.visible) { o.visible = false; hid.push(o); }
    let qy = null; if (X) { qy = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, qy); }
    render(sc, cam);
    if (sc === v.scene) { const ri = R.info.render; P.calls = ri.calls; P.tris = ri.triangles + ri.points + ri.lines; }
    if (X) { gl.endQuery(X.TIME_ELAPSED_EXT); pend.push([qy, sc === v.scene ? 'gs' : 'gp']); }
    for (const o of hid) o.visible = true;
    for (let i = pend.length - 1; i >= 0; i--) { const [q, k] = pend[i]; if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(X.GPU_DISJOINT_EXT)) P[k].push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); pend.splice(i, 1); } }
  };
})()`);
if (+cpu > 1) await s.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
const measure = async (ms = 5000) => {
  await s.eval(`(() => { const P = window.__pf; P.iv = []; P.js = []; P.gs = []; P.gp = []; })()`); await sleep(ms);
  return s.eval(`(() => { const P = window.__pf, v = window.__om.visual, R = v.renderer, cv = R.domElement;
    const st = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? { avg: b.reduce((x, y) => x + y, 0) / n, p99: b[Math.min(n - 1, Math.floor(n * .99))] } : { avg: NaN, p99: NaN }; };
    const iv = st(P.iv), js = st(P.js), gs = st(P.gs), gp = st(P.gp);
    return { fps: 1000 / iv.avg, ft: iv.avg, p99: iv.p99, js: js.avg, gScene: gs.avg, gPost: gp.avg, calls: P.calls, tris: P.tris, progs: R.info.programs.length,
      buf: cv.width + '×' + cv.height + (v.rt.samples ? ' MSAA' + v.rt.samples : '') }; })()`);
};
const f = x => (x ?? NaN).toFixed(x >= 100 ? 0 : 1);
const row = (label, r) => console.log(`${label.padEnd(30)} ${f(r.fps).padStart(5)} к/с  кадр ${f(r.ft).padStart(5)} мс  1% ${f(r.p99).padStart(5)}  JS ${f(r.js).padStart(5)}  видеокарта: сцена ${f(r.gScene).padStart(5)} + пост ${f(r.gPost).padStart(4)} мс  вызовов ${String(r.calls).padStart(4)}  треуг. ${String(Math.round(r.tris / 1000)).padStart(5)}k  шейдеров ${r.progs}  буфер ${r.buf}`);
const base = await measure(6000);
row(`${name} ${scr} ${tod} ${q}${+cpu > 1 ? ' CPU×' + cpu : ''}`, base);
if (parts === '1') {
  // части сцены: скрыть и посмотреть разницу
  const GROUPS = {
    'флора (растения)': `v.flora || []`,
    'креветки (рои)': `[...v.agents.values()].filter(o => o.sp === 'shrimp_swarm').map(o => o.obj)`,
    'все звери': `[...v.agents.values()].map(o => o.obj).concat([...v.agents.values()].flatMap(o => (o.fish || []).map(f => f.obj)))`,
    'облака': `v.clouds || []`,
    'пальмы': `v.palms || []`,
    'рельеф (остров, дно)': `[v.terrain].filter(Boolean)`,
    'вода': `[v.water].filter(Boolean)`,
    'частицы, светлячки, мотыльки': `v.scene.children.filter(o => o.isPoints || (o.material && (o.material === v.mothMat || o.material === v.foamMat || o.material === v.curMat)))`,
    'дальний остров': `[v.farIsland].filter(Boolean)`,
  };
  for (const [label, expr] of Object.entries(GROUPS)) {
    await s.eval(`(() => { const v = window.__om.visual; window.__pf.hide = new Set(${expr}); })()`);
    const r = await measure(4000);
    console.log(`  без: ${label.padEnd(28)} видеокарта ${f(base.gScene + base.gPost - r.gScene - r.gPost).padStart(5)} мс (${(100 * (1 - (r.gScene + r.gPost) / (base.gScene + base.gPost))).toFixed(0).padStart(3)}%)  вызовов −${base.calls - r.calls}  треуг. −${Math.round((base.tris - r.tris) / 1000)}k  JS ${f(base.js - r.js)} мс`);
  }
  await s.eval(`window.__pf.hide = new Set()`);
  // сглаживание и мип-уровни для свечения
  await s.eval(`(() => { const v = window.__om.visual; v.rt.samples = 0; v.rt.dispose(); })()`); let r = await measure(4000);
  console.log(`  без: ${'сглаживания MSAA'.padEnd(28)} видеокарта ${f(base.gScene + base.gPost - r.gScene - r.gPost).padStart(5)} мс`);
  await s.eval(`(() => { const v = window.__om.visual; v.rt.texture.generateMipmaps = false; v.rt.texture.minFilter = 1006; v.rt.dispose(); })()`); const r2 = await measure(4000);
  console.log(`  без: ${'мип-уровней для свечения'.padEnd(28)} видеокарта ${f(r.gScene + r.gPost - r2.gScene - r2.gPost).padStart(5)} мс (поверх без MSAA)`);
}
s.close(); process.exit(0);
