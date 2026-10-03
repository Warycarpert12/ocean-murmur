// QA v24: двойной клик / двойное касание по зверю — слежение; одиночное, перетаскивание, касания далеко — нет
import { launch, sleep, phone } from './cdp.mjs';
const url = process.argv[2]; let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const where = s => s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.controls.autoRotate = false; v._idle = 0;
  const o = [...v.agents.values()].find(a => a.sp === 'dolphin' && !a.gone); if (!o) return null; const p = o.obj.position.clone().project(v.camera), r = v.stage.getBoundingClientRect();
  return { id: o.id, x: r.left + (p.x * .5 + .5) * v.w, y: r.top + (-p.y * .5 + .5) * v.h }; })()`);
const fol = s => s.eval(`window.__om.visual._follow?.id ?? null`);
const unf = s => s.eval(`window.__om.visual.unfollow?.(); window.__om.visual._follow = null`);
for (const dev of ['pc', 'phone']) {
  console.log('==', dev);
  const s = await launch({ gpu: true });
  if (dev === 'phone') await phone(s, { w: 812, h: 375, dpr: 3 }); else await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await s.goto(url + '?qa&noaudio=1&seed=7&spawn=dolphin'); await s.until('window.__omReady && window.__om?.visual?.assets', 60000); await sleep(3000);
  await s.eval(`(() => { const v = window.__om.visual, o = [...v.agents.values()].find(a => a.sp === 'dolphin'); v._freeCam = true; v.camera.position.set(o.obj.position.x + 20, 14, o.obj.position.z + 20); v.controls.target.copy(o.obj.position); v.controls.update(); })()`);
  await sleep(300);
  const mouse = async (type, x, y, n = 1) => s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: n, buttons: type === 'mouseReleased' ? 0 : 1 });
  const tap = async (x, y) => { await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  let p = await where(s);
  if (dev === 'pc') {
    await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); await sleep(500); ok(await fol(s) === null, 'одиночный клик — без слежения');
    p = await where(s); await mouse('mousePressed', p.x, p.y); for (let i = 1; i <= 8; i++) await mouse('mouseMoved', p.x + i * 15, p.y); await mouse('mouseReleased', p.x + 120, p.y); await sleep(300);
    ok(await fol(s) === null, 'перетаскивание (вращение камеры) — без слежения');
    p = await where(s); await mouse('mousePressed', p.x, p.y, 1); await mouse('mouseReleased', p.x, p.y, 1); await mouse('mousePressed', p.x, p.y, 2); await mouse('mouseReleased', p.x, p.y, 2); await sleep(300);
    ok(await fol(s) === p.id, `двойной клик по дельфину — слежение (${await fol(s)} = ${p.id})`);
    await unf(s); const e = await s.eval(`(() => { const v = window.__om.visual; for (let y = 60; y < 300; y += 20) for (let x = 400; x < 900; x += 20) { if (!v._pickAt(x, y, 1.3) && document.elementFromPoint(x, y)?.id === 'gl') return [x, y]; } return [640, 60]; })()`); await mouse('mousePressed', e[0], e[1], 1); await mouse('mouseReleased', e[0], e[1], 1); await mouse('mousePressed', e[0], e[1], 2); await mouse('mouseReleased', e[0], e[1], 2); await sleep(300);
    ok(await fol(s) === null, 'двойной клик мимо зверя — без слежения');
  } else {
    await tap(p.x, p.y); await sleep(600); ok(await fol(s) === null, 'одно касание — без слежения');
    p = await where(s); await tap(p.x, p.y); await sleep(80); await tap(p.x + 120, p.y + 60); await sleep(500); ok(await fol(s) === null, 'два касания далеко друг от друга — без слежения');
    p = await where(s); await tap(p.x, p.y); await sleep(120); await tap(p.x + 4, p.y + 3); await sleep(300);
    ok(await fol(s) === p.id, `двойное касание дельфина — слежение (${await fol(s)} = ${p.id})`);
  }
  s.close();
}
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло'); process.exit(fails ? 1 : 0);
