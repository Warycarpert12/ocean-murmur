// QA v24: облёт — снимки по азимутам для трёх высот (?h=19/17/15) и проверка плавности пути за полный оборот (ускорение камеры)
//   node orbit.mjs <адрес сайта> <лист.jpg>        node orbit.mjs <адрес сайта> - smooth
import { launch, sleep } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
const [url, out, mode] = process.argv.slice(2);
const H = ['19', '17', '15'], A = [180, 110, 60, 30, 0, -40];
if (mode === 'smooth') {
  const s = await launch({ gpu: true });
  await s.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 360, deviceScaleFactor: 1, mobile: false });
  await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.45&h=17&turn=160`); await s.until('window.__om?.visual?.assets', 90000); await sleep(3000);
  const r = await s.eval(`(() => { const v = window.__om.visual, P = [], dt = 1 / 30; v._idle = 99; v._spun = false;
    v.camera.position.set(-60, 40, -60); v.controls.target.set(0, 3, 0); v.controls.update();
    for (let i = 0; i < 165 * 30; i++) { v.frame(dt, 100 + i * dt, dt); const c = v.camera.position, t = v.controls.target; P.push([c.x, c.y, c.z, t.x, t.y, t.z]); }
    // ускорение камеры и точки взгляда (м/с²) после первых 10 с (вход в облёт)
    let ac = 0, at = 0, iac = 0, vmax = 0; for (let i = 300; i < P.length - 1; i++) {
      const a = k => Math.hypot(...[0, 1, 2].map(j => (P[i + 1][k + j] - 2 * P[i][k + j] + P[i - 1][k + j]) / dt / dt));
      const c = a(0), t = a(3); if (c > ac) { ac = c; iac = i; } at = Math.max(at, t);
      vmax = Math.max(vmax, Math.hypot(...[0, 1, 2].map(j => (P[i + 1][j] - P[i][j]) / dt))); }
    const az = P.map(p => Math.atan2(p[0], p[2])); let turned = 0; for (let i = 1; i < az.length; i++) { let d = az[i] - az[i - 1]; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; }
    const hs = P.slice(300).map(p => p[1]);
    return { accCam: ac.toFixed(3), atS: (iac * dt).toFixed(1), accTgt: at.toFixed(3), vmax: vmax.toFixed(2), turnedDeg: (turned * 180 / Math.PI).toFixed(0), hMin: Math.min(...hs).toFixed(1), hMax: Math.max(...hs).toFixed(1) }; })()`);
  console.log(r); s.close(); process.exit(0);
}
for (const h of H) {
  const s = await launch({ gpu: true });
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 520, deviceScaleFactor: 1, mobile: false });
  await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.45&spinqa=1&h=${h}`); await s.until('window.__om?.visual?.assets', 90000); await sleep(4000);
  await s.eval(`for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'credits', 'bst-btn']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }`);
  for (const a of A) { await s.eval(`(() => { const v = window.__om.visual; v._orbA = ${a} * Math.PI / 180; v._spun = true; })()`); await sleep(700); await s.shot(`orb2_${h}_${a}.png`); }
  s.close();
}
execFileSync('python', ['-c', `
from PIL import Image, ImageDraw, ImageFont
FNT = ImageFont.truetype('arial.ttf', 18)
H, A = ${JSON.stringify(H)}, ${JSON.stringify(A)}
w2, h2 = 400, 173
c = Image.new('RGB', ((w2 + 6) * len(A), (h2 + 6) * len(H) + 20), (20, 20, 20)); d = ImageDraw.Draw(c)
for k, a in enumerate(A): d.text((k * (w2 + 6) + 6, 4), f'азимут {a}°' + (' (риф)' if abs(a) <= 30 else ''), fill=(255, 255, 0), font=FNT)
for r, h in enumerate(H):
    for k, a in enumerate(A): c.paste(Image.open(f'orb2_{h}_{a}.png').resize((w2, h2)), (k * (w2 + 6), 20 + r * (h2 + 6)))
    d.text((6, 20 + r * (h2 + 6) + 4), f'h={h}', fill=(255, 255, 0), font=FNT)
c.save(r'${out}', quality=85)`]);
process.exit(0);
