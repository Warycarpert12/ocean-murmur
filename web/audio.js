// Abyssonata — звук в браузере (Web Audio), 1:1 портирован с ocean_live.scd (SuperCollider):
// та же схема слоёв и те же числа (amp/lpf/atk/rel), только играет на устройстве слушателя,
// не на колонке. Все звуки — настоящие CC0-записи с сервера (/samples/...), кроме ветра и
// гула глубины: они, как и в SC-версии, синтезируются из шума (см. synthWind/synthDepth).
//
// Использование: см. main.js — new OceanAudio(baseUrl), await .start() (по клику, иначе
// браузер не даст звуку начаться), .update(state) на каждый /state, .onEvent(e) на каждый /event.

import { Music } from './music.js';
import { step, within, device } from './boot.js';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rrand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[(Math.random() * arr.length) | 0];

// Разовые события: type -> [категория, rate от,до, amp от,до, lpf от,до, atk, rel] — те же цифры, что в ~spec (ocean_live.scd).
const SPEC = {
  splash:      ['splash', .85, 1.15, .025, .06, 1500, 5000, .01, .15],
  wave_break:  ['splash', .85, 1.15, .025, .06, 1500, 5000, .01, .15],
  surf_surge:  ['splash', .85, 1.15, .025, .06, 1500, 5000, .01, .15],
  dive_splash: ['splash', .85, 1.15, .035, .08, 1500, 5000, .01, .15],
  jump_splash: ['splash', .80, 1.10, .04,  .09, 1500, 5500, .01, .15],
  seagull:     ['gull',   .95, 1.10, .035, .10, 3000, 8000, .05, .5],
  tern:        ['tern',   .95, 1.10, .028, .07, 3000, 8000, .05, .5],   // v14: свои записи крачек (раньше — ускоренная чайка)
  albatross:   ['gull',   .65, .75,  .035, .085,2500, 6000, .05, .5],
  cormorant:   ['cormorant', .95, 1.05, .03, .07, 2500, 6000, .05, .5],
  whale:       ['whale',  .90, 1.05, .10,  .25, 1200, 3000, 2.0, 3.0],
  dolphin:     ['dolphin', .95, 1.10, .08, .18, 4000, 9000, .05, .3],
  flying_fish: ['fish',   .90, 1.10, .02,  .05, 2000, 6000, .01, .15],
  thunder:     ['thunder', .90, 1.05, 1.8, 2.6, 3000, 9000, .05, 1.5],
  storm_start: ['thunder', .90, 1.05, 1.8, 2.6, 3000, 9000, .05, 1.5],
  sea_lion:    ['seal',   .90, 1.10, .05,  .12, 3000, 6000, .02, .3],
  orca:        ['orca',   .95, 1.05, .07,  .15, 2500, 8000, .05, .4],   // 22.09: косатки — свои записи (были в dolphin/)
  shark_hunt:  ['splash', .70, .90,  .05,  .10, 1200, 4000, .01, .2],   // бросок акулы на косяк — глухой всплеск
  whale_lunge: ['splash', .60, .75,  .05,  .10, 1000, 3500, .01, .3],   // v19: кит выныривает из пузырьковой сети — тяжёлый всплеск
  // v12: фонтан кита — его дыхание (записи wheezeblow раньше лежали среди песен: «пел», а звучал тихий выдох)
  whale_arrive:  ['whale_blow', .90, 1.05, .05, .10, 2500, 7000, .05, .8],
  whale_surface: ['whale_blow', .90, 1.05, .05, .10, 2500, 7000, .05, .8],
  whale_blow:    ['whale_blow', .90, 1.05, .04, .08, 2500, 7000, .05, .8],   // v14: серия выдохов на поверхности
  // v13: гудок далёкого парохода — низкий, приглушённый (фильтр ниже 1.5 кГц, долгий спад), «из самого далека»
  ship_horn:     ['horn', .92, 1.02, .10, .16, 700, 1500, .4, 2.5],
};
// v12: меньше повторов — из длинной записи (у чаек до 15 с) звучит не вся она, а кусок [от, до] секунд, начинающийся
// с одного из «вступлений» записи (где звук резко нарастает — начало крика). Одна запись даёт десятки разных криков
const WINDOW = { gull: [2.5, 5], tern: [2, 4], cormorant: [2, 4], seal: [2, 4.5], dolphin: [1.5, 3.5], orca: [2.5, 5], whale: [6, 10],
  bubbles: [1.5, 3.5], shrimp: [1.5, 3], crab: [1, 2.5], sand: [1, 2] };   // v23: sand — шорох песка у черепашат
// у песен кита громкость записей различается до 8 дБ — подравниваем по средней громкости (иначе часть «песен» не слышна)
// v14: и петли насекомых — записи разной громкости, а их слой сведён по эталону (см. _buildInsects)
const LEVEL = new Set(['whale', 'insects_day', 'insects_night']);
// у этих видов мало записей и голос частый — берём любую не из недавних (а не 3 «любимые» на особь):
// иначе одна и та же запись («юпи») повторялась слишком часто
const SPREAD = new Set(['dolphin', 'orca']);
// Баланс слоёв (this.mix) подгоняется под ЭТАЛОН — запись живого режима колонки (SuperCollider +
// ocean_sim.py), сравнение цифрами: web/_qa_audio.html → audio_stats.py. Не выставлять «на глаз».

const CATEGORIES = ['surf', 'splash', 'gull', 'tern', 'cormorant', 'whale', 'whale_blow', 'horn', 'dolphin', 'orca', 'seal', 'fish',
  'thunder', 'rain_light', 'rain_heavy', 'rain_water', 'insects_day', 'insects_night', 'grasshopper', 'bubbles', 'shrimp', 'crab', 'sand'];

