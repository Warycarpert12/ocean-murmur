// уровни качества рядом, как на телефоне (801×373 ×3.375 → снимок в точках экрана): node qshots.mjs <лист.jpg> <столбцы JSON [[подпись, адрес, качество], ...]>
import { launch, phone, sleep } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
const [out, colsJ] = process.argv.slice(2), COLS = JSON.parse(colsJ), TODS = [['день', .5], ['ночь', .02]];
const files = [];
for (const [tn, tod] of TODS) for (const [i, [cap, url, q]] of COLS.entries()) {
  const s = await launch({ gpu: true });
  await phone(s, { w: 801, h: 373, dpr: 3.375, sw: 843, sh: 374 });
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', '${q}'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
  await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=${tod}`); await s.until('window.__om?.visual?.assets', 90000);
  await s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.camera.position.set(30, 32, 100); v.controls.target.set(0, 3, 15); v.controls.update();
    for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'credits', 'bst-btn', 'fs']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } })()`);
  await sleep(7000); const f = `q_${tn}_${i}.png`; await s.shot(f); files.push([tn, i, f]);
  console.log(tn, cap, await s.eval(`(() => { const c = window.__om.visual.renderer.domElement; return c.width + '×' + c.height; })()`));
  s.close();
}
execFileSync('python', ['-c', `
from PIL import Image, ImageDraw, ImageFont
FNT = ImageFont.truetype('arial.ttf', 18)
cols = ${JSON.stringify(COLS.map(c => c[0]))}; tods = ['день', 'ночь']
W = 640; im0 = Image.open('q_день_0.png'); w, h = im0.size; H = int(h * W / w); CW, CH = 640, 300
sheet = Image.new('RGB', (len(cols) * (W + 6), 24 + len(tods) * (H + CH + 12)), (20, 20, 20)); d = ImageDraw.Draw(sheet)
for i, c in enumerate(cols): d.text((i * (W + 6) + 6, 6), c, fill=(255, 255, 0), font=FNT)
for r, t in enumerate(tods):
    y = 24 + r * (H + CH + 12)
    for i in range(len(cols)):
        im = Image.open(f'q_{t}_{i}.png'); x = i * (W + 6)
        sheet.paste(im.resize((W, H), Image.LANCZOS), (x, y))
        cx, cy = int(w * .42), int(h * .40); sheet.paste(im.crop((cx, cy, cx + CW, cy + CH)), (x, y + H + 4))
    d.text((6, y + 4), t + ' (внизу — кусок 1:1, как на экране телефона)', fill=(255, 255, 0), font=FNT)
sheet.save(r'${out}', quality=88)`]);
process.exit(0);
