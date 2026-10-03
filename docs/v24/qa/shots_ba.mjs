// QA v24: снимки «было / стало» — одни и те же виды (обзор и риф вблизи, днём и ночью), «Высокое», неподвижная камера,
// один и тот же мир. Склеивает пары в <папка>/<вид>.png (слева — было, справа — стало) через Python + Pillow.
//   node shots_ba.mjs <адрес «было»> <адрес «стало»> <папка>
import { launch, sleep } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const [A, B, dir] = process.argv.slice(2); mkdirSync(dir, { recursive: true });
const VIEWS = { 'обзор_день': [.5, [0, 73, 75], [0, 2, 0]], 'обзор_ночь': [.02, [0, 73, 75], [0, 2, 0]],
  'риф_день': [.5, [14, 9, 104], [0, -2, 76]], 'риф_ночь': [.02, [14, 9, 104], [0, -2, 76]] };
for (const [name, [tod, cam, tg]] of Object.entries(VIEWS)) for (const [tag, url] of [['a', A], ['b', B]]) {
  const s = await launch({ gpu: true });
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', 'high'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
  await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=${tod}`); await s.until('window.__om?.visual?.assets', 90000);
  await s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.camera.position.set(${cam}); v.controls.target.set(${tg}); v.controls.update();
    for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'credits']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } })()`);
  await sleep(6000); await s.shot(`${dir}/${name}_${tag}.png`); s.close();
}
execFileSync('python', ['-c', `
from PIL import Image
import glob, os
d = r'${dir}'
for a in glob.glob(os.path.join(d, '*_a.png')):
    b = a[:-6] + '_b.png'; A = Image.open(a); B = Image.open(b); w, h = A.size
    c = Image.new('RGB', (w * 2 + 8, h), (20, 20, 20)); c.paste(A, (0, 0)); c.paste(B, (w + 8, 0)); c.save(a[:-6] + '.jpg', quality=88); os.remove(a); os.remove(b)
`]);
console.log('готово:', dir);
process.exit(0);
