// ламинария крупно: без зверя и с «китом» (радиус 10 м) в 3 м от стебля; main и ветка
import { launch, sleep } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
const [A, B, out] = process.argv.slice(2);
for (const [tag, url] of [['a', A], ['b', B]]) for (const whale of [0, 1]) {
  const s = await launch({ gpu: true });
  await s.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.5`); await s.until('window.__om?.visual?.assets', 90000); await sleep(2000);
  await s.eval(`(() => { const v = window.__om.visual, m = v.flora[0], M = new v.camera.matrix.constructor(), p = new v.camera.position.constructor();
    // самый высокий стебель ламинарии подальше от берега
    let best = 0, bh = 0; for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); const sy = Math.hypot(M.elements[4], M.elements[5], M.elements[6]); p.setFromMatrixPosition(M); if (sy > bh && Math.hypot(p.x, p.z) > 60 && Math.hypot(p.x, p.z) < 110) { bh = sy; best = i; } }
    m.getMatrixAt(best, M); p.setFromMatrixPosition(M); window.__kelp = { x: p.x, y: p.y, z: p.z, h: bh };
    v._freeCam = true; v.controls.enableDamping = false; v.camera.position.set(p.x + 16, p.y + bh * .5, p.z + 4); v.controls.target.set(p.x, p.y + bh * .45, p.z); v.controls.update();
    v._floraAvoid = () => {};
    for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'credits']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
    const a = v.uAvoid.value[0]; for (const x of v.uAvoid.value) x.set(0, -9999, 0, 1); if (v.uAvoidV) for (const x of v.uAvoidV.value) x.set(0, 0, 0, 0);
    if (v.uAvN) v.uAvN.value = ${whale}; const nr = m.userData.near; if (nr) { nr.array.fill(${whale}); nr.needsUpdate = true; }   // v24: флаг «рядом зверь»   // v24: сколько зверей в цикле; uAvoidV.y — квадрат досягаемости (тело ×1.3 + след)
    if (${whale}) { a.set(p.x, p.y + bh * .4, p.z - 3, 10); if (v.uAvoidV) v.uAvoidV.value[0].set(0, (10 * 1.3 + 3 * 1.5 + .01) ** 2, 3, 1); }
  })()`);
  await sleep(1500); await s.shot(`kelp_${tag}${whale}.png`); s.close();
}
execFileSync('python', ['-c', `
from PIL import Image, ImageDraw
ims = [[Image.open(f'kelp_{t}{w}.png') for w in (0, 1)] for t in 'ab']
w, h = ims[0][0].size; c = Image.new('RGB', (w * 2 + 8, h * 2 + 8), (20, 20, 20))
for r in range(2):
    for k in range(2): c.paste(ims[r][k], (k * (w + 8), r * (h + 8)))
c.save(r'${out}', quality=85)`]);
process.exit(0);
