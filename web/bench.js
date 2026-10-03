// v24: ?bench=1 — замер на самом устройстве: что сколько стоит в кадре. Запускается сам через 4 с после входа в мир.
// Мир живёт как обычно (JS кадра настоящий), «Авто» на время замера не трогает качество; камера стоит, время суток
// одно и то же; по очереди выключается одна часть картинки (или меняется
// разрешение), на каждую — ~6.5 с: 1 с на успокоение, 3 с как есть (кадров в секунду, худшие 1%), 2.5 с с ожиданием
// видеокарты после каждого кадра (работа кадра = JS + видеокарта — видно и то, что быстрее частоты экрана). Прогон
// днём и ночью, в конце — таблица на экране. Если страницу раздаёт домашний сервер с приёмом (srv_lan.py), результат
// ещё и уходит ему (POST bench.json) — не нужно переписывать цифры со снимка
import * as THREE from './three.module.min.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runBench({ visual: v, world, setPaused, high, hold, short = false }) {
  const gl = v.renderer.getContext(), px = new Uint8Array(4), root = document.documentElement;
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99;padding:4px 10px;border-radius:8px;background:rgba(0,0,0,.7);color:#eef4ee;font:12px ui-monospace,monospace;text-transform:none;pointer-events:none';
  document.body.append(label);

  // кадр: t0 — начало (≈ такт экрана), js — сам кадр (мир, звери, команды отрисовки), gpu — ожидание видеокарты
  let rec = null, sync = false;
  const orig = v.frame;
  v.frame = function (...a) {
    const t0 = performance.now(), r = orig.apply(this, a), t1 = performance.now();
    if (sync) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (rec) rec.push([t0, t1 - t0, performance.now() - t1]);
    return r;
  };

  // спрятать объекты: слой 0 камеры их больше не видит (видимость трогает сам кадр — облака, ореолы)
  const hide = objs => { const keep = []; for (const o of objs) o?.traverse(n => { keep.push([n, n.layers.mask]); n.layers.mask = 0; }); return () => keep.forEach(([n, m]) => { n.layers.mask = m; }); };
  const byMat = mats => { const out = [], S = new Set(mats.filter(Boolean)); v.scene.traverse(n => { if (S.has(n.material) || S.has(n.geometry)) out.push(n); }); return out; };
  const uni = (u, x) => { const was = u.value; u.value = x; return () => { u.value = was; }; };
  const post = frag => { const m = v.postMat, was = m.fragmentShader, mip = v.rt.texture.generateMipmaps; m.fragmentShader = frag; m.needsUpdate = true; v.rt.texture.generateMipmaps = false;
    return () => { m.fragmentShader = was; m.needsUpdate = true; v.rt.texture.generateMipmaps = mip; }; };
  const q = o => { v.setQuality({ ...high, ...o }); return () => v.setQuality(high); };
  const water = n => { const g = v.water.geometry, was = v.waterN; v.water.geometry = new THREE.PlaneGeometry(10000, 10000, n, n); v.waterN = n;
    return () => { v.water.geometry.dispose(); v.water.geometry = g; v.waterN = was; }; };
  const f0 = v.postMat.fragmentShader, gA = f0.indexOf('vec3 glow = vec3(0.);'), gB = f0.indexOf('col += max(glow - uThr, vec3(0.)) * uNeon;');
  const noNeon = gA > 0 && gB > gA ? f0.slice(0, gA) + f0.slice(gB + 'col += max(glow - uThr, vec3(0.)) * uNeon;'.length) : null;
  const COPY = `uniform sampler2D tScene; in vec2 vUv; out vec4 fragColor; void main() { fragColor = vec4(textureLod(tScene, vUv, 0.).rgb, 1.); }`;
  const animals = () => [...v.agents.values()].flatMap(o => [o.obj, ...(o.fish || []).map(f => f.obj)])
    .concat([...(v.shoals || []), ...(v.farShoals || []), ...(v.reefShoals || [])].map(s => s.m), v.flockLines, v.crawlMesh);
  const ROWS = [
    ['всё (Высокое)', () => () => {}],
    ['без растений на дне', () => hide(v.flora || [])],
    ['растения не качаются', () => uni(v.uFloraAnim, 0)],
    ['без воды', () => hide([v.water])],
    ['вода: сетка 128', () => water(128)],
    ['вода: сетка 64', () => water(64)],
    ['без облаков', () => hide(v.clouds || [])],
    ['без огоньков, планктона', () => hide([...byMat([v.plankton, v.farPlankton, v.fireflies, v.moteMat, v.mothMat, ...(v.flies || [])]), ...(v.halos || [])])],
    ['без пены у берегов', () => hide(byMat([v.foamMat]))],
    ['без зверей и рыб', () => hide(animals())],
    ['без травы, кустов, пальм', () => hide([...(v.decor || []), ...(v.palms || [])])],
    ['без дальнего острова', () => hide([v.farIsland, ...byMat([v.curMat])])],
    ['без точечной фактуры', () => uni(v.uStip, 0)],
    ['без неона', () => noNeon ? post(noNeon) : () => {}],
    ['без постобработки', () => post(COPY)],
    ['сглаживание 2× вместо 4×', () => q({ msaa: 2 })],
    ['без сглаживания', () => q({ msaa: false })],
    ['без размытия панелей', () => { root.style.setProperty('--glass', 'none'); return () => root.style.removeProperty('--glass'); }],
    ['разрешение 133%', () => q({ k: 4 / 3 })],
    ['разрешение 75%', () => q({ k: .75 })],
    ['разрешение 60%', () => q({ k: .6 })],
    ['мир на паузе', () => { setPaused(true); return () => setPaused(false); }],
    ['пустая сцена', () => { v.scene.visible = false; return () => { v.scene.visible = true; }; }],
    ['всё (повтор)', () => () => {}],
  ];
  // короткий прогон (?bench=2) — меньше греется телефон: только то, что оказалось дорогим на телефоне автора
  const SHORT = ['всё (Высокое)', 'без растений на дне', 'растения не качаются', 'без воды', 'сглаживание 2× вместо 4×', 'без сглаживания', 'разрешение 75%', 'пустая сцена', 'всё (повтор)'];
  if (short) ROWS.splice(0, ROWS.length, ...ROWS.filter(r => SHORT.includes(r[0])));
  const TODS = [['день', .5], ['ночь', .02]];

  // одна точка камеры: облёт со стороны рифа, остров и горизонт в кадре
  hold(true); v._freeCam = true; v.controls.enabled = false; v.controls.autoRotate = false;
  v.camera.position.set(30, 32, 100); v.controls.target.set(0, 3, 15); v.controls.update();
  v.setQuality(high);
  const stat = () => {
    const free = rec.filter(r => r.free), syn = rec.filter(r => !r.free);
    const iv = free.slice(1).map((r, i) => r[0] - free[i][0]).sort((a, b) => a - b), mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    return { fps: 1000 / mean(iv), ms: mean(iv), p99: iv[Math.min(iv.length - 1, Math.floor(iv.length * .99))] || 0, med: iv[iv.length >> 1] || 0,
      work: mean(syn.map(r => r[1] + r[2])), js: mean(syn.map(r => r[1])), n: iv.length };
  };
  const res = { ua: navigator.userAgent, gpu: '', dpr: devicePixelRatio, screen: `${screen.width}×${screen.height}`, css: `${innerWidth}×${innerHeight}`, rows: [] };
  try { const d = gl.getExtension('WEBGL_debug_renderer_info'); res.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* нет */ }
  res.buf = `${v.renderer.domElement.width}×${v.renderer.domElement.height}`;
  const total = ROWS.length * TODS.length; let k = 0;
  for (const [tn, tod] of TODS) {
    world.setTimeOfDay(tod); v.snapped = false; world.step(0); v.hud?.();
    for (const [name, on] of ROWS) {
      label.textContent = `замер ${++k}/${total}: ${name} (${tn}) — не трогайте экран`;
      const off = on(); await sleep(1000);
      rec = []; sync = false; await sleep(3000); rec.forEach(r => { r.free = true; });
      const keep = rec; rec = []; sync = true; await sleep(2500); sync = false; rec = keep.concat(rec);
      const st = stat(); st.buf = `${v.renderer.domElement.width}×${v.renderer.domElement.height}`; rec = null; off();
      res.rows.push({ tod: tn, name, ...st });
    }
  }
  v.frame = orig; v._freeCam = false; v.controls.enabled = true; v.setQuality(high); hold(false); label.remove();
  show(res);
  try { await fetch('bench.json', { method: 'POST', body: JSON.stringify(res) }); } catch { /* сайт без приёма — только таблица */ }
  return res;
}