// Смолёное «блуждающее» 0..1 (замена SuperCollider LFNoise1: несколько несоизмеримых синусов).
function wander(seed) {
  const f = [0.031, 0.017, 0.0071].map(x => x * (0.6 + seed * .8));
  const ph = [seed * 6.28, seed * 2.1, seed * 4.7];
  return t => clamp(0.5 + .18 * Math.sin(t * f[0] + ph[0]) + .16 * Math.sin(t * f[1] + ph[1]) + .14 * Math.sin(t * f[2] + ph[2]));
}

export class OceanAudio {
  constructor(baseUrl = '', { lite = false } = {}) {
    this.base = baseUrl;
    this.ready = false;
    this.manifest = null;
    this.buffers = {};          // категория -> [AudioBuffer]
    this._loading = {};         // категория -> Promise (чтобы не грузить дважды)
    this.recent = {};           // категория -> последние сыгранные буферы (не повторять подряд)
    this.rainOn = false;
    this.t0 = 0;
    // громкости слоёв относительно формул ocean_live.scd (1 = как в SC). Подобраны audio_fit.py 22.09.2026 по записи
    // живого режима колонки (qa/rec_ref.wav) на том же потоке событий: спектр по полосам ±1%, громкость ±1 дБ
    // 22.09 (после v9): ветер −3 дБ по просьбе пользователя («белый шум на фоне — на капельку тише»)
    this.mix = { event: .53, depth: .866, wind: .112, surf: .596, insects: 1 };
    this.prox = 0;              // 0..1 — насколько камера близко к острову (ставит main.js из visual.proximity())
    this.nature = 1;            // полоска «Природа» (0..1): общая громкость всех звуков мира (v11)
    this.music = .49;           // полоска «Музыка» (v14): абстрактный слой (_abstract), квадрат положения полоски
    this.info = new WeakMap();  // буфер -> { rms, on: [секунды «вступлений»] } (см. analyse); список буферов -> медиана rms
    // v21: облегчённый звук для iPhone/iPad и устройств с малой памятью (распакованные записи — до ~560 МБ, iOS закрывал
    // вкладку): записи в 32 кГц (на iPhone/iPad звук играет в родной частоте устройства, а записи распаковываются в 32 кГц —
    // см. _decoder), звуки зверей — по первому звуку, петли насекомых — только играющие. На обычных устройствах — всё как
    // было. ?lite=1 — включить для проверки
    // v24: и телефоны, у браузера которых нет deviceMemory (Firefox и др.: память неизвестна — раньше там грузилось всё,
    // как на ПК), и «Лёгкое» качество (lite из main.js). В «Лёгком» ещё и выгружаются записи, давно не звучавшие (_evict)
    const ios = this.ios = device.ios;
    this.tiny = lite;
    this.lite = ios || lite || (device.mem !== null ? device.mem <= 4 : device.touch) || new URLSearchParams(location.search).get('lite') === '1';
    this.used = {};             // категория -> когда звучала (для выгрузки в «Лёгком»)
    // v21: слабое устройство (main.js включает, если картинка долго ниже ~24 кадров/с): не больше 10 разовых звуков
    // одновременно, слой обновляется 12 раз в секунду, без «эха» абстрактного слоя — меньше работы звуковому потоку
    // (треск/обрывы). На облегчённом (iPhone) предел голосов действует всегда. Обычные устройства — как было
    this.weak = false; this.voices = 0;
  }

  // v21: один запуск на все нажатия «Войти»; при ошибке контекст закрывается (раньше — второй AudioContext)
  start() {
    if (this.ready) return Promise.resolve();
    this._starting ??= this._start().catch(async e => {
      try { await this.ctx?.close(); } catch { /* уже закрыт */ }
      this.ctx = null; this.buffers = {}; this._loading = {};
      throw e;
    }).finally(() => { this._starting = null; });
    return this._starting;
  }

