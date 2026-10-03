// QA v24: вход в океан не зависает никогда. Сценарии слабого устройства: «Лёгкое», мало памяти (deviceMemory 1), прошлый
// вход не дошёл до мира, распаковка звука «зависла» или упала, медленная сеть + медленный процессор, потеря контекста
// WebGL (с восстановлением и без). Во всех — вход завершается, мир рисуется. Видеокарта ПК (Edge, ANGLE D3D11).
//   node docs/v24/qa/boot_check.mjs <адрес собранного сайта> [сценарий,сценарий,...]
import { launch, sleep } from './cdp.mjs';
const [url, only] = process.argv.slice(2);
const HANG = `{ const P = (window.BaseAudioContext || window.AudioContext).prototype; P.decodeAudioData = function () { return new Promise(() => {}); }; }`;
const FAIL = `{ const P = (window.BaseAudioContext || window.AudioContext).prototype; P.decodeAudioData = function (ab, ok, bad) { const e = new DOMException('нет памяти', 'EncodingError'); setTimeout(() => bad && bad(e), 50); return Promise.reject(e); }; }`;
const MEM1 = `Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1 });`;
const NOMEM = `Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => undefined });`;
const S = {
  normal: {},
  lite: { q: '&lite=1', want: { lite: true } },
  mem1: { init: MEM1, want: { lite: true } },
  lastfail: { init: `localStorage.setItem('abyssonata.boot', String(Date.now() - 60000));`, want: { lite: true } },
  decode_hang: { init: HANG },
  decode_fail: { init: FAIL },
  slow: { cpu: 6, net: { latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 5e5 / 8 } },
  lost_restore: { lose: 'restore' },
  lost_forever: { lose: 'forever' },
};
let fails = 0; const ok = (c, m) => { console.log(`  ${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
for (const [name, sc] of Object.entries(S)) {
  if (only && !only.split(',').includes(name)) continue;
  console.log(`== ${name}`);
  const s = await launch({ gpu: true }), errs = [];
  s.on(d => { if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.split('\n')[0]); });
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  if (sc.init) await s.send('Page.addScriptToEvaluateOnNewDocument', { source: sc.init });
  if (sc.net) { await s.send('Network.enable'); await s.send('Network.emulateNetworkConditions', { offline: false, ...sc.net }); }
  if (sc.cpu) await s.send('Emulation.setCPUThrottlingRate', { rate: sc.cpu });
  const t0 = Date.now();
  await s.goto(`${url}?qa&seed=7${sc.q || ''}`);
  await s.until('window.__omReady', 120000);
  const tReady = Date.now() - t0;
  await s.tapSel('#gate-btn').catch(() => s.eval(`document.getElementById('gate-btn').click()`));
  const tClick = Date.now();
  const entered = await s.until(`!document.getElementById('gate') || document.getElementById('gate').classList.contains('clear')`, 30000).then(() => true, () => false);
  const tEnter = Date.now() - tClick;
  ok(entered, `вход завершился: ${entered ? (tEnter / 1000).toFixed(1) + ' с после нажатия' : 'НЕТ за 30 с'} (страница готова через ${(tReady / 1000).toFixed(1)} с)`);
  // мир рисуется: кадры идут и сцена не пустая
  const f0 = await s.eval('window.__om.visual.renderer.info.render.frame'); await sleep(1500);
  const f1 = await s.eval('window.__om.visual.renderer.info.render.frame');
  ok(f1 > f0, `мир рисуется: ${f1 - f0} кадров за 1.5 с`);
  if (sc.lose) {
    await s.eval(`window.__lc = window.__om.visual.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext()`);
    await sleep(500);
    ok(await s.eval(`!document.getElementById('gl-lost').hidden && window.__om.visual.lost`), 'потеря контекста: надпись на экране');
    if (sc.lose === 'restore') {
      await s.eval('window.__lc.restoreContext()'); await sleep(2500);
      const r = await s.eval(`({ lost: window.__om.visual.lost, hidden: document.getElementById('gl-lost').hidden, f: window.__om.visual.renderer.info.render.frame, pr: window.__om.visual.renderer.getPixelRatio(), msaa: window.__om.visual.rt.samples })`);
      await sleep(1000); const f2 = await s.eval('window.__om.visual.renderer.info.render.frame');
      ok(!r.lost && r.hidden && f2 > r.f, `восстановлено: надпись убрана, кадры идут (${f2 - r.f} за 1 с), качество ниже: ×${r.pr.toFixed(2)}, MSAA ${r.msaa}`);
    } else {
      await sleep(7000);
      ok(await s.eval(`!document.querySelector('#gl-lost button').hidden`), 'не восстановилось за 6 с: кнопка «Перезапустить в облегчённом режиме»');
    }
  }
  const st = await s.eval(`(async () => ({ lite: document.querySelector('#quality button[data-q="lite"]').classList.contains('active'), audioLite: window.__om.audio.lite, ready: window.__om.audio.ready,
    snd: +window.__om.audio.memMB().toFixed(0), steps: (await import('./boot.js')).steps.map(x => x.name + ':' + x.st + (x.t1 ? ' ' + ((x.t1 - x.t0) / 1000).toFixed(1) + 'с' : '') + (x.note ? ' (' + x.note + ')' : '')).join(' | ') }))()`).catch(e => ({ err: e.message }));
  if (sc.want?.lite) ok(st.lite, `«Лёгкое» включилось само (звук облегчённый: ${st.audioLite})`);
  console.log(`  звук готов: ${st.ready}, звука в памяти ${st.snd} МБ; шаги: ${st.steps}`);
  ok(!errs.length, 'ошибок страницы нет' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  s.close(); await sleep(300);
}
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