function show(res) {
  const f = x => (Number.isFinite(x) ? x.toFixed(x >= 100 ? 0 : 1) : '—').padStart(7);
  const names = [...new Set(res.rows.map(r => r.name))], get = (n, t) => res.rows.find(r => r.name === n && r.tod === t);
  const base = t => get('всё (Высокое)', t)?.work || 0;
  const hz = Math.round(1000 / (get('пустая сцена', 'день')?.med || 16.7));
  const C = ['к/с', 'худш.1%', 'работа', 'из них JS', 'легче на'].map(c => c.padStart(c.length > 7 ? c.length + 1 : 7)), W = C.join('').length;
  let s = `${res.gpu}\nэкран ${res.screen} (${res.css} ×${res.dpr.toFixed(2)}), рисуется ${res.buf}, частота экрана ≈ ${hz} Гц\n`;
  s += 'к/с и худшие 1% (мс) — как есть; работа — JS + видеокарта за кадр, мс; «легче на» — работа меньше, чем у «всё», мс\n\n';
  s += ''.padEnd(24) + ' |' + ' ДЕНЬ'.padEnd(W) + ' |' + ' НОЧЬ\n' + ''.padEnd(24) + ' |' + C.join('') + ' |' + C.join('') + '\n';
  const fw = (x, i) => f(x).padStart(C[i].length);
  for (const n of names) {
    s += n.padEnd(24) + ' |';
    for (const t of ['день', 'ночь']) { const r = get(n, t); s += (r ? [r.fps, r.p99, r.work, r.js, base(t) - r.work].map(fw).join('') : ''.padEnd(W)) + ' |'; }
    s += '\n';
  }
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:100;overflow:auto;background:rgba(6,12,11,.94);color:#eef4ee;padding:8px 10px;text-transform:none;letter-spacing:0';
  const pre = document.createElement('pre'); pre.style.cssText = 'margin:0;font:9.5px/1.22 ui-monospace,Consolas,monospace;white-space:pre'; pre.textContent = s;
  const btn = document.createElement('button'); btn.textContent = 'Закрыть'; btn.style.cssText = 'margin-top:6px;font:12px sans-serif;padding:4px 14px';
  btn.onclick = () => box.remove();
  box.append(pre, btn); document.body.append(box);
}