  // v22: iPhone — звук включается только тем, что сделано прямо в обработчике нажатия, до первого await: создать
  // AudioContext и вызвать resume(). Беззвучный переключатель iPhone глушит Web Audio — отключаем это: тип звуковой
  // сессии «playback» (Safari 17+) и тихий зацикленный <audio> (старые iOS: играющий медиа-элемент переводит сессию
  // в «воспроизведение»). Вызывать из обработчика нажатия; повторный вызов — снова будит звук (после блокировки экрана,
  // звонка — iOS ставит контекст в «interrupted»)
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* нет — не страшно */ }
    // latencyHint 'playback' (v12): звуковой буфер побольше — меньше риск «заиканий» звука, когда видеокарта/процессор
    // заняты картинкой (пользователь слышал «фризы»); задержка в ~0.1 с для фоновых звуков незаметна.
    // v22: на iPhone — родная частота устройства (с заказанной 32 кГц Safari пересчитывает весь звук — лишний риск
    // тишины и треска); облегчённая загрузка записей на iPhone остаётся
    if (!this.ctx) { try { this.ctx = new AC(this.lite && !this.ios ? { latencyHint: 'playback', sampleRate: 32000 } : { latencyHint: 'playback' }); } catch { this.ctx = new AC(); } }
    if (this.ctx.state !== 'running' && !this.paused) this.ctx.resume().catch(() => {});
    if (this.ios) {
      if (!this.keep) {   // 0.5 с тишины (WAV 8 кГц, 8 бит)
        const n = 4000, b = new Uint8Array(44 + n).fill(128), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
        this.keep = Object.assign(document.createElement('audio'), { src: URL.createObjectURL(new Blob([b], { type: 'audio/wav' })), loop: true });
        this.keep.setAttribute('playsinline', ''); this.keep.setAttribute('x-webkit-airplay', 'deny');
      }
      if (this.keep.paused && !this.paused) this.keep.play().catch(() => {});
    }
  }

  // v22: пауза — весь звук замирает на месте (контекст приостановлен) и продолжается с того же места. Без щелчка: общий
  // выход (this.out) за 60 мс плавно уходит в тишину, и только потом контекст останавливается; «Дальше» — контекст
  // включается, выход так же плавно возвращается (резкая остановка на полной громкости слышна как щелчок)
  setPaused(p) {
    this.paused = p;
    const ctx = this.ctx, g = this.out?.gain;
    clearTimeout(this._susT);
    if (ctx && g) {
      const ramp = to => { const t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + .06); };
      if (p) { ramp(0); this._susT = setTimeout(() => { if (this.paused) ctx.suspend().catch(() => {}); }, 120); }
      else ctx.resume().then(() => { if (!this.paused) ramp(1); }).catch(() => {});
    } else if (ctx) (p ? ctx.suspend() : ctx.resume()).catch(() => {});
    if (this.keep) p ? this.keep.pause() : this.keep.play().catch(() => {});
  }

  async _start() {
    // v21: браузер без Web Audio — вход без звука, а не «Не вышло — нажми ещё раз» по кругу
    if (!(window.AudioContext || window.webkitAudioContext)) throw Object.assign(new Error('этот браузер не поддерживает Web Audio'), { noAudio: true });
    this.unlock();   // обычно уже вызван из нажатия (main.js) — тогда контекст тот же
    const ctx = this.ctx;
    if (!ctx) throw Object.assign(new Error('звук не включился'), { noAudio: true });
    // v22: resume() в iOS иногда не отвечает (контекст «interrupted») — не ждём дольше 3 с, звук догонит при следующем нажатии
    const st = step('звук: включение');
    await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 3000))]);
    st.done(ctx.state === 'running' || 'long', ctx.state);
    if (this.paused) ctx.suspend().catch(() => {});   // пауза поставлена до конца входа — звук не включаем
    this.t0 = ctx.currentTime;

    // master: bus -> лимитер (как SC Limiter) -> выход; + посыл в ревербератор (как FreeVerb2)
    const bus = this.bus = ctx.createGain(); bus.gain.value = this.nature;
    const limiter = ctx.createDynamicsCompressor();
    // AudioParam — доступ только для чтения, менять надо .value, а не сам объект
    // (Object.assign(limiter, {threshold:{value:-3}}) в strict mode бросает TypeError и молча рвёт весь start()).
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = .003; limiter.release.value = .25;
    const dry = ctx.createGain(); dry.gain.value = .82;
    const sendG = ctx.createGain(); sendG.gain.value = .3;
    const conv = ctx.createConvolver(); conv.buffer = impulseResponse(ctx, 2.6, 2.2);
    const wet = ctx.createGain(); wet.gain.value = .55;
    bus.connect(dry); dry.connect(limiter);
    bus.connect(sendG); sendG.connect(conv); conv.connect(wet); wet.connect(limiter);
    // абстрактный слой (v14): свой вход — громкость по полоске «Музыка»; мимо «Природы», сильнее в реверберацию
    const absOut = this.absOut = ctx.createGain(); absOut.gain.value = this.music;
    const absWet = ctx.createGain(); absWet.gain.value = .9;
    absOut.connect(dry); absOut.connect(absWet); absWet.connect(conv);
    this.nextAbs = ctx.currentTime + rrand(15, 35); this.revBufs = new WeakMap();
    this.musicGen = new Music(ctx, absOut);   // v15: фоновая музыка по погоде (web/music.js), та же полоска «Музыка»
    // v22: общий выход — для паузы без щелчка (setPaused плавно уводит его в тишину); 1 — громкость как была
    const out = this.out = ctx.createGain(); limiter.connect(out); out.connect(ctx.destination);

    // v17: интернет-версия отдаёт сжатые записи — Opus, где браузер его понимает, иначе MP3 (старый Safari);
    // локальный serve.py параметр не читает и отдаёт WAV
    const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
    // v19: статический сайт (GitHub Pages, APK — build_site.py) — список записей (MP3) в samples.json рядом со страницей
    // v21: список проверяется — PWA-манифест (тот же адрес manifest.json на статическом сайте) за него не принимается
    const isList = m => m && Array.isArray(m.surf);
    const get = async u => { try { const r = await fetchIn(u, 10000); return r.ok ? await r.json() : null; } catch { return null; } };   // v24: не дольше 10 с
    const sl = step('звук: список записей');
    let man = await get(this.base + '/samples.json');
    if (!isList(man)) man = await get(this.base + '/manifest.json?fmt=' + (opus ? 'opus' : 'mp3'));
    sl.done(isList(man));
    if (!isList(man)) throw Object.assign(new Error('не найден список звуков (samples.json)'), { noAudio: true });   // v24: мир — без звука, а не «нажми ещё раз»
    this.manifest = man;
    if (this.lite) {   // v21: петли насекомых — только те, что заиграют (из 6/5 записей звучат 3/2, см. _buildInsects)
      const pick = (a, k) => (a || []).slice().sort(() => Math.random() - .5).slice(0, k);
      this.manifest = { ...this.manifest, insects_day: pick(this.manifest.insects_day, 3), insects_night: pick(this.manifest.insects_night, 2) };
    }
    // v24: вход ждёт только прибой, и не дольше 5 с — каждая запись прибоя вступает, как только распакована. Раньше вход
    // ждал прибой, три дождя и насекомых разом (20 записей, ~265 МБ распакованного звука) без предела времени: на слабом
    // телефоне распаковка падала или не возвращалась — «Открываю иллюминатор…» висело вечно. Ветер, гул глубины и музыка —
    // синтез, звучат сразу; дождь и насекомые подтягиваются после входа (на облегчённом — когда понадобятся, см. update)
    this.surf = []; this.rain = { light: [], heavy: [], water: [] }; this.insects = { day: [], night: [] };
    this._buildWind();
    this._buildDepth();
    const ss = step('звук: прибой');
    const surf = this._loadCategory('surf', !this.lite, b => { this._addSurf(b); ss.note(`${this.surf.length} из ${this.manifest.surf.length}`); });
    await within(surf, 5000, 'прибой').then(() => ss.done(this.surf.length > 0), e => { ss.done('long', e.message); console.warn('звук:', e.message, '— входим, прибой догрузится'); });
    this.ready = true;
    // остальное (плеск, птицы, киты...) подгружаем лениво по первому событию — не тормозим старт
    // v22: по одной категории за раз, а не все 16 разом: раньше за ~10 с после входа распаковывалось ~230 записей,
    // кадры стояли по 0.7–1.4 с (замер qa/perf_profile.mjs). Категория, чей звук нужен раньше очереди, грузится сразу
    // v21: на облегчённом — категория грузится при первом своём звуке (onEvent/playLocal ждут её)
    if (!this.lite) (async () => {
      for (const c of LOOPS) await this._loadLayer(c);
      for (const c of ['splash', 'gull', 'tern', 'cormorant', 'whale', 'whale_blow', 'horn', 'dolphin', 'orca', 'seal', 'fish', 'thunder', 'grasshopper', 'bubbles', 'shrimp', 'crab']) await this._loadCategory(c);
    })();
  }

  // v24: петля дождя или насекомых — загрузить и включить (один раз; не вышло — повтор при следующей просьбе)
  _loadLayer(cat) {
    return (this._layers ??= {})[cat] ??= this._loadCategory(cat).then(b => {
      if (!b.length) { delete this._layers[cat]; return; }
      if (cat.startsWith('rain_')) this.rain[cat.slice(5)] = this._rainLoops(b);
      else this.insects[cat === 'insects_day' ? 'day' : 'night'] = this._insectLoops(cat, b, cat === 'insects_day' ? 3 : 2);
    }).catch(() => { delete this._layers[cat]; });
  }

  // v24: «Лёгкое» — разовые записи, не звучавшие 2 минуты, выгружаются (загрузятся снова при следующем звуке); петли
  // (прибой, дождь, насекомые) не трогаем — они играют постоянно
  _evict(now) {
    if (!this.tiny || now - (this._evT ?? 0) < 15) return; this._evT = now;
    for (const c of Object.keys(this.buffers)) if (!LOOP_SET.has(c) && now - (this.used[c] ?? now) > 120) { delete this.buffers[c]; delete this._loading[c]; delete this.recent[c]; }
  }
  memMB() { let b = 0; for (const bs of Object.values(this.buffers)) for (const x of bs) b += x.length * x.numberOfChannels * 4; return b / 1048576; }

  // v22: чем распаковывать записи. На iPhone/iPad (облегчённый звук) контекст работает в родной частоте устройства (44.1/48
  // кГц), и записи, распакованные им, занимали в 1.5 раза больше памяти, чем в v21 (там весь звук был в 32 кГц), — а iOS
  // закрывает вкладку около 560 МБ. Поэтому там записи распаковываются отдельным «офлайн»-контекстом в 32 кГц (так же
  // занимают память, как в v21), а играет их основной контекст в родной частоте — пересчёт частоты он делает сам при
  // воспроизведении. Везде остальное — как было: распаковывает основной контекст
  _decoder() {
    if (!(this.lite && this.ios) || this.ctx.sampleRate === 32000) return this.ctx;
    if (this._dctx === undefined) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      try { this._dctx = OAC ? new OAC(1, 1, 32000) : null; } catch { this._dctx = null; }
    }
    return this._dctx || this.ctx;
  }

  async _loadCategory(cat, fast = false, onBuf = null) {
    if (this.buffers[cat]) return this.buffers[cat];
    if (this._loading[cat]) return this._loading[cat];
    this.used[cat] = this.ctx.currentTime;
    const files = (this.manifest[cat] || []);
    // v21: allSettled + r.ok — одна битая запись не глушит категорию; ничего не загрузилось — повтор при следующем звуке
    // v22: записи категории скачиваются вместе, а распаковываются по одной (очередь this._dec) и частями: распаковка,
    // нормализация и разбор записи — работа главного потока, пачкой они останавливали кадр. fast — для записей, без которых
    // не войти (прибой, дождь, насекомые): человек ждёт на экране входа — распаковка сразу и целиком (как в v21: в v22 вход
    // из-за очереди стал вдвое дольше)
    // v24: у скачивания (30 с) и распаковки (15 с) — предел времени: при нехватке памяти decodeAudioData на телефоне
    // может не вернуться вовсе — запись пропускается, очередь и вход идут дальше
    const one = async ab => {
      const step = fast ? Infinity : CHUNK, b = await normalize(await within(decode(this._decoder(), ab), 15000, `распаковка ${cat}`), .8, step);   // как b.normalize(0.8) в ocean_live.scd
      if (WINDOW[cat] || LEVEL.has(cat)) this.info.set(b, await analyse(b, step));
      onBuf?.(b);
      return b;
    };
    this._loading[cat] = Promise.allSettled(files.map(async f => {
      const r = await fetchIn(`${this.base}/samples/${cat}/${f}`, 30000);
      if (!r.ok) throw new Error(`${cat}/${f}: HTTP ${r.status}`);
      const ab = await within(r.arrayBuffer(), 30000, `${cat}/${f}`);
      return fast ? one(ab) : (this._dec = (this._dec || Promise.resolve()).catch(() => {}).then(() => one(ab)));
    })).then(res => {
      for (const x of res) if (x.status === 'rejected') console.warn('звук не загрузился:', x.reason?.message || x.reason);
      const bufs = res.filter(x => x.status === 'fulfilled').map(x => x.value);
      if (!bufs.length && files.length) { delete this._loading[cat]; return bufs; }
      if (LEVEL.has(cat)) { const r = bufs.map(b => this.info.get(b).rms).sort((a, b) => a - b); this.info.set(bufs, r[r.length >> 1]); }   // медиана категории
      this.buffers[cat] = bufs; return bufs;
    });
    return this._loading[cat];
  }

  // полоска «Природа»: громкость всего мира (волны, ветер, животные, дождь, насекомые) — это общий вход bus.
  // Квадрат — слух воспринимает громкость примерно логарифмически, так середина полоски звучит «вдвое тише»
  // полоска «Музыка» (v14): громкость абстрактного слоя
  setMusic(v01) {
    this.music = v01 * v01;
    if (this.absOut) this.absOut.gain.setTargetAtTime(this.music, this.ctx.currentTime, .05);
  }
  setNature(v01) {
    this.nature = v01 * v01;
    if (this.bus) this.bus.gain.setTargetAtTime(this.nature, this.ctx.currentTime, .05);
  }

  // --- постоянные слои -----------------------------------------------------
  // v24: по одной петле — как только запись распакована (вход не ждёт все шесть); громкость — с ближайшего update
  _addSurf(b) {
    const ctx = this.ctx, i = this.surf.length;
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    src.playbackRate.value = [1, .97, 1.03, .985, 1.015, .99][i % 6];
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 8000;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lpf); lpf.connect(g); g.connect(this.bus);
    src.start(0, Math.random() * b.duration);
    this.surf.push({ src, lpf, g });
  }
  // wind: синтез шума + фильтры (порт SynthDef(\wind) из ocean_synths.scd v3)
  _buildWind() {
    const ctx = this.ctx;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 400;
    const mid = ctx.createBiquadFilter(); mid.type = 'bandpass'; mid.Q.value = 2.2; mid.frequency.value = 900;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 4200;
    const nLow = noiseSource(ctx, 'pink'), nMid = noiseSource(ctx, 'pink'), nHigh = noiseSource(ctx, 'white');
    const gLow = ctx.createGain(), gMid = ctx.createGain(), gHigh = ctx.createGain(), gust = ctx.createGain(), out = ctx.createGain();
    gLow.gain.value = .6; gMid.gain.value = .45; gHigh.gain.value = .2; out.gain.value = 0;   // веса как в SynthDef(\wind)
    nLow.connect(low); low.connect(gLow); gLow.connect(gust);
    nMid.connect(mid); mid.connect(gMid); gMid.connect(gust);
    nHigh.connect(high); high.connect(gHigh); gHigh.connect(gust);
    gust.connect(out); out.connect(this.bus);
    this.wind = { low, mid, high, gustGain: gust, out, wLow: wander(.11), wMid: wander(.44), wGust: wander(.77) };
  }
  // depth: гул глубины (порт SynthDef(\depth))
  _buildDepth() {
    const ctx = this.ctx;
    const rumble = ctx.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 70;
    const n = noiseSource(ctx, 'brown'); n.connect(rumble);
    const modal = ctx.createOscillator(); modal.frequency.value = 44; modal.type = 'sine';
    const modalG = ctx.createGain(); modalG.gain.value = .04; modal.connect(modalG); modal.start();
    const g = ctx.createGain(); g.gain.value = 0;
    rumble.connect(g); modalG.connect(g); g.connect(this.bus);
    this.depth = { rumble, g, w: wander(.29) };
  }
  _rainLoops(bufs) {
    const ctx = this.ctx;
    return bufs.map(b => {
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 14000;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lpf); lpf.connect(g); g.connect(this.bus);
      src.start(0, Math.random() * b.duration);
      return { g };
    });
  }

  // насекомые у острова: слышны, только когда камера близко (this.prox); днём цикады/поющие насекомые, ночью сверчки.
  // Несколько петель одновременно с разными скоростями — «разные насекомые», а не одна запись по кругу.
  _insectLoops(cat, bufs, k) {
    const ctx = this.ctx;
    return bufs.slice().sort(() => Math.random() - .5).slice(0, k).map((b, i) => {
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.playbackRate.value = [1, .96, 1.05][i % 3];
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;   // без «гула» полевой записи
      // v15: и без «шипения» — выше 7 кГц у полевых записей насекомых в основном ровный шум (пользователь: «белый шум»)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(g); if (pan) { pan.pan.value = [-.5, .5, 0][i % 3]; g.connect(pan); pan.connect(this.bus); } else g.connect(this.bus);
      src.start(0, Math.random() * b.duration);
      return { g, k: clamp((this.info.get(this.buffers[cat]) || 1) / (this.info.get(b)?.rms || 1), .5, 2) };   // выровнять по средней громкости
    });
  }

  // --- вызывать на каждый /state (та же математика, что в OSCdef(\state)) --
  update(s) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, t = now - this.t0;
    if (this.weak) { if (now - (this._upd ?? -1) < .083) return; this._upd = now; }   // v21: слабое устройство — 12 раз/с
    const night = lerp(.75, 1, s.daylight);
    const rl = s.rain_active ? clamp((s.rain - .4) / .4) : 0;   // сила дождя 0..1 — только когда дождь объявлен (синхронно с журналом/картинкой)
    const storm = rl;
    const waveEff = Math.min(1, s.wave_height + storm * .3);
    const windEff = Math.min(1, s.wind_speed + storm * .6);
    const surfAmp = .18 * night * (1 + storm * .7);
    const dark = lerp(.55, 1, s.daylight);

    for (const layer of this.surf) {
      layer.g.gain.setTargetAtTime(surfAmp * this.mix.surf * lerp(.3, 1, waveEff), now, .8);
      layer.lpf.frequency.setTargetAtTime(lerp(2500, 12000, waveEff) * dark, now, .8);
    }
    const w = this.wind;
    w.out.gain.setTargetAtTime(.25 * this.mix.wind * night * (1 + storm * 1.4) * lerp(.05, 1, windEff) * (.3 + w.wGust(t) * .7), now, 1.0);   // gust = LFNoise1.range(0.3, 1.0)
    w.low.frequency.setTargetAtTime(280 + windEff * 420, now, 1.0);
    w.mid.frequency.setTargetAtTime(lerp(400, 2000, w.wMid(t)) * lerp(.5, 1.5, windEff), now, 1.0);

    const d = this.depth;
    d.g.gain.setTargetAtTime((.3 + s.tension * .6) * .42 * this.mix.depth * lerp(.6, 1.0, d.w(t)), now, 1.0);
    d.rumble.frequency.setTargetAtTime(55 + s.tension * 45, now, 1.0);

    this.musicGen.update(s, now);
    if (now > this.nextAbs) {   // абстрактный слой: чаще ночью и в тишину, реже днём и в дождь
      if (!this.weak) this._abstract(s);   // v21: на слабом устройстве — без него (много голосов разом)
      this.nextAbs = now + rrand(25, 70) * (s.daylight > .5 ? 1.4 : .8) * (rl > .3 ? 2 : 1);
    }
    const on = !!s.rain_active;
    this.rainOn = on;
    // v24: облегчённый — дождь грузится, когда пошёл, насекомые — когда камера подлетела к острову; «Лёгкое» — выгрузка
    if (this.lite) { if (on) for (const c of ['rain_light', 'rain_water', 'rain_heavy']) this._loadLayer(c); if (this.prox > .02) for (const c of ['insects_day', 'insects_night']) this._loadLayer(c); }
    this._evict(now);
    const heavy = clamp((s.rain - .55) / .25);
    for (const g of this.rain.light) g.g.gain.setTargetAtTime(on ? rl : 0, now, 20);
    for (const g of this.rain.water) g.g.gain.setTargetAtTime(on ? rl : 0, now, 20);
    for (const g of this.rain.heavy) g.g.gain.setTargetAtTime(on ? heavy : 0, now, 20);
    // насекомые: только у острова, днём — дневные, ночью — сверчки; в дождь и сильный ветер замолкают
    const ik = this.prox * this.mix.insects * (1 - rl) * (1 - clamp((s.wind_speed - .55) / .3)), dayK = clamp(s.daylight * 1.4);
    // v15: тише на ~4 дБ (было .055/.065) — слой насекомых у острова давал больше всего «шипения»
    for (const g of this.insects.day) g.g.gain.setTargetAtTime(.035 * ik * dayK * g.k, now, .6);
    for (const g of this.insects.night) g.g.gain.setTargetAtTime(.04 * ik * (1 - dayK) * g.k, now, .6);
  }

  // --- вызывать на каждое /event (порт OSCdef(\event)) ----------------------
  async onEvent(e) {
    if (!this.ready) return;
    this.musicGen?.onEvent(e, this.ctx.currentTime);   // музыка слышит мир: живее — чаще ноты, голоса зверей откликаются
    const sp = SPEC[e.type]; if (!sp) return;
    if (e.delay) await new Promise(r => setTimeout(r, e.delay * 1000));
    const [cat, r0, r1, a0, a1, l0, l1, atk, rel] = sp;
    this.used[cat] = this.ctx.currentTime;
    const bufs = this.buffers[cat] || await this._loadCategory(cat);
    if (!bufs.length) return;
    const dist = e.distance ?? .5, voice = e.agent ? (e.voice || e.agent) : 0;
    const n = (cat === 'splash' && e.intensity > .6 && Math.random() < .4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const rec = this.recent[cat] || [];
      const pool = bufs.filter(b => !rec.includes(b));
      const buf = voice > 0 && !SPREAD.has(cat) ? bufs[(((voice * 7) % bufs.length) + ((voice + i) % 3)) % bufs.length]
                            : choice(pool.length ? pool : bufs);
      this.recent[cat] = [...rec, buf].slice(-Math.max(1, Math.min(6, bufs.length - 1)));
      // высота: у особи своя (voice) + v12 лёгкий случайный сдвиг ±4% — один и тот же кусок не звучит одинаково
      const rate = (voice > 0 ? r0 + (r1 - r0) * ((voice % 13) / 12) * rrand(.9, 1.1) : rrand(r0, r1)) * rrand(.96, 1.04);
      let amp = rrand(a0, a1) * lerp(.6, 1.0, e.intensity ?? .5) * Math.max(.3, 1 - dist * .5);
      if (LEVEL.has(cat)) amp *= clamp(this.info.get(bufs) / (this.info.get(buf)?.rms || 1), .6, 2.5);
      const [off, len] = this._window(buf, cat);
      setTimeout(() => this._oneShot(buf, rate, amp, rrand(l0, l1) * (1 - dist * .4), atk, rel, clamp((e.panorama ?? .5) + rrand(-.05, .05)), cat, off, len),
        i * rrand(80, 300));
    }
  }

  // --- абстрактный слой, как у образца (v14) -------------------------------
  // Изредка из звуков самого мира рождается их искажённое «эхо»: кусок записи (кит, чайка, дельфин, бульки, косатка,
  // лев, гудок, сверчки) — замедленный в 2–4 раза (глубокий гул) или ускоренный (звон), иногда задом наперёд, через узкую
  // полосу с плывущей частотой, с долгим нарастанием и спадом, почти целиком в реверберации, медленно плывёт по стерео.
  // Треть раз — «осколки»: 8–18 крошечных кусочков одной записи на нотах пентатоники, россыпью за 2–4 с
  _abstract(s) {
    const ctx = this.ctx, now = ctx.currentTime;
    const cats = ['whale', 'gull', 'dolphin', 'bubbles', 'orca', 'seal', 'horn', 'insects_night', 'whale_blow'].filter(c => this.buffers[c]?.length);
    if (!cats.length) return;
    const buf0 = choice(this.buffers[choice(cats)]), rev = Math.random() < .35, buf = rev ? this._reversed(buf0) : buf0;
    const out = (node, t0, t1, p0, p1) => {   // панорама плывёт от p0 к p1
      if (!ctx.createStereoPanner) { node.connect(this.absOut); return; }   // v22: Safari до 14.1 — без панорамы
      const pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(p0, t0); pan.pan.linearRampToValueAtTime(p1, t1);
      node.connect(pan); pan.connect(this.absOut);
    };
    if (Math.random() < .33) {   // осколки на нотах пентатоники
      const notes = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3], oct = choice([.5, 1, 1, 2]), n = 8 + (Math.random() * 11 | 0), span = rrand(2, 4);
      const at = rrand(0, Math.max(0, buf.duration - .5));
      for (let i = 0; i < n; i++) {
        const t = now + i / n * span + rrand(0, .08), len = rrand(.06, .16), r = choice(notes) * oct;
        const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = r;
        const env = ctx.createGain(), a = rrand(.02, .05) * (1 - i / n * .5);
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(a, t + len * .3); env.gain.linearRampToValueAtTime(0, t + len);
        src.connect(env); out(env, t, t + len, rrand(-.9, .9), rrand(-.9, .9));
        src.start(t, Math.max(0, Math.min(buf.duration - .2, at + rrand(-.2, .2) + (Math.random() < .5 ? 0 : i * .03)))); src.stop(t + len + .05);   // v21: не меньше 0
      }
      return;
    }
    const deep = Math.random() < .7, rate = deep ? rrand(.25, .55) : rrand(1.6, 2.4);
    const off = rrand(0, Math.max(0, buf.duration - 4)), len = Math.min(rrand(1.5, 4), buf.duration - off), dur = len / rate;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    src.detune.setValueAtTime(0, now); src.detune.linearRampToValueAtTime(rrand(-300, 300), now + dur);   // высота медленно «плывёт»
    const f0 = deep ? rrand(200, 900) : rrand(1500, 4000), q = rrand(1.5, 5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, now); bp.frequency.exponentialRampToValueAtTime(f0 * rrand(.5, 2), now + dur);
    const env = ctx.createGain(), a = rrand(.03, .06) * Math.sqrt(q);   // узкая полоса съедает громкость — возвращаем
    env.gain.setValueAtTime(0, now); env.gain.linearRampToValueAtTime(a, now + dur * .4); env.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(bp); bp.connect(env); out(env, now, now + dur, rrand(-.8, .8), rrand(-.8, .8));
    src.start(now, off, len); src.stop(now + dur + .1);
  }
  _reversed(buf) {
    let r = this.revBufs.get(buf);
    if (!r) {
      r = this.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      // v22: прямо в новый буфер, без промежуточной копии (до 27 МБ мусора на запись кита — лишняя сборка мусора)
      for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = r.getChannelData(c), n = s.length - 1; for (let i = 0; i <= n; i++) d[i] = s[n - i]; }
      this.revBufs.set(buf, r);
    }
    return r;
  }

  // разовый «местный» звук от картинки (кузнечик прыгнул рядом с камерой): cat — папка, pan01/dist — от камеры
  async playLocal(cat, pan01 = .5, dist = 0, amp = .06, rate = 1) {
    if (!this.ready) return;
    this.used[cat] = this.ctx.currentTime;
    const bufs = this.buffers[cat] || await this._loadCategory(cat);
    if (!bufs.length) return;
    const rec = this.recent[cat] || [], pool = bufs.filter(b => !rec.includes(b)), buf = choice(pool.length ? pool : bufs);
    this.recent[cat] = [...rec, buf].slice(-Math.max(1, bufs.length - 1));   // v12: не одна и та же запись подряд
    const [off, len] = this._window(buf, cat);
    this._oneShot(buf, rate * rrand(.9, 1.15), amp * (1 - dist * .7), rrand(6000, 11000), .01, .3, pan01, cat, off, len);
  }

  // кусок записи для разового звука: [начало, длина] в секундах записи (длина null — до конца). Начало — одно из
  // «вступлений» (analyse), чтобы кусок не начинался с тишины или с середины крика
  _window(buf, cat) {
    const w = WINDOW[cat], inf = this.info.get(buf);
    if (!w || !inf || buf.duration < w[1] + .5) return [0, null];
    const on = inf.on.filter(t => t < buf.duration - w[0]), off = on.length ? choice(on) : 0;
    return [off, Math.min(rrand(w[0], w[1]), buf.duration - off)];
  }

  _oneShot(buf, rate, amp, lpfHz, atk, rel, pan01, cat = '', off = 0, len = null) {
    if ((this.weak || this.lite) && this.voices >= 10) return;   // v21: предел одновременных голосов на слабых устройствах
    const ctx = this.ctx, now = ctx.currentTime;
    const dur = (len ?? buf.duration - off) / rate, env = ctx.createGain(), lpf = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    lpf.type = 'lowpass'; lpf.frequency.value = lpfHz;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    // короткая запись + длинная атака/спад (кит: 2с/3с) иначе съедают друг друга — звук либо не
    // успевает разгореться, либо обрывается на полпути фейда. Ужимаем atk/rel под факт. длину клипа.
    const budget = dur * .92, k = budget < atk + rel ? budget / (atk + rel) : 1;
    const atk2 = atk * k, rel2 = rel * k, sustain = Math.max(.01, dur - atk2 - rel2);
    env.gain.setValueAtTime(0, now);
    amp *= this.mix.event;
    env.gain.linearRampToValueAtTime(amp, now + atk2);
    env.gain.setValueAtTime(amp, now + atk2 + sustain);
    env.gain.linearRampToValueAtTime(0, now + atk2 + sustain + rel2);
    src.connect(lpf); lpf.connect(env);
    if (panner) { panner.pan.value = pan01 * 2 - 1; env.connect(panner); panner.connect(this.bus); }
    else env.connect(this.bus);
    this.voices++; src.onended = () => this.voices--;
    src.start(now, off); src.stop(now + dur + .05);
  }
}

