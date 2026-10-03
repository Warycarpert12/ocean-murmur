// QA v24: мерцание кромки островов при движении камеры. Мир стоит (шаг 0, время шейдеров одно), камера поворачивается
// вокруг острова крошечными шагами; для каждой точки кадра — «рывок» яркости: |I(t+1) − 2·I(t) + I(t−1)|. Плавное
// движение даёт малый рывок, мерцание и скачки — большой. Печатает сумму рывков (по всему кадру и у кромки) для сцены
// целиком и с выключенными частями, и сохраняет карту рывков.
//   node flicker.mjs <адрес сайта> [ширина=3440] [высота=1440] [шагов=40] [шаг, градусы=0.03] [папка для карт]
import { launch, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const [url, W = '3440', H = '1440', N = '40', STEP = '0.03', dir = '.'] = process.argv.slice(2);
const s = await launch({ gpu: true });
await s.send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', 'high'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.02`);
await s.until('window.__om?.visual?.assets', 90000); await sleep(4000);
await s.eval(`window.__run = (opts) => { const v = window.__om.visual, R = v.renderer, gl = R.getContext(), cv = R.domElement;
  v._freeCam = true; v.controls.enableDamping = false; v.controls.autoRotate = false; v._idle = 0;
  const u = v.postMat.uniforms, wu = v.waterMat.uniforms, keep = { neon: u.uNeon.value, isle: v.uIsle.value, glow: wu.uGlow.value, foam: wu.uFoam.value };
  const w = cv.width, h = cv.height, sw = w >> 1, sh = h >> 1, prev2 = new Float32Array(sw * sh), prev = new Float32Array(sw * sh), jerk = new Float32Array(sw * sh), px = new Uint8Array(w * h * 4);
  const T = 1000, a0 = .6, r = 100, y = 62, SL = [], SG = [];
  for (let i = 0; i < ${+N}; i++) {
    const a = a0 + i * ${+STEP} * Math.PI / 180;
    v.camera.position.set(Math.sin(a) * r, y, Math.cos(a) * r); v.controls.target.set(0, 0, 0); v.controls.update();
    v.frame(0, T, 0);
    if (opts.neon === 0) u.uNeon.value = 0; if (opts.isle === 0) v.uIsle.value = 0; if (opts.water === 0) { wu.uGlow.value = 0; wu.uFoam.value = 0; }
    if (opts.neon === 0 || opts.isle === 0 || opts.water === 0) { R.setRenderTarget(v.rt); R.render(v.scene, v.camera); R.setRenderTarget(null); R.render(v.postScene, v.postCam); }
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const cur = new Float32Array(sw * sh);
    for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) { const k = ((yy * 2) * w + xx * 2) * 4; cur[yy * sw + xx] = px[k] * .3 + px[k + 1] * .59 + px[k + 2] * .11; }
    if (i >= 2) for (let k = 0; k < cur.length; k++) jerk[k] += Math.abs(cur[k] - 2 * prev[k] + prev2[k]);
    // сумма яркости участка с кромкой главного острова (не зависит от сдвига линии): линия (яркость сверх 150) и свечение (40–150), без жёсткого порога
    let sl = 0, sg = 0; for (let yy = (sh * .3) | 0; yy < (sh * .63) | 0; yy++) for (let xx = (sw * .32) | 0; xx < (sw * .66) | 0; xx++) { const L = cur[yy * sw + xx]; sl += Math.max(0, L - 150); sg += Math.min(110, Math.max(0, L - 40)); }
    SL.push(sl); SG.push(sg);
    prev2.set(prev); prev.set(cur);
  }
  u.uNeon.value = keep.neon; v.uIsle.value = keep.isle; wu.uGlow.value = keep.glow; wu.uFoam.value = keep.foam;
  let sum = 0, top = 0; for (const j of jerk) { sum += j; if (j > 60 * (${+N} - 2) / 10) top++; }
  window.__jerk = { w: sw, h: sh, data: jerk };
  const rough = A => { let d = 0, m = 0; for (let k = 1; k < A.length - 1; k++) d += Math.abs(A[k + 1] - 2 * A[k] + A[k - 1]); for (const x of A) m += x; return +(100 * d / (A.length - 2) / (m / A.length || 1)).toFixed(3); };
  return { avg: +(sum / jerk.length / (${+N} - 2)).toFixed(3), hot: top, line: rough(SL), glow: rough(SG) };
}`);
const runs = { 'всё как есть': {}, 'без неона пост-обработки': { neon: 0 }, 'без свечения основания островов': { isle: 0 }, 'без свечения и пены воды': { water: 0 }, 'без неона и без пены': { neon: 0, water: 0 } };
for (const [name, o] of Object.entries(runs)) {
  const r = await s.eval(`window.__run(${JSON.stringify(o)})`);
  console.log(`${name.padEnd(34)} средний рывок ${String(r.avg).padStart(6)}  точек с сильными рывками ${String(r.hot).padStart(6)}  |  скачки суммы яркости у кромки: линия ${r.line}%  свечение ${r.glow}%`);
  const m = await s.eval(`(() => { const J = window.__jerk; let mx = 1; for (const x of J.data) if (x > mx) mx = x; mx *= .5; return { w: J.w, h: J.h, b: Array.from(J.data, x => Math.min(255, Math.round(255 * x / mx))) }; })()`);
  // PGM — без библиотек
  writeFileSync(`${dir}/jerk_${name.replace(/\s+/g, '_')}.pgm`, Buffer.concat([Buffer.from(`P5 ${m.w} ${m.h} 255\n`), Buffer.from(m.b)]));
}
s.close(); process.exit(0);