// v22: распаковка с обратным вызовом — так она работает и в старом Safari (до 14.1 decodeAudioData не возвращала
// Promise: звук на таких iPhone не загружался вовсе), и в новых браузерах
// v24: скачивание с пределом времени (AbortController — есть и в старом Safari)
const fetchIn = (u, ms) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); return fetch(u, { signal: ac.signal }).finally(() => clearTimeout(t)); };
const LOOPS = ['rain_light', 'rain_water', 'rain_heavy', 'insects_day', 'insects_night'], LOOP_SET = new Set(['surf', ...LOOPS]);
const decode = (ctx, ab) => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p?.catch) p.catch(rej); });
// v22: длинные циклы по записи — частями по ~0.25 млн отсчётов с паузой между ними (запись кита — 3.4 млн отсчётов,
// одним куском это десятки мс на телефоне посреди кадра). Порядок вычислений прежний — результат тот же
const CHUNK = 1 << 18, pause = () => new Promise(r => setTimeout(r, 0));

// громкость (rms) и «вступления» записи: 50-мс окна, где энергия резко растёт после тишины (начало крика/всплеска)
async function analyse(buf, step = CHUNK) {
  const d = buf.getChannelData(0), win = Math.round(buf.sampleRate * .05), n = Math.floor(d.length / win), e = new Float32Array(n);
  let sum = 0, mx = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let k = i * win; k < (i + 1) * win; k++) s += d[k] * d[k]; e[i] = s / win; sum += s; mx = Math.max(mx, e[i]);
    if (step !== Infinity && (i + 1) % Math.max(1, step / win | 0) === 0) await pause(); }
  const on = [0];
  for (let i = 3; i < n; i++) {
    const before = (e[i - 1] + e[i - 2] + e[i - 3]) / 3;
    if (e[i] > mx * .03 && e[i] > before * 4 && i * .05 - on[on.length - 1] > .8) on.push(Math.max(0, i * .05 - .04));
  }
  return { rms: Math.sqrt(sum / d.length), on };
}

// пиковая нормализация буфера (на месте) — порт Buffer.normalize из SuperCollider
async function normalize(buf, peak, step = CHUNK) {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c);
    for (let i0 = 0; i0 < d.length; i0 += step) { for (let i = i0, e = Math.min(d.length, i0 + step); i < e; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } if (step !== Infinity) await pause(); } }
  if (m > 0) { const g = peak / m; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c);
    for (let i0 = 0; i0 < d.length; i0 += step) { for (let i = i0, e = Math.min(d.length, i0 + step); i < e; i++) d[i] *= g; if (step !== Infinity) await pause(); } } }
  return buf;
}

// --- шумовые источники и импульс для реверберации (без внешних файлов) -----
function noiseSource(ctx, kind) {
  const n = 8 * ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);   // 8 с: низы brown успевают «погулять»
  // спектры как у PinkNoise/BrownNoise в SuperCollider (сверено с записью колонки): прежнее «pink» (однополюсный
  // фильтр) было заметно ярче настоящего розового, а «brown» слабее в самом низу — отсюда «белый шум» в браузере
  let last = 0, peak = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') { last = (last + w * .02) * .9995; d[i] = last; }   // случайное блуждание, −6 дБ/окт
    else {   // pink: фильтр Пола Келлета (−3 дБ/окт в звуковом диапазоне)
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926;
    }
  }
  // бесшовная петля: убираем постоянную составляющую и линейный дрейф, чтобы конец совпал с началом (иначе щелчок на стыке)
  let mean = 0; for (let i = 0; i < n; i++) mean += d[i]; mean /= n;
  const drift = d[n - 1] - d[0];
  for (let i = 0; i < n; i++) { d[i] -= mean + drift * (i / (n - 1) - .5); if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]); }
  // нормализация по пику: у brown/pink интегратора разброс энергии непредсказуем без этого —
  // без нормализации случайно получали шум громче ±1.0 (клиппинг, отсюда лишняя резкость/«шипение»)
  const g = peak > 0 ? .7 / peak : 1;
  for (let i = 0; i < n; i++) d[i] *= g;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start(0, Math.random() * 7);
  return src;
}
function impulseResponse(ctx, seconds, decay) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}
