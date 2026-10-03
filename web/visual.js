// Abyssonata — картинка, версия 6 «живой мир» (22.09.2026, решение пользователя: «смешанный» стиль).
// Было (v5): остров-диорама в чёрной пустоте по образцу, которым вдохновлён проект (см. README), существа —
// абстрактные метки.
// Стало: понятно и ребёнку — большой остров с рельефом (пляж, трава, скалы, пальмы), океан до горизонта
// с волнами и прозрачным мелководьем, небо (днём голубое, закат, ночью звёзды на все 360°), солнце, луна,
// облака по ветру, настоящие 3D-животные (модели CC0/CC-BY — web/models/CREDITS.txt). От образца оставлены
// кораллы-«молекулы» на скалах, пена-крошка по кромке, золотистые водоросли и светящаяся ночью лагуна.
// Координаты существ из симуляции прежние (x — «лево/право», d — «от берега вдаль»), здесь x превращается
// в угол вокруг острова, d — в расстояние от берега (см. W()).
import * as THREE from './three.module.min.js';   // v21: без import map (её нет в Safari до iOS 16.4)
import { OrbitControls } from './three-addons/controls/OrbitControls.js';
import { GLTFLoader } from './three-addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from './three-addons/utils/SkeletonUtils.js';
import { mergeGeometries } from './three-addons/utils/BufferGeometryUtils.js';
import { Noise2D } from './noise.js';
import { step, within } from './boot.js';
THREE.ColorManagement.enabled = false;

const $ = s => document.querySelector(s);
// v22: «нажатие» в листаемом списке — короткое (до 0.6 с) и почти без движения (до 8 px); начал листать — не нажатие
// (браузер, начиная прокрутку, присылает pointercancel). fn получает элемент строки, найденный при касании
function tapOnly(box, sel, fn) {
  let d = null;
  box.addEventListener('pointerdown', e => { const r = e.target.closest(sel); d = r && (e.pointerType === 'mouse' ? e.button === 0 : true) ? { r, id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  box.addEventListener('pointermove', e => { if (d && e.pointerId === d.id && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d = null; });
  box.addEventListener('pointercancel', () => { d = null; });
  box.addEventListener('pointerup', e => { if (d && e.pointerId === d.id && performance.now() - d.t < 600 && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 8) fn(d.r, e); d = null; });
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const mix3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const rnd = (a, b) => a + Math.random() * (b - a);
// v23: на время fn Math.random — свой повторяемый генератор: новые украшения не сдвигают случайные числа мира (с ?rseed
// мир и звери те же, что в main, — честное сравнение кадров и снимки «было / стало»)
const LAZY = new Set(['shark', 'orca']);   // v24: в «Лёгком» — модель при первом появлении
const seededRandom = (seed, fn) => {
  const mr = Math.random; let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = mr; }
};
const V3 = THREE.Vector3;

// небо и вода по времени суток: zen — зенит, hor — горизонт (и туман), sh/deep — мелководье/глубина
const PAL = {
  // v8: темнее вокруг острова (пользователь: «глаз цепляется за пустоту»), остров остаётся светлым — фокус на нём
  day:   { zen: rgb('#6c8394'), hor: rgb('#aab5b4'), sh: rgb('#78bdb8'), deep: rgb('#21425a') },
  dusk:  { zen: rgb('#383c64'), hor: rgb('#b58877'), sh: rgb('#6aa8b8'), deep: rgb('#1f3050') },
  night: { zen: rgb('#020308'), hor: rgb('#070d1a'), sh: rgb('#2a70ff'), deep: rgb('#040b18') },   // ночью лагуна светится (биолюминесценция, привет образцу)
  storm: { zen: rgb('#46505a'), hor: rgb('#7d8790'), sh: rgb('#3f8c8a'), deep: rgb('#1d3a4a') },
};
const BIRDS = new Set(['seagull', 'tern', 'cormorant', 'pelican', 'albatross']);
const BIRD_ALT = { seagull: 13, tern: 10, cormorant: 5, pelican: 0, albatross: 22 };
const NAMES = { hatchling: 'Черепашата', seagull: 'Чайка', tern: 'Крачка', cormorant: 'Баклан', pelican: 'Пеликан', albatross: 'Альбатрос',
  dolphin: 'Дельфин', whale: 'Кит', sea_lion: 'Морской лев', fish_school: 'Косяк рыб', shark: 'Акула', orca: 'Косатка',
  jellyfish: 'Медуза', shrimp_swarm: 'Рой креветок', octopus: 'Осьминог', stingray: 'Скат', sea_turtle: 'Морская черепаха', starfish: 'Морская звезда', crab: 'Краб',
  ship: 'Пароход' };

// ------------------------------------------------------------------ рельеф острова
const R = 30, S = 120;                      // радиус главного острова; половина стороны карты рельефа (v11: 90 → 120 — островки и риф дальше)
const NZ = new Noise2D(20260922);
const nz = (x, z) => NZ.noise2(x, z);
const fbm = (x, z, o = 4) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * nz(x * f + i * 17.3, z * f - i * 9.1); n += a; a *= .5; f *= 2; } return s / n; };
// островки вокруг главного (v11, по скриншоту пользователя: прежние три крупнее + четыре новых): x, z, радиус берега, высота холмов.
// Раньше это были гауссовы «горбы» от дна, над водой торчала макушка в 2 м; теперь у каждого свой пляж, отмель и холмы
const ISLETS = [[60, -32, 12, 6], [-54, -46, 11, 5], [-30, 62, 7, 4], [-92, -36, 7, 3], [-20, -72, 8, 4.5], [42, -70, 6, 2.5], [86, -8, 7, 5]];
export function islandH(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const coast = R * (1 + .24 * nz(Math.cos(a) * 1.2 + 3, Math.sin(a) * 1.2 + 3) + .08 * nz(Math.cos(a) * 4 + 9, Math.sin(a) * 4));
  const t = r / coast;
  let h = lerp(-10, .7, smooth(1.75, .9, t));                         // подводная отмель → пляж
  const inland = smooth(.92, .5, t);
  // v22: шумы холмов и скал — только на суше: в воде их вклад умножается на inland = 0 (и hill = 0 у островков).
  // Результат тот же до бита (qa/terrain_check.mjs), а для точек в воде — их у зверей большинство — в 2–3 раза быстрее:
  // на слабом устройстве islandH занимала до 40% кадра (qa/perf_profile.mjs, CPU ×4)
  if (inland > 0) {
    h += inland * (1.2 + 2.2 * (fbm(x * .05, z * .05) * .5 + .5));       // холмы с травой
    h += inland * Math.pow(Math.max(0, fbm(x * .045 + 40, z * .045 - 7, 3) + .15), 1.6) * 17;   // скалистые вершины
  }
  for (const [cx, cz, rad, ht] of ISLETS) {   // островок — тот же профиль, что у главного, в своём масштабе
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d > rad * 2.2) continue;
    const ai = Math.atan2(dz, dx), ti = d / (rad * (1 + .22 * nz(Math.cos(ai) * 1.1 + cx, Math.sin(ai) * 1.1 + cz)));
    const hill = smooth(.92, .45, ti);
    h = Math.max(h, lerp(-10, .7, smooth(1.75, .9, ti)) + (hill > 0 ? hill * (.8 + ht * (fbm(x * .07 + cx, z * .07 + cz, 3) * .5 + .5)) : 0));
  }
  h += reefH(x, z);
  return h;
}
// коралловый риф: подводная гряда дугой вокруг острова (v11: пользователь просил больше и дальше — была прямая
// полоса 64 м в 54 м от центра, стала дуга ~140 м в 82 м), макушки на 1–4 м под водой — видно кораллы и рыб
export const REEF = { r: 82, half: .85, width: 8, top: 8.2 };   // радиус дуги, полуугол (рад, от +z), ширина, высота над дном
export function reefH(x, z) {
  const along = 1 - smooth(REEF.half * .6, REEF.half, Math.abs(Math.atan2(x, z)));
  if (along <= 0) return 0;
  const across = Math.exp(-(((Math.hypot(x, z) - REEF.r) / REEF.width) ** 2));
  return REEF.top * across * along * (.65 + .5 * (nz(x * .12, z * .12) * .5 + .5));
}
// случайная точка на гряде рифа: поперёк — в пределах k·ширины
const reefPoint = (k = 1) => { const a = rnd(-REEF.half, REEF.half), r = REEF.r + rnd(-k, k) * REEF.width; return [Math.sin(a) * r, Math.cos(a) * r]; };

// «места» симуляции (agents.js SITES): 0 — главный остров, 1..7 — островки ISLETS; центр и радиус берега
const siteOf = k => (k > 0 && ISLETS[k - 1] ? { cx: ISLETS[k - 1][0], cz: ISLETS[k - 1][1], r: ISLETS[k - 1][2] } : { cx: 0, cz: 0, r: R });
// кромка берега места k на луче под углом a: где рельеф опускается до высоты h (0.5 — край пляжа, −2 — отмель).
// Луч считается один раз на угол (кэш): существ на берегу мало, а кадров много
const _edge = new Map();
function shoreAt(k, a, h = .5) {
  const s = siteOf(k), key = `${k}|${a.toFixed(2)}|${h}`;
  let r = _edge.get(key);
  if (r === undefined) { r = s.r * .3; while (r < s.r * 3 && islandH(s.cx + Math.sin(a) * r, s.cz + Math.cos(a) * r) > h) r += .25; _edge.set(key, r); }
  return { x: s.cx + Math.sin(a) * r, z: s.cz + Math.cos(a) * r, dx: Math.sin(a), dz: Math.cos(a) };
}
// v24: высота рельефа для покадровых проверок зверей (мель под «пятном», земля под лапами) — из готовой карты 512²
// (Visual._buildTerrain, билинейно), а не islandH (шумы): на телефоне islandH была ~10% всего JS кадра. Разница —
// сантиметры; за краем карты рельеф и так ровно −10 (islandH там даёт то же). До постройки карты — islandH
let HM = null;
function hq(x, z) {
  if (!HM) return islandH(x, z);
  const TS = 512, fx = (x + S) / (2 * S) * TS - .5, fz = (z + S) / (2 * S) * TS - .5;
  if (!(fx >= 0 && fz >= 0 && fx < TS - 1 && fz < TS - 1)) return -10;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * TS + i;
  return (HM[k] * (1 - u) + HM[k + 1] * u) * (1 - v) + (HM[k + TS] * (1 - u) + HM[k + TS + 1] * u) * v;
}
// высота земли под «лапами»: максимум по пятну радиуса rad — на склоне зверь не уходит брюхом в песок
// v24: сетка флоры для поиска растений рядом со зверем (_floraAvoid): клетки 8 м на ±176 м
const FNG = 44, fCell = v => Math.min(FNG - 1, Math.max(0, Math.floor((v + 176) / 8)));
const groundAt = (x, z, rad) => Math.max(hq(x, z), hq(x + rad, z), hq(x - rad, z), hq(x, z + rad), hq(x, z - rad));
// v12: крупные звери заплывали в острова. deepSpot двигает точку p туда, где под всем «пятном» радиуса rad глубже need:
// прочь от самого мелкого места пятна (центр и 12 точек на двух кольцах — островок меньше пятна кита не проскочит),
// шагами по step метров. ponytail: жадный поиск, в узком проливе между двумя островками может не найти — тогда
// страхует _separate (толкает с мели каждый кадр)
const PROBE = [...Array(8)].map((_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4), 1])
  .concat([...Array(4)].map((_, k) => [Math.cos(k * Math.PI / 2 + .8), Math.sin(k * Math.PI / 2 + .8), .5]));
function deepSpot(p, need, rad, step = 3, iters = 30) {
  for (let i = 0; i < iters; i++) {
    let g = hq(p.x, p.z), bx = 0, bz = 0;
    for (const [c, sn, k] of PROBE) { const h = hq(p.x + c * rad * k, p.z + sn * rad * k); if (h > g) { g = h; bx = c * k; bz = sn * k; } }
    if (g <= need) return p;
    if (bx || bz) { const l = Math.hypot(bx, bz); p.x -= bx / l * step; p.z -= bz / l * step; }
    else { const e = 2, gx = hq(p.x + e, p.z) - hq(p.x - e, p.z), gz = hq(p.x, p.z + e) - hq(p.x, p.z - e), L = Math.hypot(gx, gz) || 1; p.x -= gx / L * step; p.z -= gz / L * step; }
  }
  // v18: на холмистой макушке островка жадный поиск топчется на месте (пеликан «садился» на остров) — тогда прочь
  // от центра ближайшего острова по прямой, пока под пятном не станет глубоко
  if (iters > 1 && shoal(p.x, p.z, rad, need) > 0) {
    let c = { cx: 0, cz: 0, r: R }; for (let k = 1; k <= ISLETS.length; k++) { const q = siteOf(k); if (Math.hypot(p.x - q.cx, p.z - q.cz) / q.r < Math.hypot(p.x - c.cx, p.z - c.cz) / c.r) c = q; }
    const dx = p.x - c.cx, dz = p.z - c.cz, L = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 60 && shoal(p.x, p.z, rad, need) > 0; i++) { p.x += dx / L * step; p.z += dz / L * step; }
  }
  return p;
}
// v18: насколько мелко под «пятном» радиуса rad: сумма «лишней» высоты над need в центре и на кольцах PROBE (0 — везде
// глубоко). Сумма, а не максимум: по максимуму круг, задевший вершину островка, мог «переехать» через неё
const shoal = (x, z, rad, need) => { let g = Math.max(0, hq(x, z) - need); for (const [c, sn, k] of PROBE) g += Math.max(0, hq(x + c * rad * k, z + sn * rad * k) - need); return g; };
// v18: шаг якоря пловца к цели в обход мели. Раньше якорь шёл к цели по прямой, а от мели его отталкивало слабее
// (0.7 хода) — кит медленно, но «проезжал» через островок. Теперь: прямо, если впереди глубоко; иначе отклоняемся
// (сначала в ту же сторону, что и в прошлый раз — не виляем) до 160°; мелко уже здесь — годится только шаг на глубину
// v19: путь в обход мели — A* по сетке NAV_C м на карте рельефа (±S; за её краем везде глубоко). Жадный шаг (swimStep)
// застревал в «карманах» у рифа и островков: кит стоял у рифа, дельфины не доходили до косяка в лагуне. Проходимость
// клетки — «под пятном rad глубже need» — считается один раз на пару (need, rad)
const NAV_C = 6, NAV_N = Math.round(2 * S / NAV_C) + 1, _nav = new Map();
function navGrid(need, rad) {
  const key = need + '|' + rad; let g = _nav.get(key); if (g) return g;
  g = new Uint8Array(NAV_N * NAV_N);
  for (let i = 0; i < NAV_N; i++) for (let j = 0; j < NAV_N; j++) g[i * NAV_N + j] = shoal(-S + i * NAV_C, -S + j * NAV_C, rad, need) > 0 ? 0 : 1;
  _nav.set(key, g); return g;
}
const cellOf = v => Math.round((clamp(v, -S, S) + S) / NAV_C);
// путь от p к t: список точек-клеток (без стартовой) или null (пути нет — идём как раньше, напрямую)
function navPath(p, t, need, rad) {
  const g = navGrid(need, rad), N = NAV_N, idx = (i, j) => i * N + j;
  const s = idx(cellOf(p.x), cellOf(p.z));
  let e = idx(cellOf(t.x), cellOf(t.z));
  if (!g[e]) {   // цель на «непроходимой» клетке (сетка грубее deepSpot) — ближайшая проходимая
    let best = -1, bd = 1e9; const ei = cellOf(t.x), ej = cellOf(t.z);
    for (let di = -4; di <= 4; di++) for (let dj = -4; dj <= 4; dj++) { const i = ei + di, j = ej + dj;
      if (i >= 0 && j >= 0 && i < N && j < N && g[idx(i, j)] && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = idx(i, j); } }
    if (best < 0) return null; e = best;
  }
  const G = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), heap = [[0, s]];
  const hh = k => Math.hypot(((k / N) | 0) - ((e / N) | 0), (k % N) - (e % N));
  G[s] = 0;
  const push = it => { heap.push(it); let c = heap.length - 1; while (c) { const q = (c - 1) >> 1; if (heap[q][0] <= heap[c][0]) break; [heap[q], heap[c]] = [heap[c], heap[q]]; c = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0;
    for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  let best = s, bh = hh(s);
  while (heap.length) {
    const [, k] = pop(); if (k === e) break;
    const h = hh(k); if (h < bh) { bh = h; best = k; }
    const ki = (k / N) | 0, kj = k % N;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const i = ki + di, j = kj + dj; if ((!di && !dj) || i < 0 || j < 0 || i >= N || j >= N) continue;
      const n = idx(i, j); if (!g[n]) continue;
      const c = G[k] + (di && dj ? 1.414 : 1); if (c < G[n]) { G[n] = c; from[n] = k; push([c + hh(n), n]); }
    }
  }
  if (from[e] < 0 && e !== s) { if (best === s) return null; e = best; }   // цель за мелью — как можно ближе к ней
  const out = []; for (let k = e; k !== s && k >= 0; k = from[k]) out.push(new V3(-S + ((k / N) | 0) * NAV_C, 0, -S + (k % N) * NAV_C));
  return out.reverse();
}
const TURNS = [0, .35, .7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.8];
// v19: пловец, который сейчас не плавает: черепаха греется на пляже или спит на рифе, медуза выброшена на песок —
// их не уводит на глубину (deepSpot/swimStep) и не толкает с мели (_separate)
const landed = o => ((!o.gone && o.sp === 'sea_turtle' && (o.st === 'bask' || o.st === 'sleep')) || (o.sp === 'jellyfish' && (o.flat || (!o.gone && o.st === 'stranded')))) && (o.landT = o.t, true);   // landT — для qa/move_check
function swimStep(o, tgt, max) {
  const p = o.anchor, dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
  p.y += clamp(tgt.y - p.y, -max, max); if (d < 1e-4) return;
  const need = SWIM_DEPTH[o.sp], rad = ORB[o.sp], step = Math.min(max, d), look = Math.max(step, Math.min(d, rad * .5));
  const ux = dx / d, uz = dz / d; let here;
  for (const a of TURNS) for (const sg of a ? [o.side || 1, -(o.side || 1)] : [1]) {
    const c = Math.cos(a * sg), sn = Math.sin(a * sg), vx = ux * c - uz * sn, vz = ux * sn + uz * c;
    const g = shoal(p.x + vx * look, p.z + vz * look, rad, need);
    if (g > 0 && g > (here ??= shoal(p.x, p.z, rad, need)) - .01) continue;   // не глубже, чем здесь, — не туда
    if (a) o.side = sg; else o.side = 0;
    p.x += vx * step; p.z += vz * step; return;
  }
}

// точечная фактура «как у образца» — на ВСЕХ объектах (решение 22.09 v8): сетка мелких точек, редкие жёлтые/бурые
// крапины, тонкие полосы по высоте. p — координаты (мировые у рельефа, «приклеенные» к телу у животных/облаков),
// n — нормаль (выбирает плоскость проекции, чтобы на склонах точки не растягивались), land — где можно крапины.
const STIPPLE = `
vec3 stipple(vec3 c, vec3 p, vec3 n, float land, float k) {
  vec3 an = abs(n); vec2 q = an.y > .7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  vec2 g = q * k, cell = floor(g), f = fract(g) - .5;
  float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float dm = smoothstep(.34, .2, length(f + (hs - .5) * .25));
  c *= mix(.9, 1.06, dm);
  c = mix(c, vec3(1., .82, .3), dm * land * step(.96, hs) * .8);
  c = mix(c, vec3(.42, .26, .24), dm * land * step(hs, .035) * .6);
  c *= 1. + .07 * smoothstep(.86, .97, abs(fract(p.y * 2.2) - .5) * 2.) * land;
  return c;
}
`;
// скорость подхода (м/с): новые существа приплывают/прилетают из дымки, а не появляются у острова
// «активность» на панели — только голоса животных (плеск волн и служебные события не в счёт)
const VOICES = new Set(['seagull', 'tern', 'cormorant', 'albatross', 'dolphin', 'whale', 'sea_lion', 'jump_splash', 'dive_splash', 'flying_fish', 'whale_lunge']);
// v19: связь из симуляции (agents.js relate): на каком расстоянии от партнёра держится зверь ('to') и не ближе какого
// уходит ('from'), м
const REL_R = { seagull: 4, tern: 4, cormorant: 4, albatross: 7, pelican: 3, sea_lion: 5, shark: 9, whale: 16, orca: 14, crab: .9, octopus: 1.2, sea_turtle: 3 };
const FLEE_R = 32;
// v21: «личное пространство» на суше (м) — только картинка: крабы стояли друг в друге, медуза на песке — в крабе,
// двое львов на маленьком островке — один в другом. Симуляцию не трогает
const LAND_R = { crab: .55, starfish: .45, jellyfish: 1.1, sea_lion: 1.9 };
const CLEAR = { whale: 3, orca: 1.1, dolphin: .5, shark: .6, sea_turtle: .4, jellyfish: .4, stingray: .15 };   // полвысоты тела над дном
// «личное пространство» в воде (м, по горизонтали) и какая глубина нужна под брюхом — см. Visual._separate
const SWIM_R = { dolphin: 1.2, orca: 2.2, whale: 10, shark: 3.5, sea_lion: 1.8, pelican: 1.6, jellyfish: 1.6, sea_turtle: 2.2, stingray: 2.5 };
// v12: глубина под зверем с учётом высоты его тела (кит 20 м длиной и ~6.6 м в высоту — раньше хватало −4, и он
// «плыл сквозь остров»); ORB — радиус «пятна», которое должно быть глубоким: круг, по которому зверь ходит вокруг
// своей точки, плюс полдлины тела. Цель такого зверя сдвигается к глубине (deepSpot), см. Visual._goal
const SWIM_DEPTH = { whale: -8, orca: -5, dolphin: -3, shark: -3, fish_school: -2.2, sea_lion: -1.5, sea_turtle: -2.4, jellyfish: -2.5, stingray: -.9, pelican: -1 };
// v18: у стаи строй шире (POD) — ORB дельфина/косатки = внешний круг строя + полдлины; пеликан садится только на воду
const ORB = { whale: 20, orca: 18, dolphin: 11.5, shark: 10, fish_school: 10, sea_turtle: 7.5, jellyfish: 3.5, pelican: 4, stingray: 2 };   // v19: скат переплывал островок напрямик   // v19: пеликан кружит по воде 3 м — пятно 4
// строй стаи (v18): все кружат вокруг ОДНОЙ точки стаи, место k — [вбок, назад] в долях шага; позади — по дуге своего
// круга (концентрические круги не пересекаются). Раньше у каждого была своя точка кружения, точки гуляли друг
// относительно друга — дельфин «врезался в бок» соседу. POD: радиус круга стаи, шаг вбок, шаг назад (м)
const SLOTS = [[0, 0], [-1, 1], [1, 1], [0, 2], [-1, 3], [1, 3], [0, 4]];
const POD = { dolphin: [7, 2.4, 2.6], orca: [11, 3.6, 4.2] };
const HALF = { whale: 9, orca: 4, shark: 3, dolphin: 2.2 };   // полдлины: у длинных проверяем на мели и нос, и хвост
// взмахи птиц (v12, «резвее»): частота, Гц; размах, когда набирает высоту; размах, когда планирует
const FLAP = { seagull: [3.2, .5, .08], tern: [4.5, .55, .12], cormorant: [5, .45, .3], albatross: [1.6, .4, .03] };
// процедурная анимация тела (v12) для моделей без своей анимации: [модель, режим] — см. Visual._wiggle
const WIG = { orca: ['orca', 'tail'], sea_lion: ['sea_lion', 'lion'], sea_turtle: ['turtle', 'flip'], pelican: ['pelican', 'head'], jellyfish: ['jellyfish', 'jelly'],
  crab: ['crab', 'crab'], starfish: ['starfish', 'star'], octopus: ['octopus', 'octo'] };   // v13: и мелким (креветкам — в _attachModel)
// «показать обитателя» (v13): на каком расстоянии камера держится от зверя этого вида
const FOLLOW_D = { hatchling: 8, whale: 38, orca: 22, shark: 16, dolphin: 14, fish_school: 16, sea_lion: 9, pelican: 10, sea_turtle: 9, stingray: 10, jellyfish: 8,
  crab: 4.5, starfish: 4.5, shrimp_swarm: 6, octopus: 6, albatross: 18, seagull: 14, tern: 12, cormorant: 12, ship: 260 };
// живут на месте (берег, риф): уходя — прячутся (в песок, в расщелину), а не уплывают за горизонт
const STATIC = new Set(['crab', 'starfish', 'octopus', 'shrimp_swarm']);
// мелкие обитатели: их действие из журнала (код в e.act, agents.js CRITTERS) картинка показывает — см. _stepAgent (v14)
const CRITTER_SP = new Set(['jellyfish', 'shrimp_swarm', 'octopus', 'stingray', 'sea_turtle', 'starfish', 'crab']);
// звук при приближении камеры (папка samples/): бульки у медузы, осьминога и черепахи, треск креветок, щёлканье краба
const NEAR_SND = { jellyfish: 'bubbles', octopus: 'bubbles', sea_turtle: 'bubbles', shrimp_swarm: 'shrimp', crab: 'crab' };
// v22: «радиус тела» для наведения мыши (м): полдлины/полразмаха модели (косяк — круг, по которому ходят рыбы)
const BODY_R = { hatchling: 3, seagull: 1.7, tern: 1.3, cormorant: 1.6, albatross: 3.2, pelican: 1.8, dolphin: 2.5, whale: 10, sea_lion: 1.9, fish_school: 6,
  shark: 3.5, orca: 4.5, jellyfish: 1.2, shrimp_swarm: 1.6, octopus: 1.4, stingray: 2.3, sea_turtle: 1.4, starfish: .8, crab: .7, ship: 50 };
const SPEED = { seagull: 9, tern: 10, cormorant: 8, albatross: 7, pelican: 7, dolphin: 7, whale: 3, sea_lion: 3, fish_school: 3, shark: 6, orca: 6,
  jellyfish: 1.2, sea_turtle: 2, stingray: 3, crab: 1.5, starfish: .3, octopus: .8, shrimp_swarm: 2, ship: 15 };

export class Visual {
  // v24: lite — «Лёгкое» качество с самого начала: текстуры моделей до 256 точек (иначе до 1024), редкие гости (акула,
  // косатка) грузятся при первом появлении
  constructor(stageEl, { lite = false } = {}) {
    this.stage = stageEl; this.lite = lite;
    this.canvas = $('#gl');
    this.logList = $('#log-list'); this.flashEl = $('#flash'); this.tipEl = $('#tip');
    this.cur = { tod: .5, daylight: 1, weather: .3, wind: .3, wave: .3, temp: .5, tension: .1, rain: 0, fog: 0 };
    this.tgt = { ...this.cur };
    this.weatherLabel = '—'; this.timeLabel = '--:--'; this.census = {}; this.snapped = false;
    this.agents = new Map(); this.fx = []; this.recent = [];
    this.assets = null; this.clock = 0;
    this._mouse = { x: -1e9, y: -1e9, clientX: 0, clientY: 0 }; this._mouseOver = false;
    // нажатие на строку «Обитателей» — показать этого зверя (pointerdown: список перестраивается каждые 0.25 с)
    // v22: только короткое нажатие без движения — на телефоне список листается пальцем, и раньше каждое касание
    // (pointerdown) уже было «показать» (вид запоминается при касании: список перестраивается каждые 0.25 с)
    tapOnly($('#census-body'), '[data-sp]', r => this.focusSpecies(r.dataset.sp));
    this._logQ = []; this._logLast = new Map(); this._logRecs = new WeakMap(); this._logT = 0; this._logHoldM = false; this._logHoldT = 0;
    const lg = $('#log'), hold = () => { this._logHoldT = performance.now() + 4000; };
    lg.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this._logHoldM = true; });
    lg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this._logHoldM = false; });
    lg.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') hold(); });
    this.logList.addEventListener('scroll', () => { if (performance.now() - (this._logOwn || 0) > 150) hold(); }, { passive: true });   // свой сдвиг (_stepLog) — не листание
    tapOnly(this.logList, 'li', li => this.focusEvent(this._logRecs.get(li)));
    this._initScene();
    addEventListener('resize', () => this.resize());
    this.resize();
    this._loadAssets().catch(err => console.error('модели не загрузились', err));
  }

  // ------------------------------------------------------------------ сцена
  _initScene() {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    // ?lowres=1 — половинное разрешение для безголовых QA-снимков (программный рендер иначе успевает 1–2 кадра)
    // v14: на телефоне (сенсорный экран) — не выше 1.5: плотные экраны иначе рисуют в 3 раза больше точек и греются
    const touch = matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(this.basePR = new URLSearchParams(location.search).has('lowres') ? .5 : Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // цвета как заданы (см. CLAUDE.md), без sRGB-осветления
    // v22: проверка шейдеров (getProgramInfoLog) заставляет кадр ждать, пока видеокарта соберёт шейдер; шейдеры у нас
    // не меняются — проверяем только с ?debug
    renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xaab5b4, 120, 420);
    const camera = this.camera = new THREE.PerspectiveCamera(45, 1, .5, 7000);   // v14: дальний остров ~2.1 км, вода до 5 км
    camera.position.set(0, 42, 88);
    const cq = new URLSearchParams(location.search).get('cam');   // для QA-снимков: ?cam=x,y,z
    if (cq) camera.position.set(...cq.split(',').map(Number));

    const controls = this.controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enableDamping = true; controls.dampingFactor = .08;
    // v13 свободнее: ближе (3 м — разглядеть траву и букашек) и дальше (320 м); колесо приближает туда, где курсор
    // v15: отдаление — до 120 м (пользователь; в v14 было 180)
    controls.minDistance = 3; controls.maxDistance = 120; controls.zoomToCursor = true;
    // медленное вращение вокруг всей локации, как в образце (~3 мин на оборот): сразу при входе и снова через 12 с после того,
    // как камеру отпустили; пока держишь камеру или следишь за зверем — стоит
    this._idle = 99;
    // взялся за камеру сам: v22 — при слежении за зверем камера крутится вокруг него и приближается (слежение остаётся,
    // выход — Esc или «✕» на плашке, см. main.js); без слежения — как раньше
    controls.addEventListener('start', () => { if (this._follow) this._follow.user = true; this._fly = null; this._drag = true; this._idle = 0; });
    controls.addEventListener('end', () => { this._drag = false; this._idle = 0; });
    controls.screenSpacePanning = false;   // сдвиг — вдоль «земли», не вверх-вниз
    controls.maxPolarAngle = Math.PI * .47;   // можно опустить камеру почти к воде и посмотреть на небо
    controls.update();

    // v24: потеря контекста WebGL (не хватило видеопамяти, драйвер перезапустился): браузеру — «восстанови» (preventDefault),
    // main.js показывает сообщение и после восстановления снижает качество. three.js сам заново загружает всё в видеокарту
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLost?.(); });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.onRestored?.(); });
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointermove', ev => {
      const r = this.stage.getBoundingClientRect();
      this._mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top, clientX: ev.clientX, clientY: ev.clientY };
      this._mouseOver = true;
    });
    renderer.domElement.addEventListener('pointerleave', () => { this._mouseOver = false; });
    // v24: двойной клик (ПК) или двойное касание (телефон) по зверю — слежение за ним, как из «Обитателей»/журнала.
    // Касание — короткое (до 0.3 с) и почти без движения (до 10 px), второе — не позже 0.35 с и не дальше 30 px от
    // первого: вращение камеры (перетаскивание) и приближение двумя пальцами двойным касанием не считаются
    const followAt = (cx, cy) => { const r = this.stage.getBoundingClientRect(), o = this._pickAt(cx - r.left, cy - r.top, 1.3); if (o) this.followAgent(o); };
    renderer.domElement.addEventListener('dblclick', e => followAt(e.clientX, e.clientY));
    let td = null, tLast = null; const fingers = new Set();
    renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; fingers.add(e.pointerId);
      td = fingers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null; });
    renderer.domElement.addEventListener('pointermove', e => { if (td && e.pointerId === td.id && Math.hypot(e.clientX - td.x, e.clientY - td.y) > 10) td = null; });
    for (const ev of ['pointercancel', 'pointerup']) renderer.domElement.addEventListener(ev, e => {
      if (e.pointerType === 'mouse') return; fingers.delete(e.pointerId);
      const now = performance.now(), tap = ev === 'pointerup' && td && e.pointerId === td.id && now - td.t < 300 && Math.hypot(e.clientX - td.x, e.clientY - td.y) <= 10; td = null;
      if (!tap) { tLast = null; return; }
      if (tLast && now - tLast.t < 350 && Math.hypot(e.clientX - tLast.x, e.clientY - tLast.y) <= 30) { tLast = null; followAt(e.clientX, e.clientY); }
      else tLast = { x: e.clientX, y: e.clientY, t: now };
    });

    this.uPix = { value: 1 }; this.uBright = { value: 1 }; this.uT = { value: 0 }; this.uWind = { value: .1 }; this.uRimK = { value: .5 }; this.uGlowK = { value: 0 };
    // v24: переключатели для ?bench=1 (bench.js): точечная фактура, качание флоры; uAvN — сколько зверей сейчас
    // раздвигают флору (цикл в вершинном шейдере не крутит пустые места)
    this.uStip = { value: 1 }; this.uFloraAnim = { value: 1 }; this.uAvN = { value: 0 };
    this.glowTex = this._glowTexture();
    this._buildPost();

    this.hemi = new THREE.HemisphereLight(0xbfe3f8, 0x6a5a40, 1.5); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3dc, 3); scene.add(this.sun); scene.add(this.sun.target);
    this.moonLight = new THREE.DirectionalLight(0x8fa8ff, 0); scene.add(this.moonLight); scene.add(this.moonLight.target);

    this._buildSky();
    this._buildTerrain();
    this._buildWater();
    this._buildClouds();
    this._buildRain();
    this._buildFarIsland();
    // W(x, d, y): x из симуляции → угол вокруг острова, d (0 у берега..1 далеко) → расстояние от центра
    this.W = (x, d, y = 0) => { const a = x * 2.2, r = R + 5 + d * 45; return new V3(Math.sin(a) * r, y, Math.cos(a) * r); };
  }

  // пост-обработка как у образца: лёгкий «рыбий глаз» и хроматическая аберрация к краям кадра + виньетка
  // (края темнее — взгляд держится на острове). Сцена рисуется в буфер, потом одним проходом на экран.
  _buildPost() {
    // сглаживание буфера — только на настоящей видеокарте: программный рендер (SwiftShader в безголовом QA) с ним
    // рисует кадр так долго, что за время снимка мир не успевает ожить
    const gl = this.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const soft = dbg && /swiftshader|llvmpipe|software/i.test(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    this.soft = soft;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { samples: soft ? 0 : 4 });
    this.rt.texture.generateMipmaps = true; this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.postMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      glslVersion: THREE.GLSL3,   // для textureLod: свечение берём из мип-уровней кадра
      uniforms: { tScene: { value: this.rt.texture }, uAspect: { value: 1 }, uVig: { value: .62 }, uNeon: { value: .6 }, uThr: { value: .42 } },   // v11: неона больше (просьба пользователя), см. frame()
      vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `uniform sampler2D tScene; uniform float uAspect, uVig, uNeon, uThr; in vec2 vUv; out vec4 fragColor;
        void main() {
          vec2 c = vUv - .5; vec2 ca = c * vec2(uAspect, 1.); float r2 = dot(ca, ca);
          vec2 uv = .5 + c * (1. - .22 * r2) * .96;                   // бочка «рыбий глаз» (v10: ещё сильнее)
          vec2 off = c * .006 * r2;                                   // аберрация растёт к краям
          vec3 col = vec3(texture(tScene, uv + off).r, texture(tScene, uv).g, texture(tScene, uv - off).b);
          // неон: мягкое свечение вокруг ярких мест (мип-уровни кадра = дешёвое размытие)
          // v16: свечение — мягкое размытие 3×3 на двух уровнях (было по одной точке уровня 4 и 6: тонкая яркая кромка
          // пены при повороте камеры то попадала в пиксель уменьшенной копии, то нет — ореол у островов дёргался)
          vec3 glow = vec3(0.); vec2 px = 1. / vec2(textureSize(tScene, 0));
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
            float w = float((2 - abs(i)) * (2 - abs(j))) / 16.; vec2 o = vec2(float(i), float(j));
            glow += (textureLod(tScene, uv + o * px * 16., 4.).rgb + textureLod(tScene, uv + o * px * 64., 6.).rgb) * w * .5;
          }
          col += max(glow - uThr, vec3(0.)) * uNeon;
          float l = dot(col, vec3(.3, .59, .11)); col = mix(vec3(l), col, 1.12);   // чуть сочнее цвет
          col = mix(col, clamp(col, 0., 1.) * clamp(col, 0., 1.) * (3. - 2. * clamp(col, 0., 1.)), .32);   // v15: контрастнее (мягкая S-кривая)
          col *= mix(1., 1. - uVig, smoothstep(.12, .75, r2));        // виньетка
          fragColor = vec4(col, 1.);
        }`,
    });
    this.postScene = new THREE.Scene(); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat); q.frustumCulled = false; this.postScene.add(q);
  }

  _glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }
  _moonTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(56, 54, 4, 64, 64, 50);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(1, '#d8d4c0');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 50, 0, 7); x.fill();
    x.fillStyle = 'rgba(150,145,125,.45)';
    for (const [cx, cy, r] of [[48, 50, 9], [78, 70, 12], [60, 86, 6], [84, 44, 5], [44, 76, 5]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
    return new THREE.CanvasTexture(c);
  }

  // небо: купол с градиентом зенит→горизонт + ореол солнца; звёзды на всей сфере (было — только спереди)
  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunA: { value: 1 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uZen, uHor, uSunDir, uSunCol; uniform float uSunA; varying vec3 vDir;
        void main() { float h = vDir.y;
          vec3 c = mix(uHor, uZen, smoothstep(0., .55, h));
          c = mix(c, uHor * .55, smoothstep(0., -.25, h));            // ниже горизонта — темнее (под туманом океана не видно)
          float s = max(dot(vDir, uSunDir), 0.);
          c += uSunCol * (pow(s, 12.) * .35 + pow(s, 3.) * .12) * uSunA;
          gl_FragColor = vec4(c, 1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat); sky.renderOrder = -2; sky.frustumCulled = false;
    this.scene.add(sky); this.sky = sky;

    const n = 1800, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.2832, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * 950, Math.abs(u) * 950 - 30, Math.sin(th) * s * 950], i * 3); seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: `attribute float aSeed; uniform float uT; varying float vA;
        void main() { vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww;
          gl_PointSize = 1. + aSeed * aSeed * 2.5; vA = .55 + .45 * sin(uT * (1. + aSeed * 2.) + aSeed * 60.); }`,
      fragmentShader: `uniform float uA; varying float vA; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(.92, .95, 1.), uA * vA * smoothstep(.5, .1, d)); }`,
    });
    this.stars = new THREE.Points(g, this.starMat); this.stars.renderOrder = -1; this.stars.frustumCulled = false; this.scene.add(this.stars);

    const spr = (map, color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, fog: false })); s.scale.setScalar(size); s.renderOrder = -1; this.scene.add(s); return s; };
    this.sunGlow = spr(this.glowTex, 0xffe7b0, 150); this.sunGlow.material.blending = THREE.AdditiveBlending;
    this.sunDisc = spr(this._discTexture(), 0xfff8e0, 26);
    this.moon = spr(this._moonTexture(), 0xffffff, 34);
  }
  _discTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); return new THREE.CanvasTexture(c);
  }

  // остров: сетка высот по islandH() с раскраской по высоте/крутизне (песок, трава, розоватые скалы как у образца)
  _buildTerrain() {
    const seg = 320, geo = new THREE.PlaneGeometry(S * 2, S * 2, seg, seg); geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, islandH(P.getX(i), P.getZ(i)));
    geo.computeVertexNormals();
    const N = geo.attributes.normal, col = new Float32Array(P.count * 3);
    const SAND = rgb('#e2d4b6'), WET = rgb('#c4b592'), GRASS = rgb('#8fab82'), GRASS2 = rgb('#b3bd8a'), ROCK = rgb('#dca898'), ROCK2 = rgb('#c49385'), SEABED = rgb('#bdb39a');
    this.rockPts = []; this.shorePts = []; this.grassPts = []; this.shallowPts = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i), v = fbm(x * .15, z * .15, 2) * .5 + .5;
      let c;
      // дно на глубине темнеет до цвета глубокой воды: вода теперь полупрозрачная и над глубиной (v11),
      // светлое дно иначе сделало бы открытое море молочным
      if (y < -.3) c = mix3(mix3(SEABED, [.35, .55, .6], smooth(-.3, -5, y) * .7), [.1, .2, .28], smooth(-4, -9.5, y));
      else if (y < .5) c = mix3(WET, SAND, smooth(-.3, .5, y));
      else {
        // плавные переходы песок→трава→скала (жёсткие пороги давали «пилу» на границах)
        const rockW = Math.max(smooth(.86, .7, ny), smooth(6.5 + v * 2, 9 + v * 2, y)), sandW = smooth(1.6, .9, y + v * .4);
        c = mix3(mix3(mix3(GRASS, GRASS2, v * v), mix3(ROCK, ROCK2, v), rockW), SAND, sandW);
        if (rockW > .7 && sandW < .2) { if (Math.random() < .08) this.rockPts.push(new V3(x, y, z)); }
        else if (rockW < .2 && sandW < .2 && Math.random() < .06) this.grassPts.push(new V3(x, y, z));
      }
      if (Math.abs(y) < .35) this.shorePts.push(new V3(x, y, z));
      if (y < -.6 && y > -9 && Math.random() < .03) this.shallowPts.push(new V3(x, y, z));
      col.set(c, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // v12: лёгкое свечение у основания островов (пользователь: «в самом низу островов тоже светящийся эффект») — полоса
    // от кромки воды до ~7 м глубины светится цветом лагуны (сквозь воду), ночью сильнее; суша чуть-чуть синеет
    this.uIsle = { value: 0 }; this.uIsleCol = { value: new THREE.Color() };
    const glowHook = sh => {
      Object.assign(sh.uniforms, { uIsle: this.uIsle, uIsleCol: this.uIsleCol });
      sh.fragmentShader = 'uniform float uIsle; uniform vec3 uIsleCol;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uIsleCol * uIsle * (smoothstep(-7., -.8, vSP.y) * smoothstep(1.6, .1, vSP.y) + .1 * smoothstep(0., 2., vSP.y));`);
    };
    this.terrain = new THREE.Mesh(geo, this._hook(this._stippled(new THREE.MeshLambertMaterial({ vertexColors: true })), glowHook, 'isle'));
    this.scene.add(this.terrain);
    // дно за краем карты рельефа (v12): раньше там было пусто, и сквозь полупрозрачную воду виднелся квадрат карты —
    // «граница локации». Теперь до горизонта то же тёмное дно, что у края карты (−10 м, цвет глубины)
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this._stippled(new THREE.MeshLambertMaterial({ color: new THREE.Color(.1, .2, .28) })));
    bed.rotation.x = -Math.PI / 2; bed.position.y = -10.3; this.scene.add(bed);

    // карта высот для воды (глубина → цвет мелководья и пена у берега), в метрах, half-float.
    // Было 8 бит (шаг 8 см): у пологого берега кромка пены выходила лесенкой из квадратов и мерцала при повороте камеры
    const TS = 512, data = new Uint16Array(TS * TS), hm = this.hmap = HM = new Float32Array(TS * TS);
    for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
      const x = (i + .5) / TS * 2 * S - S, z = (j + .5) / TS * 2 * S - S;
      data[j * TS + i] = THREE.DataUtils.toHalfFloat(hm[j * TS + i] = islandH(x, z));
    }
    this.heightTex = new THREE.DataTexture(data, TS, TS, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter; this.heightTex.needsUpdate = true;

    this._dressIsland();
  }

  // v22: высота рельефа из готовой карты (512×512 на ±S, билинейно) — в разы дешевле islandH; для сотен рыбок каждый кадр
  _h(x, z) { return hq(x, z); }   // за краем карты — дно (см. bed)
  // v22: рыбка не в рельефе: под ней должно быть не меньше ~0.8 м воды. Мелко — точка подтягивается к центру её круга
  // (cx, cz), потом к точке стайки (c); не нашлось глубины — рыбка на этот кадр скрыта. Высота — между дном+0.35 и −0.3.
  // Возвращает false, если рыбку надо скрыть. P меняется на месте
  _fishInWater(P, cx, cz, c) {
    let g = this._h(P.x, P.z);
    for (let k = 0; k < 6 && g > -.8; k++) {
      const tx = k < 3 ? cx : c.x, tz = k < 3 ? cz : c.z;
      P.x += (tx - P.x) * .5; P.z += (tz - P.z) * .5; g = this._h(P.x, P.z);
    }
    if (g > -.8) return false;
    P.y = Math.min(-.3, Math.max(P.y, g + .35));
    return true;
  }

  // точечная фактура «как у образца» поверх обычного освещения: сетка мелких точек в мировых координатах
  // (проекция выбирается по нормали — на крутых склонах не растягивается), редкие жёлтые/бурые крапины
  // и тонкие полосы по высоте. Не текстура — всё в шейдере, резко на любом приближении.
  // навесить на материал ещё один кусок шейдера: хуки складываются, ключ кэша — явный (иначе three.js по
  // одинаковому тексту обёртки отдаст одному материалу скомпилированную программу другого)
  _hook(mat, fn, key) {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r); fn(sh); };
    mat.customProgramCacheKey = () => prevKey + '|' + key;
    return mat;
  }
  _stippled(mat, local = false, k = 5.5) {
    return this._hook(mat, sh => {
      sh.uniforms.uStip = this.uStip;
      sh.vertexShader = 'varying vec3 vSP; varying vec3 vSN;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + (local
        ? ' vSP = transformed * length(modelMatrix[0].xyz); vSN = objectNormal;'
        : ' vSP = (modelMatrix * vec4(transformed, 1.)).xyz; vSN = normalize(mat3(modelMatrix) * objectNormal);'));
      sh.fragmentShader = 'uniform float uStip; varying vec3 vSP; varying vec3 vSN;\n' + STIPPLE + sh.fragmentShader.replace('#include <alphamap_fragment>',
        `if (uStip > .5) diffuseColor.rgb = stipple(diffuseColor.rgb, vSP, vSN, ${local ? '1.' : 'smoothstep(.2, .6, vSP.y)'}, ${k.toFixed(2)});\n#include <alphamap_fragment>`);
    }, `st${local ? 'L' : 'W'}${k}`);
  }

  // рыбки-«конусы» стаек (v14: «у всех должны быть анимации»): хвост (задний конец конуса, −z) виляет, у каждой рыбки
  // своя фаза (номер экземпляра)
  _tailWag(mat) {
    return this._hook(mat, sh => {
      sh.uniforms.uT = this.uT;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n float tw = clamp(.2 - transformed.z * 1.6, 0., 1.); transformed.x += sin(uT * 9. + float(gl_InstanceID) * 1.7 + transformed.z * 5.) * tw * .1;');
    }, 'wag');
  }
  // колыхание флоры от ветра: смещение растёт с aSway (≈ высота над корнем), общее для точек и линий
  _swayGLSL() {
    return `uniform float uT, uWind; attribute float aSway;
      vec3 sway(vec3 p) { float ph = uT * 1.6 + p.x * .35 + p.z * .27;
        return p + vec3(sin(ph), 0., cos(ph * .8)) * aSway * uWind; }\n`;
  }
  // точки с размером в мировых единицах — пена, шарики «молекул», кустики (наследие образца)
  _pts(pos, col, size, sw = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw || new Array(size.length).fill(0), 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uPix: this.uPix, uBright: this.uBright, uT: this.uT, uWind: this.uWind },
      vertexShader: this._swayGLSL() + `uniform float uPix; attribute float aSize; attribute vec3 aCol; varying vec3 vCol;
        void main() { vec4 mv = modelViewMatrix * vec4(sway(position), 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uPix / max(-mv.z, .5)); vCol = aCol; }`,
      fragmentShader: `uniform float uBright; varying vec3 vCol;
        void main() { vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
          gl_FragColor = vec4(vCol * uBright * (1.08 - d * .5), 1.); }`,   // лёгкий объём шарика
    });
    const p = new THREE.Points(g, m); this.scene.add(p); (this.decor ||= []).push(p); return p;
  }
  // ореолы вокруг светящихся точек (цветы, кораллы, кончики анемонов) — «люмен»: мягкое пятно в 4 размера точки,
  // размер в метрах мира — одинаково издалека и вблизи. Ночью и в сумерки; днём слой скрыт (см. frame)
  _halo(pos, col, size, sw, order = 0) {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPix: this.uPix, uT: this.uT, uWind: this.uWind, uGlowK: this.uGlowK },
      vertexShader: this._swayGLSL() + `uniform float uPix; attribute float aSize; attribute vec3 aCol; varying vec3 vCol;
        void main() { vec4 mv = modelViewMatrix * vec4(sway(position), 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(2., aSize * 4.5 * uPix / max(-mv.z, .5)); vCol = aCol; }`,
      fragmentShader: `uniform float uGlowK; varying vec3 vCol;
        void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; float k = 1. - d * 2.; gl_FragColor = vec4(vCol, uGlowK * .3 * k * k); }`,
    });
    const h = new THREE.Points(g, m); h.frustumCulled = false; h.visible = false; h.renderOrder = order; this.scene.add(h); (this.halos ||= []).push(h);
  }
  _lines(pos, col, sw) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uBright: this.uBright, uT: this.uT, uWind: this.uWind },
      vertexShader: this._swayGLSL() + `attribute vec3 aCol; varying vec3 vCol;
        void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(sway(position), 1.); vCol = aCol; }`,
      fragmentShader: `uniform float uBright; varying vec3 vCol; void main() { gl_FragColor = vec4(vCol * uBright, 1.); }`,
    });
    const l = new THREE.LineSegments(g, m); this.scene.add(l); (this.decor ||= []).push(l); return l;
  }

  // абстрактная флора (решение 22.09): пучки травы-линий, кустики из шариков, «цветы-молекулы» (бывшие кораллы —
  // теперь одна семья с травой, пастельные), пена-крошка у кромки, золотистые водоросли на мелководье
  _dressIsland() {
    const P = [], C = [], Z = [], PW = [], L = [], LC = [], LW = [];
    const dot = (p, c, s, w = 0) => { P.push(p.x, p.y, p.z); C.push(...c); Z.push(s); PW.push(w); };
    const seg = (a, b, ca, cb, wa, wb) => { L.push(a.x, a.y, a.z, b.x, b.y, b.z); LC.push(...ca, ...cb); LW.push(wa, wb); };
    const pick = a => a[(Math.random() * a.length) | 0];
    const jit = (c, k = .06) => c.map(v => clamp(v + rnd(-k, k)));
    const WHITE = [.96, .95, .92], CORAL = [.95, .46, .4], PALEY = [.97, .86, .5], LILAC = [.78, .64, .9], PEACH = [.97, .64, .38];
    // светящиеся точки (кончики цветов, анемонов…): та же точка + ореол ночью (_halo); под водой и над ней — отдельно
    const GL = [[], [], [], []], GS = [[], [], [], []];
    const glow = (p, c, s, w = 0) => { dot(p, c, s, w); const g = p.y < -.2 ? GS : GL; g[0].push(p.x, p.y, p.z); g[1].push(...c); g[2].push(s); g[3].push(w); };

    // трава: пучки тонких стеблей, у корня темнее
    for (const p of this.grassPts) {
      const tint = pick([[.55, .68, .45], [.72, .74, .48], [.62, .7, .52], [.66, .72, .44], [.82, .74, .5]]);
      for (let k = 0, nb = 5 + (Math.random() * 5 | 0); k < nb; k++) {
        const b = new V3(p.x + rnd(-.5, .5), p.y - .05, p.z + rnd(-.5, .5)), h = rnd(.35, 1.05);
        seg(b, new V3(b.x + rnd(-.25, .25), b.y + h, b.z + rnd(-.25, .25)), tint.map(v => v * .6), jit(tint), 0, h * .35);
      }
    }
    // кустики: шар из шариков
    for (let i = 0; i < 150 && this.grassPts.length; i++) {   // v12: 80 → 150
      const p = pick(this.grassPts), r = rnd(.5, 1.05), base = pick([[.52, .64, .44], [.6, .68, .46], [.44, .56, .4], [.66, .7, .5]]);
      for (let k = 0, n = 14 + (Math.random() * 14 | 0); k < n; k++) {
        const d = new V3(rnd(-1, 1), rnd(-.4, 1), rnd(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(Math.random()));
        dot(new V3(p.x + d.x, p.y + r * .8 + d.y, p.z + d.z), jit(base, .05), rnd(.24, .42), .12);
      }
      if (Math.random() < .35) dot(new V3(p.x, p.y + r * 1.7, p.z), pick([CORAL, PALEY, WHITE]), .26, .15);   // «ягодка»
    }
    // цветы-молекулы: ветвящиеся стебли с шариками на концах, пастель
    const grow = (a, dir, len, depth, root) => {
      const b = a.clone().addScaledVector(dir, len), wa = (a.y - root) * .3, wb = (b.y - root) * .3;
      seg(a, b, [.88, .88, .84], [.93, .93, .9], wa, wb);
      if (depth === 0 || Math.random() < .12) { const r = Math.random(); glow(b, r < .45 ? CORAL : r < .65 ? WHITE : r < .8 ? PALEY : r < .9 ? LILAC : PEACH, rnd(.14, .22), wb); return; }
      if (Math.random() < .25) dot(b, Math.random() < .6 ? CORAL : WHITE, rnd(.09, .14), wb);
      for (let k = 0, kids = 1 + (Math.random() < .55) + (depth > 2 && Math.random() < .25); k < kids; k++) {
        const d = dir.clone().add(new V3(rnd(-.8, .8), rnd(-.1, .5), rnd(-.8, .8))).normalize();
        if (d.y < .25) { d.y = .25; d.normalize(); }
        grow(b, d, len * rnd(.6, .9), depth - 1, root);
      }
    };
    const spots = this.grassPts.concat(this.rockPts, this.rockPts);
    for (let i = 0; i < 380 && spots.length; i++) { const p = pick(spots).clone(); grow(p, new V3(rnd(-.3, .3), 1, rnd(-.3, .3)).normalize(), rnd(.35, .75), 3, p.y); }   // v12: 170 → 380
    // подводный сад: те же «молекулы» и кустики на дне (видны сквозь воду, ночью подсвечены лагуной)
    const sea = this.shallowPts;
    for (let i = 0; i < 380 && sea.length; i++) { const p = pick(sea).clone(); grow(p, new V3(rnd(-.3, .3), 1, rnd(-.3, .3)).normalize(), rnd(.4, .9), 3, p.y); }
    for (let i = 0; i < 150 && sea.length; i++) {
      const p = pick(sea), r = rnd(.5, 1.2), base = pick([[.42, .62, .58], [.55, .66, .5], [.62, .5, .62], [.4, .52, .6]]);
      for (let k = 0, n = 14 + (Math.random() * 12 | 0); k < n; k++) {
        const d = new V3(rnd(-1, 1), rnd(-.4, 1), rnd(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(Math.random()));
        dot(new V3(p.x + d.x, p.y + r * .8 + d.y, p.z + d.z), jit(base, .05), rnd(.24, .42), .2);
      }
    }
    // водоросли на мелководье (под водой)
    for (let i = 0; i < 360 && this.shallowPts.length; i++) {   // v12: 160 → 360
      const c = pick(this.shallowPts), tint = pick([[.8, .68, .32], [.8, .68, .32], [.68, .7, .34], [.4, .66, .42]]);
      for (let k = 0, nb = 6 + (Math.random() * 10 | 0); k < nb; k++) {
        const b = new V3(c.x + rnd(-1.2, 1.2), c.y, c.z + rnd(-1.2, 1.2)), t = new V3(b.x + rnd(-.5, .5), Math.min(-.15, b.y + rnd(1, 2.6)), b.z + rnd(-.5, .5));
        seg(b, t, tint.map(v => v * .5), tint, 0, (t.y - b.y) * .3);
      }
    }
    // v12: «прикольные формы» (пользователь: больше растительности, ближе к шарму образца). Суша: одуванчики-взрывы,
    // завитки папоротника, высокие «леденцы». Под водой: ламинарии лентами почти до поверхности, анемоны со светящимися
    // кончиками, веера горгонарий, трубки губок
    const land = this.grassPts, lp = () => pick(land).clone();
    for (let i = 0; i < 70 && land.length; i++) {   // одуванчик: стебель и шар из лучей с точками на концах
      const b = lp(), h = rnd(.9, 1.7), top = new V3(b.x + rnd(-.2, .2), b.y + h, b.z + rnd(-.2, .2)), c = pick([WHITE, LILAC, PALEY]);
      seg(b, top, [.55, .65, .45], [.8, .85, .7], 0, h * .3);
      for (let k = 0; k < 16; k++) { const e = top.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(.22, .34)));
        seg(top, e, [.85, .85, .8], c, h * .3, h * .3 + .05); if (k % 2) glow(e, c, rnd(.07, .11), h * .3 + .05); else dot(e, c, rnd(.06, .09), h * .3 + .05); }
    }
    for (let i = 0; i < 90 && land.length; i++) {   // завиток папоротника: стебель, на макушке спираль, к кончику светлее
      const b = lp(), dir = new V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize(), h = rnd(.5, 1.1), up = new V3(0, 1, 0);
      const c0 = pick([[.5, .66, .44], [.62, .72, .46]]), c1 = pick([PALEY, CORAL, [.8, .9, .6]]), cen = b.clone().addScaledVector(up, h);
      seg(b, cen, c0, c0, 0, h * .3); let prev = cen.clone();
      for (let k = 1; k <= 14; k++) {
        const th = k * .5, r = .32 * Math.exp(-k * .13), q = cen.clone().addScaledVector(dir, Math.sin(th) * r).addScaledVector(up, (Math.cos(th) - 1) * r);
        seg(prev, q, mix3(c0, c1, (k - 1) / 14), mix3(c0, c1, k / 14), h * .3, h * .3); prev = q;
      }
      glow(prev, c1, .08, h * .3);
    }
    for (let i = 0; i < 45 && land.length; i++) {   // «леденец»: высокий тонкий стебель и шар из цветных точек
      const b = lp(), h = rnd(1.8, 3.4), top = new V3(b.x + rnd(-.3, .3), b.y + h, b.z + rnd(-.3, .3)), c = pick([PEACH, LILAC, CORAL, PALEY]), r = rnd(.35, .6);
      seg(b, top, [.6, .66, .5], [.86, .86, .8], 0, h * .3);
      for (let k = 0; k < 26; k++) { const e = top.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(Math.random())));
        (k % 3 ? dot : glow)(e, jit(c, .08), rnd(.1, .18), h * .3); }
    }
    const deep = sea.filter(q => q.y < -2.2);
    for (let i = 0; i < 150 && deep.length; i++) {   // ламинария: лента волнами почти до поверхности, с «поплавками»
      const b = pick(deep).clone(), n = 12, top = Math.min(-.25, b.y + rnd(3, 8.5)), c = pick([[.72, .62, .3], [.5, .64, .36], [.36, .6, .56]]);
      const ph = Math.random() * 6.28, amp = rnd(.25, .5); let prev = b.clone();
      for (let k = 1; k <= n; k++) {
        const u = k / n, q = new V3(b.x + Math.sin(u * 5 + ph) * amp, lerp(b.y, top, u), b.z + Math.cos(u * 4 + ph) * amp * .7);
        seg(prev, q, c.map(v => v * (.45 + .5 * (k - 1) / n)), c.map(v => v * (.45 + .5 * u)), (prev.y - b.y) * .35, (q.y - b.y) * .35);
        if (k % 4 === 0) dot(q, [.85, .78, .4], rnd(.1, .16), (q.y - b.y) * .35); prev = q;
      }
    }
    const NEONS = [[1, .4, .7], [.4, 1, .9], [.7, .5, 1], [1, .7, .35], [.45, .8, 1]];
    for (let i = 0; i < 130 && sea.length; i++) {   // анемон: венчик изогнутых щупалец, кончики светятся
      const b = pick(sea).clone(), c = pick(NEONS), n = 9 + (Math.random() * 7 | 0), L0 = rnd(.35, .7);
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.2832 + rnd(-.2, .2), out = new V3(Math.cos(a), 0, Math.sin(a));
        const m1 = b.clone().addScaledVector(out, L0 * .35).add(new V3(0, L0 * .6, 0)), tip = b.clone().addScaledVector(out, L0 * .9).add(new V3(0, L0 * .95, 0));
        seg(b, m1, c.map(v => v * .35), c.map(v => v * .6), 0, L0 * .2); seg(m1, tip, c.map(v => v * .6), c, L0 * .2, L0 * .35);
        glow(tip, c, rnd(.08, .13), L0 * .35);
      }
    }
    for (let i = 0; i < 60 && sea.length; i++) {   // веер горгонарии: ветвление в одной вертикальной плоскости
      const b = pick(sea).clone(), side = new V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize(), c = pick([LILAC, CORAL, PEACH, [.95, .6, .85]]);
      const fan = (a, dir, len, depth) => {
        const e = a.clone().addScaledVector(dir, len); seg(a, e, c.map(v => v * .55), c, (a.y - b.y) * .2, (e.y - b.y) * .2);
        if (!depth) { glow(e, c, .09, (e.y - b.y) * .2); return; }
        for (const sg of [-1, 1]) fan(e, dir.clone().addScaledVector(side, sg * rnd(.3, .6)).normalize(), len * rnd(.65, .85), depth - 1);
      };
      fan(b, new V3(0, 1, 0), rnd(.4, .7), 4);
    }
    for (let i = 0; i < 50 && sea.length; i++) {   // губка: 2–4 трубки из колец точек, светлее кверху
      const b = pick(sea).clone(), c = pick([[.95, .75, .4], [.7, .85, .5], [.9, .55, .6]]);
      for (let t = 0, nt = 2 + (Math.random() * 3 | 0); t < nt; t++) {
        const cx = b.x + rnd(-.5, .5), cz = b.z + rnd(-.5, .5), h = rnd(.6, 1.6), r = rnd(.12, .22);
        for (let y = 0; y < h; y += .12) for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832; dot(new V3(cx + Math.cos(a) * r, b.y + y, cz + Math.sin(a) * r), jit(c.map(v => v * (.6 + .4 * y / h)), .04), .09, y * .15); }
        glow(new V3(cx, b.y + h, cz), c, .16, h * .15);
      }
    }
    this._pts(P, C, Z, PW);
    this._lines(L, LC, LW);
    this._halo(...GL); this._halo(...GS, -.8);
    this._buildMotes();
    this._buildFoam();
    this._buildNightLife();
    this._buildAmbient();
    seededRandom(20261002, () => this._buildSeaFlora());   // и three.js берёт Math.random — на идентификаторы объектов
  }

  // v23 (этап 2, только картинка): подводные леса и луга по всему дну — между островками и вдали от главного острова,
  // не только у берега. Семь видов: ламинария, морская трава, водоросли-кустики, ветвистые кораллы, кораллы-«мозги»,
  // губки, анемоны. Каждый вид — один InstancedMesh (один вызов отрисовки). Где что растёт — по глубине и по шуму
  // (заросли и поляны), цвет — по глубине. Качание течением и «расступание» перед зверями (uAvoid — до AVOID ближайших
  // к камере пловцов и стаек) — в вершинном шейдере; процессор в кадре только переписывает эти точки (_floraAvoid).
  // Свой генератор случайных чисел: раскладка одинаковая при каждом запуске и не трогает Math.random
  _buildSeaFlora() {
    let sd = 20261002;
    const r01 = () => { sd = (sd + 0x6D2B79F5) >>> 0; let x = Math.imul(sd ^ (sd >>> 15), 1 | sd); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const rr = (a, b) => a + r01() * (b - a), pick = a => a[(r01() * a.length) | 0];
    // --- формы (низ в 0, вверх +y). Атрибуты: color — от тёмного низа к светлому верху, aTip — доля высоты (для свечения)
    const fin = (parts, dark = .45) => {
      const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; })); g.computeVertexNormals();
      const P = g.attributes.position, n = P.count, top = Math.max(...Array.from({ length: n }, (_, i) => P.getY(i))) || 1;
      const col = new Float32Array(n * 3), tip = new Float32Array(n);
      for (let i = 0; i < n; i++) { const u = clamp(P.getY(i) / top); tip[i] = u; col.fill(lerp(dark, 1, u), i * 3, i * 3 + 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
      return g;
    };
    // лента ширины w, высоты h из n отрезков: закручена на tw рад к верху, отогнута вбок на bend м, к макушке сужается
    // до доли tp ширины; повёрнута на rot
    const ribbon = (w, h, n, tw, bend, rot, ox = 0, oz = 0, tp = 1) => {
      const g = new THREE.PlaneGeometry(w, h, 1, n); g.translate(0, h / 2, 0);
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i), u = y / h, x = P.getX(i) * lerp(1, tp, u), a = tw * u; P.setXYZ(i, x * Math.cos(a) + bend * u * u, y, x * Math.sin(a)); }
      return g.rotateY(rot).translate(ox, 0, oz);
    };
    const KELP = fin([0, 1, 2, 3].map(k => ribbon(.55, 1 - k * .14, 12, rr(1.5, 3), rr(-.2, .2), k * 1.6, rr(-.15, .15), rr(-.15, .15), .35)), .55);
    const GRASS = fin(Array.from({ length: 6 }, (_, k) => ribbon(.06, rr(.6, 1), 3, rr(-.6, .6), rr(.08, .22), k * 1.05 + rr(-.3, .3), rr(-.06, .06), rr(-.06, .06))), .55);
    const ALGAE = fin(Array.from({ length: 8 }, (_, k) => ribbon(.11, rr(.5, 1), 4, rr(-1.2, 1.2), rr(.15, .4), k * .785 + rr(-.3, .3))), .6);
    const BRANCH = (() => {
      const parts = [], up = new V3(0, 1, 0);
      const br = (a, dir, len, r, d) => {
        const b = a.clone().addScaledVector(dir, len), c = new THREE.CylinderGeometry(r * .72, r, len, 4, 1, true);
        c.translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)).translate(a.x, a.y, a.z); parts.push(c);
        if (!d) { parts.push(new THREE.SphereGeometry(r * 1.6, 4, 2).translate(b.x, b.y, b.z)); return; }
        for (let k = 0; k < 2; k++) {
          const nd = dir.clone().add(new V3(rr(-1.1, 1.1), rr(0, .5), rr(-1.1, 1.1))).normalize(); if (nd.y < .3) { nd.y = .3; nd.normalize(); }
          br(b, nd, len * rr(.62, .82), r * .7, d - 1);
        }
      };
      br(new V3(), up, .42, .08, 3); return fin(parts, .6);
    })();
    const BRAIN = (() => {   // бугристая полусфера, низ — в песке
      const g = new THREE.SphereGeometry(1, 10, 6), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const v = new V3().fromBufferAttribute(P, i), k = 1 + .12 * fbm(v.x * 2.3, v.z * 2.3 + v.y * 1.7, 2); P.setXYZ(i, v.x * k, Math.max(-.2, v.y * .55 * k), v.z * k); }
      return fin([g], .7);
    })();
    const SPONGE = fin([0, 1, 2].map(k => new THREE.CylinderGeometry(.2 - k * .03, .15 - k * .02, 1 - k * .25, 7, 2, true).translate(Math.cos(k * 2.3) * .2 * Math.min(k, 1), .5 - k * .125, Math.sin(k * 2.3) * .2 * Math.min(k, 1))), .55);
    const ANEMONE = (() => {   // ножка и венчик изогнутых щупалец
      const parts = [new THREE.CylinderGeometry(.12, .15, .22, 7, 1, true).translate(0, .11, 0)];
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * 6.2832, c = new THREE.ConeGeometry(.03, .42, 3, 1).translate(0, .21, 0);
        c.rotateZ(-(.35 + (k % 2) * .25)).rotateY(-a).translate(Math.cos(a) * .1, .2, Math.sin(a) * .1); parts.push(c);
      }
      return fin(parts, .5);
    })();
    // --- материал: тон вида (instanceColor) × вертикальный градиент, точечная фактура; F — гибкость (качание и
    // расступание), E — свечение кончиков ночью
    const AV = this.AVOID = 10;
    this.uAvoid = { value: Array.from({ length: AV }, () => new THREE.Vector4(0, -9999, 0, 1)) };
    this.uAvoidV = { value: Array.from({ length: AV }, () => new THREE.Vector4()) };   // v24: скорость зверя (xz) и сила (w)
    const mat = (F, E, side, B) => this._hook(this._stippled(new THREE.MeshLambertMaterial({ vertexColors: true, side }), true, 14), sh => {
      Object.assign(sh.uniforms, { uT: this.uT, uGlowK: this.uGlowK, uAvoid: this.uAvoid, uAvoidV: this.uAvoidV, uFloraAnim: this.uFloraAnim, uAvN: this.uAvN });
      sh.vertexShader = `uniform float uT, uFloraAnim; uniform int uAvN; uniform vec4 uAvoid[${AV}], uAvoidV[${AV}]; attribute float aTip, aNear; varying float vTip;\n` + sh.vertexShader.replace('#include <project_vertex>', `
        vTip = aTip;
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.);
        vec3 ip = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
        float hm = max(0., wp.y - ip.y);
        ${F ? `if (uFloraAnim > .5) {
        wp.xz += vec2(sin(uT * .8 + ip.x * .37 + hm * .5), cos(uT * .63 + ip.z * .29 + hm * .4)) * hm * hm / (hm + 1.) * ${(F * .09).toFixed(3)};
        // v24: зверь рядом — стебли мягко расходятся и слегка наклоняются. Было: сдвиг до 0.8 радиуса тела (кит — 8 м) уже
        // с высоты 1.2 м — ламинария ложилась почти горизонтально и разлеталась (видео автора). Теперь: сдвиг вбок не
        // больше 1.6 м от всех зверей вместе, изгиб плавный по высоте (корни на месте), верх при наклоне чуть опускается
        // (длина стебля сохраняется), позади зверя — затухающий след на ~1.5 с хода: стебли возвращаются постепенно
        // v24: aNear — зверь может дотянуться до этого растения (_floraAvoid); остальным расчёт не нужен — вклад нулевой
        if (aNear > .5) {
        vec2 push = vec2(0.);
        for (int i = 0; i < ${AV}; i++) {
          if (i >= uAvN) break;
          vec4 a = uAvoid[i], av = uAvoidV[i];
          // v24: дальше, чем достаёт зверь (тело + след), — сразу к следующему: на телефоне полный расчёт для всех
          // ~860 тыс. вершин флоры стоил ~9 мс кадра (?bench=1). Результат тот же: там k = 0. av.y — квадрат досягаемости
          vec2 e0 = wp.xz - a.xz; if (dot(e0, e0) > av.y || abs(wp.y - a.y) > a.w * 1.6) continue;
          float sp = length(av.xz); vec2 dir = sp > .05 ? av.xz / sp : vec2(0.);
          float back = clamp(-dot(wp.xz - a.xz, dir), 0., sp * 1.5);
          vec2 d = wp.xz - (a.xz - dir * back); float L = length(d) + .001;
          float k = (1. - smoothstep(a.w * .3, a.w * 1.3, L)) * (1. - smoothstep(a.w * .4, a.w * 1.6, abs(wp.y - a.y))) * (1. - back / (sp * 1.5 + .001)) * av.w;
          push += d / L * k * min(a.w * .35, 1.6);
        }
        float pl = length(push); if (pl > 1.6) push *= 1.6 / pl;
        float bend = smoothstep(0., 4., hm); push *= bend * bend;
        wp.xz += push; wp.y -= dot(push, push) / (2. * max(hm, .5));
        }
        }` : ''}
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;`);
      // B — своё мягкое свечение: остальная флора острова нарисована без освещения, и освещённая под водой рядом с ней темнее
      sh.fragmentShader = 'uniform float uGlowK; varying float vTip;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * (${B.toFixed(2)} + uGlowK * ${E.toFixed(2)} * vTip * vTip);`);
    }, `flora${F}|${E}|${B}`);
    // --- где растёт: d — по глубине (м), p — «пятна» шума своего масштаба у каждого вида (заросли и поляны)
    const patch = (x, z, f, o, th) => smooth(th, th + .18, fbm(x * f + o, z * f - o * .7, 2) * .5 + .5);
    const band = (d, a, b, c, e) => smooth(a, b, d) * (1 - smooth(c, e, d));
    const KINDS = [
      { geo: KELP, n: 1500, F: 1, E: 0, B: .32, side: THREE.DoubleSide, pal: [[.86, .74, .4], [.7, .76, .42], [.55, .74, .6], [.8, .64, .42]], deepTint: [.4, .62, .62],
        d: d => band(d, 3.2, 5, 30, 31), p: (x, z) => patch(x, z, .028, 11, .56), s: d => { const h = Math.min(d - .7, rr(3, 9)); return [rr(.8, 1.3), h, rr(.8, 1.3)]; } },
      { geo: GRASS, n: 2600, F: 2, E: 0, B: .3, side: THREE.DoubleSide, pal: [[.6, .8, .45], [.72, .8, .48], [.5, .74, .55], [.8, .82, .52]], deepTint: [.4, .62, .6],
        d: d => band(d, .7, 1.3, 8, 11), p: (x, z) => patch(x, z, .06, 37, .5), s: () => { const k = rr(.6, 1.2); return [k * rr(.8, 1.4), k, k * rr(.8, 1.4)]; } },
      { geo: ALGAE, n: 1300, F: 1.4, E: .1, B: .3, side: THREE.DoubleSide, pal: [[.9, .52, .52], [.8, .55, .72], [.92, .72, .45], [.7, .5, .65]], deepTint: [.5, .45, .7],
        d: d => band(d, 1, 2, 10.5, 12), p: (x, z) => patch(x, z, .05, 73, .52), s: () => { const k = rr(.5, 1.3); return [k, k * rr(.8, 1.3), k]; } },
      { geo: BRANCH, n: 600, F: 0, E: .45, B: .35, side: THREE.FrontSide, pal: [[.98, .55, .5], [.98, .72, .52], [.8, .62, .95], [.95, .85, .6], [.6, .85, .9]], deepTint: [.6, .55, .85],
        d: d => band(d, 1.5, 2.5, 10.5, 12), p: (x, z) => patch(x, z, .045, 91, .55), s: () => { const k = rr(.8, 2); return [k, k * rr(.8, 1.2), k]; } },
      { geo: BRAIN, n: 550, F: 0, E: .15, B: .25, side: THREE.FrontSide, pal: [[.95, .78, .55], [.92, .6, .58], [.72, .85, .6], [.85, .7, .9]], deepTint: [.55, .6, .8],
        d: d => band(d, 1.5, 2.5, 10.5, 12), p: (x, z) => patch(x, z, .045, 91, .5), s: () => { const k = rr(.35, .9); return [k * rr(1, 1.5), k, k * rr(1, 1.5)]; } },
      { geo: SPONGE, n: 850, F: 0, E: .3, B: .3, side: THREE.DoubleSide, pal: [[.95, .72, .38], [.9, .55, .55], [.7, .82, .5], [.8, .62, .88]], deepTint: [.5, .5, .75],
        d: d => band(d, 3, 4.5, 30, 31), p: (x, z) => patch(x, z, .04, 123, .55), s: () => { const k = rr(.7, 1.6); return [k, k * rr(.8, 1.6), k]; } },
      { geo: ANEMONE, n: 650, F: .6, E: 1, B: .35, side: THREE.FrontSide, pal: [[1, .45, .72], [.45, 1, .9], [.72, .55, 1], [1, .72, .4], [.5, .82, 1]], deepTint: [.5, .6, .9],
        d: d => band(d, 1, 1.8, 10.5, 12), p: (x, z) => patch(x, z, .07, 157, .52), s: () => { const k = rr(.9, 1.8); return [k, k * rr(.8, 1.2), k]; } },
    ];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E3 = new THREE.Euler(), P = new V3(), SC = new V3(), C = new THREE.Color();
    this.flora = [];
    for (const K of KINDS) {
      const m = new THREE.InstancedMesh(K.geo, mat(K.F, K.E, K.side, K.B), K.n);
      let i = 0;
      for (let t = 0; t < K.n * 80 && i < K.n; t++) {
        // точка — в круге до 170 м от центра: за картой рельефа (±S) дно ровное, −10 м (см. bed)
        const a = r01() * 6.2832, r = 170 * Math.sqrt(r01()), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const g = this._h(x, z), d = -g, b = d < .7 ? 0 : K.d(d); if (!b || r01() > b * K.p(x, z)) continue;   // шум — только где глубина подходит
        const [sx, sy, sz] = K.s(d); if (sy < .3) continue;
        E3.set(rr(-.1, .1), r01() * 6.2832, rr(-.1, .1)); Q.setFromEuler(E3);
        M.compose(P.set(x, g - .05, z), Q, SC.set(sx, sy, sz)); m.setMatrixAt(i, M);
        const c = mix3(pick(K.pal), K.deepTint, smooth(1.5, 10, d) * .45).map(v => clamp(v * rr(.88, 1.08) * lerp(1, .85, smooth(2, 10, d))));
        m.setColorAt(i, C.setRGB(...c)); i++;
      }
      m.count = i; m.frustumCulled = false; m.userData.n = i;
      // v24: у качающихся видов — флаг «рядом зверь» на каждое растение и сетка 8 м для его поиска (см. _floraAvoid)
      if (K.F) {
        const near = new THREE.InstancedBufferAttribute(new Float32Array(K.n), 1); near.setUsage(THREE.DynamicDrawUsage); K.geo.setAttribute('aNear', near); m.userData.near = near;
        const G = this._fGrid ||= [];
        for (let j = 0; j < i; j++) { m.getMatrixAt(j, M); P.setFromMatrixPosition(M); const c = fCell(P.x) * FNG + fCell(P.z); (G[c] ||= []).push(this.flora.length, j, P.x, P.z); }
      }
      this.scene.add(m); this.flora.push(m);
    }
  }
  // v23: точки, от которых расступается флора — ближайшие к камере звери в воде и стайки рыбок (центр и радиус тела)
  // v24: у каждого зверя — сглаженная скорость (для следа) и сила: вошёл в число ближайших — сила плавно растёт, вышел —
  // плавно гаснет (раньше растения рывком возвращались, когда зверь выпадал из десятки)
  _floraAvoid(dt) {
    if (!this.uAvoid) return;
    const cam = this.camera.position, L = this._avL ||= [], T = this._avT ||= new Map(), AV = this.AVOID;
    L.length = 0;
    for (const o of this.agents.values()) {
      const fish = o.fish?.length, r = fish ? 5 : SWIM_R[o.sp] ? BODY_R[o.sp] || 2 : 0; if (!r) continue;
      const p = fish ? o.anchor : o.obj.position; if (p.y > .5) continue;   // над водой (птица, лев на берегу) — не задевает
      L.push([p.distanceToSquared(cam), p.x, p.y, p.z, r, o.id]);
    }
    (this.shoals || []).forEach((s, i) => { const x = s.c.x + Math.cos(s.a) * 5, z = s.c.z + Math.sin(s.a) * 5; L.push([(x - cam.x) ** 2 + (s.c.y - cam.y) ** 2 + (z - cam.z) ** 2, x, s.c.y, z, 2.5, 's' + i]); });
    L.sort((a, b) => a[0] - b[0]);
    const near = new Set(L.slice(0, AV).map(q => q[5])), kS = 1 - Math.exp(-dt / .5), kV = 1 - Math.exp(-dt / .4);
    for (const q of L) {
      let t = T.get(q[5]); if (!t) T.set(q[5], t = { x: q[1], z: q[3], vx: 0, vz: 0, s: 0 });
      if (dt > 0) { t.vx += ((q[1] - t.x) / dt - t.vx) * kV; t.vz += ((q[3] - t.z) / dt - t.vz) * kV; }
      t.x = q[1]; t.z = q[3]; t.y = q[2]; t.r = q[4]; t.seen = true;
    }
    for (const [id, t] of T) { t.s += ((near.has(id) && t.seen ? 1 : 0) - t.s) * kS; if (!t.seen && t.s < .01) T.delete(id); t.seen = false; }
    const act = [...T.values()].filter(t => t.s > .01).sort((a, b) => b.s - a.s).slice(0, AV);
    this.uAvoid.value.forEach((v, i) => { const t = act[i]; if (t) v.set(t.x, t.y, t.z, t.r); else v.set(0, -9999, 0, 1); });
    this.uAvoidV.value.forEach((v, i) => { const t = act[i]; if (t) v.set(t.vx, (t.r * 1.3 + Math.hypot(t.vx, t.vz) * 1.5 + .01) ** 2, t.vz, t.s); else v.set(0, 0, 0, 0); });
    this.uAvN.value = act.length;
    // v24: растения, до которых может дотянуться зверь (тело ×1.3 + след + 2.5 м на качание и ширину куста), — флаг aNear:
    // только у них вершинный шейдер считает расступание. Было: цикл по 10 зверям для всех ~860 тыс. вершин флоры —
    // на телефоне ~7 мс кадра (?bench=2). Остальным вклад и так нулевой — вид тот же
    const G = this._fGrid; if (!G) return;
    const was = this._nearOn ||= [], dirty = new Set();
    for (let q = 0; q < was.length; q += 2) { const a = this.flora[was[q]].userData.near; a.array[was[q + 1]] = 0; dirty.add(a); }
    was.length = 0;
    for (const t of act) {
      const Rr = t.r * 1.3 + Math.hypot(t.vx, t.vz) * 1.5 + 2.5;
      for (let cx = fCell(t.x - Rr); cx <= fCell(t.x + Rr); cx++) for (let cz = fCell(t.z - Rr); cz <= fCell(t.z + Rr); cz++) {
        const L = G[cx * FNG + cz]; if (!L) continue;
        for (let q = 0; q < L.length; q += 4) {
          const dx = L[q + 2] - t.x, dz = L[q + 3] - t.z; if (dx * dx + dz * dz > Rr * Rr) continue;
          const a = this.flora[L[q]].userData.near; if (!a.array[L[q + 1]]) { a.array[L[q + 1]] = 1; was.push(L[q], L[q + 1]); dirty.add(a); }
        }
      }
    }
    for (const a of dirty) a.needsUpdate = true;
  }

  // пена-крошка у кромки: каждая крупинка набегает от берега и откатывается с волной, растёт и тает
  _buildFoam() {
    const pos = [], dir = [], ph = [], sz = [];
    for (const p of this.shorePts) for (let k = 0; k < 3; k++) {
      const e = .5, gx = islandH(p.x + e, p.z) - islandH(p.x - e, p.z), gz = islandH(p.x, p.z + e) - islandH(p.x, p.z - e), L = Math.hypot(gx, gz) || 1;
      pos.push(p.x + rnd(-.4, .4), .06, p.z + rnd(-.4, .4)); dir.push(-gx / L, -gz / L); ph.push(Math.random()); sz.push(rnd(.12, .32));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    this.foamMat = new THREE.ShaderMaterial({
      uniforms: { uT: this.uT, uPix: this.uPix, uBright: this.uBright, uWave: { value: .3 } },
      vertexShader: `uniform float uT, uPix, uWave; attribute vec2 aDir; attribute float aPh, aSize; varying float vA;
        void main() { float u = fract(uT * (.12 + aPh * .06) + aPh);          // 0..1: набег волны
          float reach = (.6 + uWave * 2.2) * (1. - u) * (1. - u);            // выбросило на берег и откатило
          vec3 p = position + vec3(-aDir.x, 0., -aDir.y) * (reach - .3);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          vA = sin(u * 3.14159);
          // v16: крупинка мельче 1.5 пикселя не исчезает рывком, а становится прозрачнее (иначе мигала при повороте)
          float sz = aSize * vA * uPix / max(-mv.z, .5); vA = clamp(sz / 1.5, 0., 1.); gl_PointSize = max(1.5, sz); }`,
      fragmentShader: `uniform float uBright; varying float vA; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(.97) * uBright, smoothstep(.5, .3, d) * vA); }`,
      transparent: true, depthWrite: false,
    });
    const f = new THREE.Points(g, this.foamMat); f.frustumCulled = false; this.scene.add(f);
  }

  // «живой океан» — только картинка, без звука (решение 22.09 v9): стайки рыбок на мелководье (видны сквозь воду),
  // дальние стаи птиц над морем, случайные всплески рыб вдали. Не агенты симуляции — не звучат и не в журнале.
  _buildAmbient() {
    this._buildReef();
    const fishGeo = new THREE.ConeGeometry(.13, .7, 4); fishGeo.rotateX(Math.PI / 2);
    const fishMat = this._tailWag(this._stippled(new THREE.MeshLambertMaterial({ color: 0xb8c8cc, emissive: 0x2a4450, flatShading: true }), true, 9));
    this.shoals = [];
    for (let i = 0; i < 5; i++) {
      const n = 26, m = new THREE.InstancedMesh(fishGeo, fishMat, n); m.frustumCulled = false; this.scene.add(m);
      // v22: точка стайки — где не мельче 2.5 м (у самого берега стайка почти целиком упиралась в склон)
      let c = null; for (let k = 0; k < 20 && !(c && c.y < -2.5); k++) c = this.shallowPts[(Math.random() * this.shallowPts.length) | 0];
      c ||= new V3(R, -2, 0);
      this.shoals.push({ m, c: c.clone().setY(Math.min(-.6, c.y + 1.2)), a: Math.random() * 6.28, sp: rnd(.25, .45) * (Math.random() < .5 ? -1 : 1),
        f: Array.from({ length: n }, () => [rnd(-1.5, 1.5), rnd(-.4, .4), rnd(-1.5, 1.5), Math.random() * 6.28]) });
    }
    this.farShoals = [];
    { const geo = new THREE.ConeGeometry(.22, 1.1, 4); geo.rotateX(Math.PI / 2);
      const mat = this._tailWag(new THREE.MeshLambertMaterial({ color: 0x2b3a44, emissive: 0x18242c, flatShading: true }));
      for (let i = 0; i < 7; i++) {
        const n = 18, m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; this.scene.add(m);
        // v22: круг стаи (12 м + разброс 4 м) — весь над глубиной: у островков на 85–100 м спины рыб выходили на пляж
        let a = 0, r = 0;
        for (let k = 0; k < 30; k++) { a = Math.random() * 6.2832; r = rnd(95, 165);
          const cx = Math.cos(a) * r, cz = Math.sin(a) * r; let deep = true;
          for (let q = 0; q < 16 && deep; q++) deep = islandH(cx + Math.cos(q * .3927) * 17, cz + Math.sin(q * .3927) * 17) < -1.5;
          if (deep && islandH(cx, cz) < -1.5) break; }
        this.farShoals.push({ m, c: new V3(Math.cos(a) * r, .06, Math.sin(a) * r), a: Math.random() * 6.28, sp: rnd(.15, .3) * (Math.random() < .5 ? -1 : 1),
          f: Array.from({ length: n }, () => [rnd(-4, 4), 0, rnd(-4, 4), Math.random() * 6.28]) });
      }
    }
    const flocks = [], seg = [];
    for (let i = 0; i < 4; i++) { const n = 6 + (Math.random() * 5 | 0); flocks.push({ n, a: Math.random() * 6.28, r: rnd(110, 240), y: rnd(26, 42), w: rnd(.02, .045) * (Math.random() < .5 ? -1 : 1), off: seg.length / 12 });
      for (let k = 0; k < n; k++) seg.push(...new Array(12).fill(0)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.flockLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd3dcd3, transparent: true, opacity: .75 }));
    this.flockLines.frustumCulled = false; this.scene.add(this.flockLines); this.flocks = flocks;
    this.nextJump = 2; this.panicT = 0; this.nextHop = 3; this.nextLeap = 3;
    // v13: букашки, которых видно, только если приблизить камеру к земле: цепочки муравьёв, жуки, изредка змейка.
    // Все части — один InstancedMesh из шариков (дёшево); ползут по рельефу головой вперёд, к воде не выходят
    this.crawlMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshLambertMaterial({ flatShading: true, emissive: 0x141414 }), 700);
    this.crawlMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3);
    this.crawlMesh.count = 0; this.crawlMesh.frustumCulled = false; this.scene.add(this.crawlMesh);
    this.crawlers = []; this.crawlT = { ants: rnd(3, 7), beetle: rnd(2, 5), snake: rnd(12, 25) };
    if (new URLSearchParams(location.search).has('crawl')) this.crawlT = { ants: 0, beetle: 0, snake: 0 };   // QA: сразу
  }

  // риф: неоновые кораллы на подводной гряде + яркие рыбки, которые ходят над ним и изредка выпрыгивают
  _buildReef() {
    const P = [], C = [], Z = [], W = [], L = [], LC = [], LW = [];
    const dot = (p, c, s, w = 0) => { P.push(p.x, p.y, p.z); C.push(...c); Z.push(s); W.push(w); };
    const seg = (a, b, ca, cb, wa, wb) => { L.push(a.x, a.y, a.z, b.x, b.y, b.z); LC.push(...ca, ...cb); LW.push(wa, wb); };
    const pick = a => a[(Math.random() * a.length) | 0];
    const NEON = [[1, .36, .55], [1, .55, .25], [.3, 1, .9], [.62, .48, 1], [.98, .88, .35], [.38, .8, 1]];   // v11: ярче (было ×0.85)
    const pts = [];
    for (let i = 0; i < 1600; i++) {   // риф стал вдвое длиннее — и кораллов больше
      const [x, z] = reefPoint(1.2), y = islandH(x, z);
      if (y > -.8 || y < -6) continue;
      pts.push(new V3(x, y, z));
    }
    for (const p of pts) {
      const r = Math.random();
      if (r < .45) {   // «мозговой» коралл — шар из точек
        const c = pick(NEON), rad = rnd(.5, 1.4);
        for (let k = 0, n = 16 + (Math.random() * 18 | 0); k < n; k++) {
          const d = new V3(rnd(-1, 1), rnd(-.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rad * Math.cbrt(Math.random()));
          dot(new V3(p.x + d.x, p.y + rad * .7 + d.y, p.z + d.z), c.map(v => clamp(v * rnd(.7, 1.0))), rnd(.18, .32), .1);
        }
      } else if (r < .8) {   // ветвящийся коралл
        const c = pick(NEON);
        const grow = (a, dir, len, depth, root) => {
          const b = a.clone().addScaledVector(dir, len);
          seg(a, b, c.map(v => v * .5), c, (a.y - root) * .25, (b.y - root) * .25);
          if (depth === 0) { dot(b, c, rnd(.14, .24), (b.y - root) * .25); return; }
          for (let k = 0, kids = 1 + (Math.random() < .7); k < kids; k++) {
            const d = dir.clone().add(new V3(rnd(-.9, .9), rnd(0, .5), rnd(-.9, .9))).normalize();
            if (d.y < .25) { d.y = .25; d.normalize(); }
            grow(b, d, len * rnd(.6, .85), depth - 1, root);
          }
        };
        grow(p, new V3(rnd(-.3, .3), 1, rnd(-.3, .3)).normalize(), rnd(.5, 1.1), 3, p.y);
      } else {   // «веер» — вертикальные усики
        const c = pick(NEON);
        for (let k = 0, n = 5 + (Math.random() * 6 | 0); k < n; k++) {
          const b = new V3(p.x + rnd(-.5, .5), p.y, p.z + rnd(-.5, .5)), h = rnd(.8, 2.2);
          seg(b, new V3(b.x + rnd(-.4, .4), b.y + h, b.z + rnd(-.4, .4)), c.map(v => v * .4), c, 0, h * .4);
        }
      }
    }
    this._pts(P, C, Z, W); this._lines(L, LC, LW);
    { const h = [[], [], [], []]; for (let i = 0; i < Z.length; i += 4) { h[0].push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); h[1].push(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]); h[2].push(Z[i]); h[3].push(W[i]); }
      this._halo(...h, -.8); }   // v12: неоновые кораллы с ореолом ночью

    // яркие рифовые рыбки: ходят кругами над грядой, реагируют на акулу, изредка выпрыгивают
    const geo = new THREE.ConeGeometry(.16, .8, 4); geo.rotateX(Math.PI / 2);
    const mat = this._tailWag(this._stippled(new THREE.MeshLambertMaterial({ flatShading: true, emissive: 0x223344 }), true, 9));
    this.reefShoals = [];
    for (let i = 0; i < 7; i++) {
      const n = 30, m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; this.scene.add(m);
      const col = new THREE.Color();
      for (let k = 0; k < n; k++) { const c = pick(NEON); col.setRGB(c[0], c[1], c[2]).offsetHSL(rnd(-.04, .04), 0, rnd(-.08, .08)); m.setColorAt(k, col); }
      m.instanceColor.needsUpdate = true;
      let [x, z] = reefPoint(.5);
      for (let k = 0; k < 20 && islandH(x, z) > -2.5; k++) [x, z] = reefPoint(.5);   // v22: не над самым гребнем рифа
      this.reefShoals.push({ m, c: new V3(x, rnd(-3.2, -1.2), z), a: Math.random() * 6.28,
        sp: rnd(.3, .6) * (Math.random() < .5 ? -1 : 1), f: Array.from({ length: n }, () => [rnd(-2.5, 2.5), rnd(-.8, .8), rnd(-2.5, 2.5), Math.random() * 6.28]) });
    }
    this.nextReefJump = 4;
  }
  _stepAmbient(dt, t) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new V3(), Sc = new V3(1, 1, 1), Z0 = new V3(), Y = new V3(0, 1, 0);
    // v24: стайка вне кадра — не считаем её рыбок и не рисуем (466 рыбок каждый кадр — заметная доля JS на телефоне);
    // положение рыбки — функция времени, вернувшись в кадр, стайка сразу на своём месте
    const cam = this.camera; cam.updateMatrixWorld(); const F = this._frus ||= new THREE.Frustum(), Sp = this._frusS ||= new THREE.Sphere();
    F.setFromProjectionMatrix(M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const seen = (s, x, y, z, r) => (s.m.visible = F.intersectsSphere(Sp.set(P.set(x, y, z), r)));
    this.panicT = Math.max(0, (this.panicT || 0) - dt);
    // рифовые рыбки: круги над грядой; при охоте акулы рядом — врассыпную
    for (const s of this.reefShoals) {
      s.a += s.sp * dt * .35;
      const scare = this.panicT > 0 && this.panicAt && Math.hypot(this.panicAt.x - s.c.x, this.panicAt.z - s.c.z) < 40 ? 1 : 0;
      const spread = 1 + scare * 2.2, cx = s.c.x + Math.cos(s.a) * 6, cz = s.c.z + Math.sin(s.a) * 4;
      if (!seen(s, cx, s.c.y, cz, 3.5 * spread + 1)) continue;
      s.f.forEach(([x, y, z, ph], i) => {
        P.set(cx + x * spread + Math.sin(t * 1.6 + ph) * .4, s.c.y + y + Math.sin(t * 2.2 + ph) * .15, cz + z * spread + Math.cos(t * 1.4 + ph) * .4);
        // v21: над камнем рифа, но под водой; v22: и не в камне там, где гряда у самой поверхности (_fishInWater)
        const wet = this._fishInWater(P, cx, cz, s.c);
        Q.setFromAxisAngle(Y, Math.atan2(-Math.sin(s.a) * s.sp, Math.cos(s.a) * s.sp) + Math.sin(t * 7 + ph) * .2);
        M.compose(P, Q, wet ? Sc : Z0); s.m.setMatrixAt(i, M);
      });
      s.m.instanceMatrix.needsUpdate = true;
    }
    if ((this.nextReefJump -= dt) <= 0) {   // рыбка над рифом плеснула
      this.nextReefJump = rnd(5, 16);
      const s = this.reefShoals[(Math.random() * this.reefShoals.length) | 0];
      if (s) { const p = new V3(s.c.x + rnd(-6, 6), .05, s.c.z + rnd(-4, 4)); this._ripple(p, 2); this._burst(p, 0xeaf6ff, 7, 3.5); this.onLocalSound?.('splash', p); }
    }
    // кузнечики: очень редкие короткие прыжки в траве рядом с камерой (и щелчок в звуке)
    if ((this.nextHop -= dt) <= 0) {
      this.nextHop = rnd(6, 16);   // v11: чаще (было 20–60 с — пользователь: «повысь шанс появления насекомого»)
      const cam = this.camera.position, near = this.grassPts.filter(p => Math.hypot(p.x - cam.x, p.z - cam.z) < 34);
      const g = near[(Math.random() * near.length) | 0];
      if (g) { this._hop(g); this.onLocalSound?.('grasshopper', g); }
    }
    for (const s of this.farShoals) {   // дальние рыбы: спины у самой поверхности
      s.a += s.sp * dt * .2;
      const cx = s.c.x + Math.cos(s.a) * 12, cz = s.c.z + Math.sin(s.a) * 12, head = Math.atan2(-Math.sin(s.a) * s.sp, Math.cos(s.a) * s.sp);
      if (!seen(s, cx, 0, cz, 7)) continue;
      s.f.forEach(([x, y, z, ph], i) => {
        P.set(cx + x + Math.sin(t * .9 + ph) * .5, .06 + Math.sin(t * 1.7 + ph) * .12, cz + z + Math.cos(t * .8 + ph) * .5);
        Q.setFromAxisAngle(Y, head + Math.sin(t * 3 + ph) * .2); M.compose(P, Q, this._h(P.x, P.z) < -.6 ? Sc : Z0); s.m.setMatrixAt(i, M);   // v22: над мелью — не видно
      });
      s.m.instanceMatrix.needsUpdate = true;
    }
    for (const s of this.shoals) {
      s.a += s.sp * dt * .25;
      const panic = this.panicT > 0 && this.panicAt && Math.hypot(this.panicAt.x - s.c.x, this.panicAt.z - s.c.z) < 45 ? 2.4 : 1;
      const cx = s.c.x + Math.cos(s.a) * 5, cz = s.c.z + Math.sin(s.a) * 5, head = Math.atan2(-Math.sin(s.a) * s.sp, Math.cos(s.a) * s.sp);   // v12: без +π/2 — плыли боком
      if (!seen(s, cx, s.c.y, cz, 2.2 * panic + 1)) continue;
      s.f.forEach(([x, y, z, ph], i) => {
        P.set(cx + x * panic + Math.sin(t * 1.3 + ph) * .3, s.c.y + y + Math.sin(t * 2 + ph) * .1, cz + z * panic + Math.cos(t * 1.1 + ph) * .3);
        const wet = this._fishInWater(P, cx, cz, s.c);   // v22: стайки у берега заходили в склон острова (~30% рыбок)
        Q.setFromAxisAngle(Y, head + Math.sin(t * 6 + ph) * .15); M.compose(P, Q, wet ? Sc : Z0); s.m.setMatrixAt(i, M);
      });
      s.m.instanceMatrix.needsUpdate = true;
    }
    const a = this.flockLines.geometry.attributes.position.array;
    for (const f of this.flocks) {
      f.a += f.w * dt; const cx = Math.cos(f.a) * f.r, cz = Math.sin(f.a) * f.r, hx = -Math.sin(f.a) * Math.sign(f.w), hz = Math.cos(f.a) * Math.sign(f.w);
      for (let k = 0; k < f.n; k++) {
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;   // клин
        const bx = cx - hx * row * 2.2 + hz * side * row * 1.6, bz = cz - hz * row * 2.2 - hx * side * row * 1.6, by = f.y + Math.sin(k * 1.7) * .6;
        const flap = Math.sin(t * 5 + k) * .45, s = .9, o = (f.off + k) * 12;
        a.set([bx - hz * s, by + flap, bz + hx * s, bx, by, bz, bx, by, bz, bx + hz * s, by + flap, bz - hx * s], o);
      }
    }
    this.flockLines.geometry.attributes.position.needsUpdate = true;
    if ((this.nextJump -= dt) <= 0) {   // всплеск рыбы вдали: рябь + брызги
      this.nextJump = rnd(2, 7);
      const ang = Math.random() * 6.28, r = rnd(R + 12, 140), p = new V3(Math.cos(ang) * r, .05, Math.sin(ang) * r);
      this._ripple(p, 2.5); this._burst(p, 0xeaf6ff, 8, 4);
    }
    this._stepCrawlers(dt);
    if ((this.nextLeap -= dt) <= 0) {   // v12: совсем вдали (120–420 м) иногда выпрыгивает крупная рыба — видно дугу и всплеск
      this.nextLeap = rnd(4, 11);
      const ang = Math.random() * 6.28, r = rnd(120, 420);
      this._leap(new V3(Math.cos(ang) * r, 0, Math.sin(ang) * r), rnd(2.5, 4));
    }
  }
  // букашки (v13): появляются, только когда камера у самой земли над сушей (ближе ~16 м к точке обзора и ~12 м над
  // рельефом); изредка — цепочка муравьёв, жук, реже змейка. Ползут по рельефу, у воды разворачиваются
  _stepCrawlers(dt) {
    const cam = this.camera.position, tg = this.controls.target;
    const near = (cam.distanceTo(tg) < 16 && cam.y - hq(cam.x, cam.z) < 12 && hq(tg.x, tg.z) > .4) || (this._crawlQA ??= new URLSearchParams(location.search).has('crawl'));
    const GAP = { ants: [18, 40], beetle: [9, 22], snake: [45, 100] }, MAX = { ants: 1, beetle: 3, snake: 1 };
    if (near) for (const k of Object.keys(GAP)) if ((this.crawlT[k] -= dt) <= 0) {
      this.crawlT[k] = rnd(...GAP[k]);
      if (this.crawlers.filter(c => c.kind === k).length < MAX[k]) this._spawnCrawler(k, tg);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new V3(), S = new V3(), Y = new V3(0, 1, 0), C = new THREE.Color();
    let n = 0;
    const put = (x, z, r, sx, sz, h, col, lift = 0) => {
      if (n >= 700) return;
      P.set(x, hq(x, z) + r * .7 + lift, z); Q.setFromAxisAngle(Y, h); S.set(sx, r, sz);
      M.compose(P, Q, S); this.crawlMesh.setMatrixAt(n, M); this.crawlMesh.setColorAt(n, C.setRGB(...col)); n++;
    };
    this.crawlers = this.crawlers.filter(c => {
      this._crawlStep(c, dt);
      const k = clamp(Math.min(c.t / .6, (c.life - c.t) / .8));   // появляется и исчезает (уходит в траву)
      const at = i => c.trail[Math.min(i, c.trail.length - 1)] || [c.x, c.z];
      const dir = (i, j) => { const a = at(i), b = at(j); return Math.atan2(a[0] - b[0], a[1] - b[1]); };
      if (c.kind === 'ants') for (let i = 0; i < c.count; i++) {   // муравьи идут друг за другом по одной тропе
        const j = i * 8, h = dir(j, j + 2), w = Math.sin(c.t * 9 + i) * .012;
        for (const [o, r] of [[0, .026], [1, .02], [2, .034]]) { const p = at(j + o); put(p[0] + Math.cos(h) * w, p[1] - Math.sin(h) * w, r * k, r * k * .9, r * k * 1.3, h, [.2, .13, .1]); }
      } else if (c.kind === 'beetle') {
        const h = c.h; put(c.x, c.z, .075 * k, .12 * k, .17 * k, h, c.col);
        put(c.x + Math.sin(h) * .17, c.z + Math.cos(h) * .17, .05 * k, .06 * k, .06 * k, h, c.col.map(v => v * .5));
      } else for (let i = 0; i < 30; i++) {   // змейка: голова ведёт, тело повторяет её извилистый след
        const p = at(i * 2), r = (i === 0 ? .07 : lerp(.06, .018, i / 29)) * k, h = dir(i * 2, i * 2 + 2);
        put(p[0], p[1], r, r, r * 1.6, h, i % 6 < 3 ? c.col : c.col2);
      }
      return c.t < c.life && (this._crawlQA || cam.distanceTo(new V3(c.x, 0, c.z)) < 40);
    });
    this.crawlMesh.count = n; this.crawlMesh.instanceMatrix.needsUpdate = true; if (this.crawlMesh.instanceColor) this.crawlMesh.instanceColor.needsUpdate = true;
  }
  _crawlStep(c, dt) {
    c.t += dt;
    if (c.kind === 'beetle' && Math.sin(c.t * .9 + c.ph) < -.3) return;   // жук то идёт, то замирает
    c.h += Math.sin(c.t * c.wf + c.ph) * c.turn * dt;
    const nx = c.x + Math.sin(c.h) * c.sp * dt, nz = c.z + Math.cos(c.h) * c.sp * dt;
    if (hq(nx, nz) < .45) c.h += Math.PI * rnd(.6, 1); else { c.x = nx; c.z = nz; }
    const last = c.trail[0]; if (!last || Math.hypot(c.x - last[0], c.z - last[1]) > .04) { c.trail.unshift([c.x, c.z]); if (c.trail.length > c.keep) c.trail.pop(); }
  }
  _spawnCrawler(kind, near) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.2832, r = rnd(1.2, 6), x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      if (hq(x, z) < .7) continue;
      const pick = arr => arr[(Math.random() * arr.length) | 0];
      this.crawlers.push({ kind, x, z, h: Math.random() * 6.28, t: 0, ph: Math.random() * 6.28, trail: [],
        sp: { ants: .32, beetle: .22, snake: .5 }[kind], turn: { ants: 1.2, beetle: 1.5, snake: 3.2 }[kind], wf: { ants: .7, beetle: .9, snake: 2.6 }[kind],
        life: rnd(...{ ants: [30, 50], beetle: [20, 35], snake: [25, 40] }[kind]), count: 9 + (Math.random() * 7 | 0),
        keep: { ants: 140, beetle: 2, snake: 64 }[kind],
        col: kind === 'beetle' ? pick([[.2, .55, .55], [.62, .2, .22], [.7, .58, .2]]) : pick([[.55, .7, .4], [.62, .5, .78]]), col2: pick([[.9, .8, .5], [.3, .35, .3]]) });
      if (this._crawlQA) for (let j = 0; j < 400; j++) this._crawlStep(this.crawlers[this.crawlers.length - 1], .02);   // QA: уже в пути (снимок — ~1 с жизни мира)
      return;
    }
  }
  // прыжок кузнечика: крошечная точка по дуге над травой
  _hop(from) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([from.x, from.y + .15, from.z], 3));
    const m = new THREE.PointsMaterial({ color: 0xc8e86a, size: .14, sizeAttenuation: true, transparent: true });
    const pt = new THREE.Points(g, m); this.scene.add(pt);
    const to = from.clone().add(new V3(rnd(-1.6, 1.6), 0, rnd(-1.6, 1.6))), life = .6; let t = 0;
    this.fx.push(dt => {
      t += dt; const u = clamp(t / life), a = g.attributes.position;
      a.setXYZ(0, lerp(from.x, to.x, u), lerp(from.y, hq(to.x, to.z), u) + .15 + Math.sin(u * Math.PI) * 1.1, lerp(from.z, to.z, u)); a.needsUpdate = true;
      if (u >= 1) { this.scene.remove(pt); g.dispose(); m.dispose(); return false; } return true;
    });
  }

  // ночная жизнь: светящийся планктон в воде у острова и светлячки над травой (днём не видны)
  // order — порядок среди прозрачного: под водой (−0.8) рисуется ДО воды (вода его подкрашивает), над водой (0) — после
  _glowField(n, place, palette, size, drift, order = 0) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos.set(place(), i * 3); seed[i] = Math.random(); col.set(palette[(Math.random() * palette.length) | 0], i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: this.uT, uPix: this.uPix, uK: { value: 0 } },
      vertexShader: `uniform float uT, uPix; attribute float aSeed; attribute vec3 aCol; varying vec3 vCol; varying float vA;
        void main() { vec3 p = position;
          p.x += sin(uT * .31 + aSeed * 30.) * ${drift.toFixed(2)}; p.y += sin(uT * .53 + aSeed * 50.) * ${(drift * .3).toFixed(2)}; p.z += cos(uT * .27 + aSeed * 20.) * ${drift.toFixed(2)};
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1., ${size.toFixed(2)} * (.6 + aSeed * .8) * uPix / max(-mv.z, .5));
          vCol = aCol; vA = pow(max(0., sin(uT * (.8 + aSeed * 1.6) + aSeed * 40.)), 3.); }`,
      fragmentShader: `uniform float uK; varying vec3 vCol; varying float vA;
        void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vCol, smoothstep(.5, .0, d) * vA * uK); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = order; this.scene.add(pts); m.userData.g = g; (this.glowPts ||= []).push(pts); return m;
  }
  _buildNightLife() {
    const sea = this.shallowPts, grass = this.grassPts;
    this.plankton = this._glowField(3200, () => { const a = Math.random() * 6.2832, r = rnd(R * .8, R * 5.2); return [Math.cos(a) * r, rnd(-2.5, -.05), Math.sin(a) * r]; },
      [[.3, .8, 1], [.2, .6, 1], [.5, 1, .9]], .55, 1.2, -.8);
    // v11: далёкий планктон — светящиеся пятна на воде кольцом 150–650 м (рисунок пользователя «Люминесцентный планктон
    // и фоновые рыбы»): ярко в сумерки и ночью, днём едва заметен
    // v12: 2600 → 700 и мельче — пользователь: «уменьшить количество частиц вдали» (скриншот «частицы»)
    this.farPlankton = this._glowField(700, () => { const a = Math.random() * 6.2832, r = 150 + Math.pow(Math.random(), .7) * 500; return [Math.cos(a) * r, .12, Math.sin(a) * r]; },
      [[.3, .85, 1], [.25, .65, 1], [.45, 1, .85], [.7, .55, 1]], 2.1, 3);
    const fly = () => { const p = grass[(Math.random() * grass.length) | 0] || new V3(); return [p.x + rnd(-2, 2), p.y + rnd(.5, 3.5), p.z + rnd(-2, 2)]; };
    this.fireflies = this._glowField(220, fly, [[.85, 1, .4], [1, .9, .35]], .5, 2.5);
    void sea;
    // v23: ещё 260 светлячков, чуть крупнее (над травой главного острова и островков; яркость — общая с первыми), и мотыльки
    seededRandom(2310, () => { const more = this._glowField(260, fly, [[.85, 1, .4], [1, .9, .35]], .62, 2.5); more.uniforms.uK = this.fireflies.uniforms.uK; this.flies = [this.fireflies.userData.g, more.userData.g]; this._buildMoths(); });
  }
  // v23: ночные мотыльки у воды — порхают петлями над кромкой берегов (главный остров и островки), машут крыльями.
  // Один InstancedMesh, весь полёт — в вершинном шейдере (процессор каждый кадр ничего не считает); светлые, едва
  // светятся. Днём их нет: uK как у светлячков — появляются и тают на закате и рассвете (frame)
  _buildMoths() {
    const n = 110, base = new THREE.BufferGeometry();
    // крылья по бокам тела (голова — +z): с каждой стороны переднее и заднее; в шейдере машут вокруг оси тела
    const R1 = [0, 0, .12, 0, 0, 0, .3, 0, .07,  0, 0, 0, .24, 0, -.03, .3, 0, .07,  0, 0, 0, 0, 0, -.12, .2, 0, -.07,  0, 0, -.12, .12, 0, -.17, .2, 0, -.07];
    base.setAttribute('position', new THREE.Float32BufferAttribute(R1.concat(R1.map((v, i) => i % 3 ? v : -v)), 3));
    const g = new THREE.InstancedBufferGeometry().copy(base); g.instanceCount = n;
    const C = new Float32Array(n * 3), D = new Float32Array(n * 4), sh = this.shorePts;
    for (let i = 0; i < n; i++) {
      const p = sh[(Math.random() * sh.length) | 0] || new V3(R, 0, 0);
      C.set([p.x + rnd(-1.5, 1.5), rnd(.5, 2.2), p.z + rnd(-1.5, 1.5)], i * 3);
      D.set([rnd(.8, 2.6), rnd(.5, 1.1) * (Math.random() < .5 ? -1 : 1), Math.random() * 6.2832, Math.random()], i * 4);   // радиус петли, скорость, фаза, оттенок
    }
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 3)); g.setAttribute('aD', new THREE.InstancedBufferAttribute(D, 4));
    this.mothMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,   // v24: плоские крылья — порядок сторон не важен
      uniforms: { uT: this.uT, uK: { value: 0 } },
      vertexShader: `uniform float uT, uK; attribute vec3 aC; attribute vec4 aD; varying float vT;
        void main() {
          float t = uT * aD.y + aD.z, R = aD.x;
          vec3 c = aC + vec3(cos(t) * R + sin(t * 2.3) * .5, sin(t * 3.1) * .3 + sin(t * .7) * .25, sin(t) * R * .7 + cos(t * 1.9) * .5);
          vec2 v = vec2(-sin(t) * R + cos(t * 2.3) * 1.15, cos(t) * R * .7 - sin(t * 1.9) * .95) * sign(aD.y);
          float yaw = atan(v.x, v.y), fl = sin(uT * 24. + aD.z * 7.) * .95;
          vec3 p = position; if (abs(p.x) > .001) p = vec3(p.x * cos(fl), abs(p.x) * sin(fl), p.z);   // взмах крыльев
          p = vec3(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw)) * step(.01, uK);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p, 1.); vT = aD.w; }`,
      fragmentShader: `uniform float uK; varying float vT;
        void main() { gl_FragColor = vec4(mix(vec3(.95, .9, .78), vec3(.84, .8, 1.), vT), .75 * uK); }`,
    });
    const m = new THREE.Mesh(g, this.mothMat); m.frustumCulled = false; this.scene.add(m); this.mothGeo = g; g.userData.n = n; this.mothMesh = m;
  }

  // светящиеся частицы в воздухе и над водой — слой «как у образца»; днём еле заметны, ночью мерцают
  _buildMotes() {
    const n = 1500, pos = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
    const palette = [[1, 1, 1], [1, 1, 1], [1, .72, .42], [1, .48, .42], [.55, .9, 1]];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 95 + 4, a = Math.random() * 6.2832;
      pos.set([Math.sin(a) * r, Math.random() < .35 ? rnd(.1, 1.2) : rnd(1, 48), Math.cos(a) * r], i * 3);   // до 48 м: с поднятой камерой они больше не кончаются
      seed[i] = Math.random(); col.set(palette[(Math.random() * palette.length) | 0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    this.moteMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: this.uT, uPix: this.uPix, uK: { value: .3 } },
      vertexShader: `uniform float uT, uPix; attribute float aSeed; attribute vec3 aCol; varying vec3 vCol; varying float vA;
        void main() { vec3 p = position;
          p.x += sin(uT * .07 + aSeed * 30.) * 4.; p.y += sin(uT * .2 + aSeed * 50.) * .6; p.z += cos(uT * .06 + aSeed * 20.) * 4.;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1., (.12 + aSeed * .18) * uPix / max(-mv.z, .5));
          vCol = aCol; vA = .35 + .65 * max(0., sin(uT * 1.3 + aSeed * 40.)); }`,
      fragmentShader: `uniform float uK; varying vec3 vCol; varying float vA;
        void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vCol, smoothstep(.5, .0, d) * vA * uK); }`,
    });
    const m = new THREE.Points(g, this.moteMat); m.frustumCulled = false; this.scene.add(m);
  }

  // океан: плоскость до горизонта, волны — в нормалях (дёшево и красиво сверху), цвет по глубине из карты высот,
  // пена у берега бежит полосами, блик солнца/луны, дальше — растворяется в цвете горизонта
  _buildWater() {
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uT: { value: 0 }, uWave: { value: .3 }, uH: { value: this.heightTex }, uS: { value: S },
        uSh: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() },
        uLDir: { value: new V3(0, 1, 0) }, uLCol: { value: new THREE.Color() }, uFoam: { value: 1 }, uGlow: { value: 0 }, uCaps: { value: 0 },
      },
      vertexShader: `varying vec3 vWP; void main() { vec4 w = modelMatrix * vec4(position, 1.); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uT, uWave, uS, uFoam, uGlow, uCaps; uniform sampler2D uH;
        uniform vec3 uSh, uDeep, uHor, uZen, uLDir, uLCol; varying vec3 vWP;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
        void main() {
          vec2 p = vWP.xz;
          // волны: сумма синусов разных направлений → производные → нормаль
          vec2 g = vec2(0.);
          vec4 D[4]; D[0] = vec4(.8, .6, .35, 1.1); D[1] = vec4(-.5, .85, .55, 1.6); D[2] = vec4(.2, -.95, .9, .8); D[3] = vec4(-.9, -.3, 1.4, 2.1);
          for (int i = 0; i < 4; i++) { vec2 d = D[i].xy; float k = D[i].z; g += d * k * cos(dot(d, p) * k + uT * D[i].w) / k; }
          g += (vec2(vn(p * .6 + uT * .3), vn(p * .6 - uT * .25 + 7.)) - .5) * 1.2;
          vec3 n = normalize(vec3(-g.x * .06 * uWave, 1., -g.y * .06 * uWave));
          vec2 uv = p / (2. * uS) + .5;
          // v14: за картой рельефа — то же дно, что у её края (−10 м). Было −12: ночное свечение лагуны зависит от глубины,
          // за краем карты оно было чуть слабее — на тёмной воде проступал квадрат («границы локации всё ещё видны ночью»)
          float h = (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) ? texture2D(uH, uv).r : -10.;
          float depth = max(-h, 0.);
          vec3 V = normalize(cameraPosition - vWP);
          vec3 col = mix(uSh, uDeep, smoothstep(.2, 7., depth));
          float fres = pow(1. - max(dot(n, V), 0.), 4.);
          col = mix(col, mix(uHor, uZen, .6), fres * .3);   // отражение неба слабее — вода не молочная, дно видно
          col += uLCol * pow(max(dot(reflect(-uLDir, n), V), 0.), 400.) * .45;
          // пена у берега: полосы бегут к кромке + рваный край
          float fn = vn(p * 1.3 + uT * .4);
          float band = sin(depth * 3.2 - uT * 1.8 + fn * 2.) * .5 + .5;
          // v16: кромка сглажена по размеру пикселя (fwidth) — вдали она тоньше пикселя и при повороте камеры мигала;
          // бегущие полосы пены гаснут там, где они мельче пикселя (иначе рябят)
          float aa = fwidth(depth) * 1.5;
          float foam = (1. - smoothstep(0., .45 + .25 * fn + aa, depth)) + band * (1. - smoothstep(.2, 1.6, depth)) * .45 * clamp(1. - aa * 2., 0., 1.);
          col = mix(col, vec3(1.), clamp(foam, 0., 1.) * uFoam);
          // светящаяся ночью лагуна (v12): мягкая полоса, затухающая с глубиной (в метрах, а не в пикселях) — ореол у
          // берегов одинаковый и издалека, и вблизи («как на фото пример люмена»)
          col += uSh * uGlow * (exp(-depth * .3) * .9 + .1 * exp(-depth * .08)) * (.6 + .4 * fn);
          // барашки: живой открытый океан — белые гребни появляются и тают, их больше при сильном ветре
          float cap = smoothstep(.83 - uCaps * .1, .9, vn(p * .09 + vec2(uT * .35, uT * .12))) * smoothstep(.55, .85, vn(p * .7 - uT * .5));
          col = mix(col, vec3(.92), cap * uCaps * smoothstep(2., 6., depth) * uFoam);
          // прозрачность: на мелководье видно дно и сад; v11 — и над глубиной вода полупрозрачная (пользователь: акулу под
          // водой не видно). Плотной вода становится только вдали от камеры. v12: без квадрата у края карты — под водой
          // теперь везде дно (_buildTerrain), а квадрат и был «видимой границей локации»
          float dist = length(vWP - cameraPosition);
          float a = mix(.28, .55, smoothstep(.5, 8., depth));
          a = mix(a, 1., smoothstep(190., 330., dist));   // v15: было 120–200 м — с высоты облёта риф уже не просвечивал
          col *= mix(1., .5, smoothstep(45., 170., length(p)));   // вдали от острова темнее — взгляд держится на острове
          // v13: вдали море — чуть темнее неба (как настоящее у горизонта), и только у самого края — дымка. Раньше вся вода
          // дальше 520 м становилась цветом неба, и дальний остров «висел в воздухе» (под ним не было видно моря)
          col = mix(col, mix(uHor, uDeep, .3), smoothstep(150., 700., dist));
          col = mix(col, uHor, smoothstep(3300., 4900., dist));   // v14: дальний остров отодвинут — море под ним должно быть видно
          gl_FragColor = vec4(col, max(a, clamp(foam, 0., 1.)));
        }`,
    });
    // v24: сетка 256×256 (клетки ~39 м), а не два треугольника 10×10 км — на огромных треугольниках глубина и мировые
    // координаты точки считаются с погрешностью, и у пологих пляжей граница «вода спереди / песок спереди» дрожала при
    // каждом сдвиге камеры (мерцание кромки); за камерой вода сдвигается целыми клетками — сетка стоит в мире
    this.waterN = 256;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000, this.waterN, this.waterN), this.waterMat);
    water.rotation.x = -Math.PI / 2; this.scene.add(water); this.water = water;
    // v11: вода рисуется раньше всего прозрачного над ней (частицы, облака, брызги, светлячки). Раньше её план, будучи
    // «ближе всех» к камере, рисовался последним и закрашивал всё, за чем виднелась вода: стоило поднять камеру —
    // частицы пропадали, облака «резались» ровно по линии горизонта. Подводное (планктон, медузы) — ещё раньше (−0.8)
    water.renderOrder = -.5;
  }

  // облака: пухлые низкополигональные «клубы» из шаров (свои, в стиле моделей), плывут по ветру
  _buildClouds() {
    // emissive — облако светится само (иначе снизу, со стороны камеры, оно тёмное как камень).
    // У каждого облака свой материал: облако, к которому камера подлетела вплотную, плавно тает (иначе край кадра
    // «разрезал» его пополам). Исчезали и резались по горизонту облака из-за порядка отрисовки воды — см. _buildWater
    // v14: кучевые облака вместо «шаров»: плоский низ, внизу ряд крупных клубов, выше — поменьше, сверху 1–2 «шапки»;
    // всё слито в одну форму с бугристой поверхностью (шум по нормали) и мягким светом (без плоских граней)
    const mk = () => this._stippled(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, transparent: true, opacity: .5 }), true, 1.4);
    this.clouds = [];
    for (let i = 0; i < 22; i++) {
      const grp = new THREE.Group(), w = rnd(16, 34), mat = mk(), geos = [];
      for (const [n, span, rk, hk] of [[5 + (Math.random() * 3 | 0), 1, .3, 0], [3 + (Math.random() * 2 | 0), .6, .36, .32], [1 + (Math.random() * 2 | 0), .3, .3, .62]])
        for (let k = 0; k < n; k++) {
          const r = w * rk * rnd(.75, 1.15), x = (n > 1 ? k / (n - 1) - .5 : 0) * w * 1.7 * span + rnd(-.08, .08) * w;
          const gg = new THREE.IcosahedronGeometry(r, 3); gg.deleteAttribute('uv'); gg.translate(x, hk * w + r * .25, rnd(-.22, .22) * w); geos.push(gg);
        }
      const cg = mergeGeometries(geos), CP = cg.attributes.position, CN = cg.attributes.normal, base = w * .04;
      for (let j = 0; j < CP.count; j++) {
        const x = CP.getX(j), y = CP.getY(j), z = CP.getZ(j), b = nz(x * .09 + i * 7, z * .09 + y * .07) * w * .06;
        CP.setXYZ(j, x + CN.getX(j) * b, Math.max(base, y + CN.getY(j) * b), z + CN.getZ(j) * b);   // бугры; низ срезан ровно
      }
      cg.computeVertexNormals(); cg.scale(1, .8, 1);
      // сначала невидимый проход пишет глубину передней поверхности, потом цвет рисуется только там (LessEqual) —
      // иначе сквозь полупрозрачное облако видны внутренние шары, из которых оно слеплено
      const pre = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true })); pre.renderOrder = 1;
      const body = new THREE.Mesh(cg, mat); body.renderOrder = 1.001; mat.depthWrite = false; mat.depthFunc = THREE.LessEqualDepth;
      grp.add(pre, body);
      const a = Math.random() * 6.2832, r = rnd(90, 450);
      grp.position.set(Math.cos(a) * r, rnd(38, 70), Math.sin(a) * r); grp.rotation.y = Math.random() * 6.28;
      grp.userData = { k: i / 22, w, mat, pre };   // k — порог появления: в ясную погоду видна часть, в шторм все
      this.scene.add(grp); this.clouds.push(grp);
    }
  }


  // дальний остров на горизонте: силуэт в дымке с одной стороны (не затрагивает симуляцию)
  // v12: был «куском пластилина» (сфера с шумом) в 450 м. Теперь ~1150 м и настоящий рельеф: гряда вершин с долинами
  // (ridged-шум), пляж, лес, скалы; дымка горизонта сильнее у подножия; ночью у кромки — светящаяся полоса, как у
  // наших берегов
  // v14: ещё дальше (~2.1 км, было 1150 м) и в центре — вулкан (конус с кратером): ночью кратер и потёки светятся красным,
  // над ним красный ореол; днём — едва тлеет. Не детализирован — он далеко
  _buildFarIsland() {
    const W = 900, D = 440, g = new THREE.PlaneGeometry(W, D, 200, 100); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, col = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), e = (x / (W * .46)) ** 2 + (z / (D * .44)) ** 2;
      const ridge = (1 - Math.abs(nz(x * .006 + 31, z * .006 - 4))) ** 2.2 * .7 + (1 - Math.abs(nz(x * .017 + 7, z * .017 + 2))) ** 2 * .3;
      const rv = Math.hypot(x, z * 1.4), cone = 175 * Math.max(0, 1 - rv / 240) ** 1.15 - 30 * smooth(28, 0, rv);   // вулкан с кратером
      const mask = smooth(1, .3, e), y = Math.max(mask * (6 + 105 * ridge * smooth(.95, .15, e)), cone * mask) - 8 * (1 - mask);
      P.setY(i, y);
      const v = fbm(x * .03, z * .03, 2) * .5 + .5, ash = smooth(90, 130, y) * smooth(260, 120, rv);   // склоны вулкана — пепельные
      col.push(...mix3(y < 4 ? rgb('#d9c9a4') : mix3(mix3(rgb('#6f8f6c'), rgb('#86a07a'), v), mix3(rgb('#b88f86'), rgb('#a88a80'), v), smooth(45, 75, y + v * 12)), rgb('#6e6468'), ash));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.uFarHaze = { value: new THREE.Color() }; this.uFarGlow = { value: new THREE.Color() }; this.uVolc = { value: new THREE.Color() };
    const mat = this._hook(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), sh => {
      Object.assign(sh.uniforms, { uHaze: this.uFarHaze, uGlowC: this.uFarGlow, uVolc: this.uVolc, uT: this.uT });
      sh.vertexShader = 'varying vec3 vFL;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFL = position;');
      sh.fragmentShader = 'uniform vec3 uHaze, uGlowC, uVolc; uniform float uT; varying vec3 vFL;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
        `gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, mix(.62, .45, smoothstep(0., 90., vFL.y))) + uGlowC * smoothstep(6., 0., vFL.y);
         { float rv = length(vFL.xz * vec2(1., 1.4));
           float crater = smoothstep(40., 10., rv) * smoothstep(110., 150., vFL.y);
           float lava = smoothstep(.9, .99, sin(atan(vFL.z, vFL.x) * 7. + sin(rv * .05) * 1.5)) * smoothstep(60., 150., vFL.y) * smoothstep(120., 30., rv);
           gl_FragColor.rgb += uVolc * (crater * (1.3 + .3 * sin(uT * 1.7)) + lava * .6); }
         #include <fog_fragment>`);
    }, 'far2');
    this.farIsland = new THREE.Mesh(g, mat);
    const fd = new V3(-910, 0, -705).normalize();
    this.farIsland.position.copy(fd).multiplyScalar(2100); this.farIsland.rotation.y = Math.atan2(fd.x, fd.z);   // длинной стороной к нам
    this.scene.add(this.farIsland);
    this.volcGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff4a1c, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.volcGlow.scale.set(260, 170, 1); this.volcGlow.position.set(0, 170, 0); this.farIsland.add(this.volcGlow);
    this._buildCurrents();
    // v13: еле заметное свечение по кромке (как ореол у наших островов) — светящаяся полоса на воде вдоль берега
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, D * 1.3), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uC: this.uFarGlow, uT: this.uT },
      vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uC; uniform float uT; varying vec2 vP;
        void main() { float e = length(vP / vec2(${(W * .46).toFixed(1)}, ${(D * .44).toFixed(1)}));   // берег — около e = 0.8
          float g = exp(-pow((e - .83) / .07, 2.)) * (.75 + .25 * sin(uT * .6 + vP.x * .02));
          gl_FragColor = vec4(uC * g * 2., 1.); }`,
    }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .4; this.farIsland.add(ring);
  }

  // течения планктона от дальнего острова (v14, рисунок пользователя; v15 переделаны): 5 светящихся извилистых полос
  // расходятся веером от его ближнего берега и гаснут, не доходя до нашей локации. v15: выглядят как кромки наших
  // островов издалека — мягкий голубой ореол с яркой серединой (не россыпь точек), и «дышат» медленно
  _buildCurrents() {
    const I = this.farIsland.position, toUs = I.clone().multiplyScalar(-1).normalize(), side = new V3(-toUs.z, 0, toUs.x);
    const pos = [], aS = [], aV = [], aK = [], idx = [];
    for (let k = 0; k < 5; k++) {
      const start = I.clone().addScaledVector(toUs, 175).addScaledVector(side, rnd(-300, 300));
      const dir = toUs.clone().applyAxisAngle(new V3(0, 1, 0), (k / 4 - .5) * 2.2 + rnd(-.12, .12)), n = new V3(-dir.z, 0, dir.x);
      const len = rnd(900, 1500), amp = rnd(40, 80), wl = rnd(260, 420), ph = Math.random() * 6.28, pts = [];
      for (let i = 0; i <= 80; i++) {
        const u = i / 80, p = start.clone().addScaledVector(dir, u * len).addScaledVector(n, Math.sin(u * len / wl * 6.28 + ph) * amp * u);
        if (p.length() < 300) break;   // до нашей локации не доходят
        pts.push(p);
      }
      if (pts.length < 5) continue;
      const base = pos.length / 3, seed = Math.random();
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t = b.clone().sub(a).normalize(), nn = new V3(-t.z, 0, t.x);
        const u = i / (pts.length - 1), w = 30 + u * 110;   // к концу течение шире
        for (const v of [-1, 1]) { pos.push(p.x + nn.x * v * w / 2, .3, p.z + nn.z * v * w / 2); aS.push(u); aV.push(v); aK.push(seed); }
        if (i) { const q = base + i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1)); g.setAttribute('aK', new THREE.Float32BufferAttribute(aK, 1)); g.setIndex(idx);
    this.curMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, forceSinglePass: true,
      uniforms: { uT: this.uT, uK: { value: 0 }, uC: { value: new THREE.Color() } },
      vertexShader: `attribute float aS, aV, aK; varying float vS, vV, vK; void main() { vS = aS; vV = aV; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uT, uK; uniform vec3 uC; varying float vS, vV, vK;
        void main() { float d = abs(vV), core = exp(-pow(d / .16, 2.)), halo = exp(-pow(d / .55, 2.));
          float fade = smoothstep(0., .08, vS) * smoothstep(1., .6, vS);
          float breathe = .75 + .25 * sin(vS * 38. - uT * .1 + vK * 6.) * sin(vS * 15. + uT * .06 + vK * 3.);   // медленно, как дыхание
          vec3 c = uC * halo * .75 + mix(uC, vec3(1.), .45) * core * .6;
          gl_FragColor = vec4(c, fade * breathe * uK); }` });
    const m = new THREE.Mesh(g, this.curMat); m.frustumCulled = false; this.scene.add(m);
  }

  _buildRain() {
    const n = 2600, pos = new Float32Array(n * 2 * 3), off = new Float32Array(n * 2), rr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = rnd(-90, 90), y = rnd(0, 55), z = rnd(-90, 90), r = Math.random();
      for (let e = 0; e < 2; e++) { const k = i * 2 + e; pos.set([x, y, z], k * 3); off[k] = e; rr[k] = r; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aOff', new THREE.BufferAttribute(off, 1)); g.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSlant: { value: 0 } },
      vertexShader: `uniform float uTime, uAmt, uSlant; attribute float aOff, aR; varying float vA;
        void main() {
          float y = mod(position.y - uTime*(38. + aR*20.), 55.);
          vec3 p = vec3(position.x + y*uSlant, y + aOff*(1.6 + aR*1.6), position.z);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          vA = step(aR, uAmt) * (.25 + .3*(1. - smoothstep(20., 150., -mv.z)));
          if (aR > uAmt) gl_Position = vec4(2., 2., 2., 1.);
        }`,
      fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(.8, .86, .92, vA); }`,
    });
    this.rain = new THREE.LineSegments(g, m); this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  // ------------------------------------------------------------------ модели
  // Стиль животных (решение 22.09): «между моделью в мягком тоне и светящимся силуэтом» — исходные цвета
  // обесцвечиваются и тонируются в один мягкий цвет вида, по краю — светящийся контур (ночью ярче).
  // Все материалы → Lambert, одна стилистика для CC0 и CC-BY моделей. GLTFLoader отдаёт линейные цвета,
  // а вывод у нас без sRGB — поэтому convertLinearToSRGB, иначе всё темнее задуманного.
  // v24: текстуры моделей — не больше 1024 точек («Лёгкое» — 256). У звезды, осьминога, пеликана и льва были по 2048: одна
  // такая — ~21 МБ видеопамяти, а цвет текстуры у нас всё равно приглушён тоном вида и рисуется гранями (flatShading)
  _fitTex(t) {
    const im = t.image, cap = this.lite ? 256 : 1024;
    if (!im || !(Math.max(im.width, im.height) > cap)) return;
    const k = cap / Math.max(im.width, im.height), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); im.close?.();
    t.image = c; t.needsUpdate = true;
  }
  _restyle(root, tint, rim, keep = .25) {
    const uTint = { value: new THREE.Color(tint) }, uRim = { value: new THREE.Color(rim) }, uKeep = { value: keep }, uRimK = this.uRimK;
    root.traverse(n => {
      if (!n.isMesh) return;
      const src = Array.isArray(n.material) ? n.material : [n.material];
      const out = src.map(m => {
        const c = (m.color || new THREE.Color(1, 1, 1)).clone().convertLinearToSRGB();
        if (m.map) { m.map.colorSpace = THREE.NoColorSpace; this._fitTex(m.map); }
        const mat = new THREE.MeshLambertMaterial({ color: c, map: m.map || null, vertexColors: !!n.geometry.attributes.color, flatShading: true });
        this._hook(mat, sh => {
          Object.assign(sh.uniforms, { uTint, uRim, uKeep, uRimK });
          sh.fragmentShader = 'uniform vec3 uTint, uRim; uniform float uKeep, uRimK;\n' + sh.fragmentShader
            .replace('#include <color_fragment>', `#include <color_fragment>
              { float l = dot(diffuseColor.rgb, vec3(.3, .59, .11));
                diffuseColor.rgb = mix(uTint * (.55 + .55 * l), mix(vec3(l), diffuseColor.rgb, .5), uKeep); }`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
              totalEmissiveRadiance += uRim * uRimK * pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.5);`);
        }, 'tone');
        return this._stippled(mat, true, 7);
      });
      n.material = Array.isArray(n.material) ? out : out[0];
    });
  }
  // v24: ход загрузки (экран входа и ?debug=1), у каждой модели — предел 30 с (не пришла — мир без неё, вход не ждёт);
  // в «Лёгком» акула и косатка — при первом появлении (_lazyModel)
  async _loadAssets() {
    const names = ['dolphin', 'whale', 'fish', 'shark', 'orca', 'gull', 'gull_dark', 'pelican', 'sea_lion', 'palm_1', 'palm_2', 'palm_3',
      'jellyfish', 'octopus', 'starfish', 'crab', 'turtle', 'shrimp', 'stingray'].filter(n => !(this.lite && LAZY.has(n)));
    const ms = step('модели'); let n = 0, bad = 0;
    const got = await Promise.all(names.map(nm => this._fetchModel(nm).then(g => { ms.note(`${++n} из ${names.length}`); return g; },
      e => { bad++; console.error(nm, e); ms.note(`${++n} из ${names.length}`); return null; })));
    ms.done(!bad, bad ? `не пришло: ${bad}` : '');
    this.assets = {};
    names.forEach((nm, i) => { if (got[i]) this._prepModel(nm, got[i]); });
    this._plantPalms();
    for (const o of this.agents.values()) this._attachModel(o);
    this._warmUp();
    // v19: сетки обхода мели (navGrid, ~30 мс каждая на ПК) — заранее, по одной за раз, а не рывком посреди просмотра
    Object.keys(ORB).forEach((sp, i) => setTimeout(() => navGrid(SWIM_DEPTH[sp], ORB[sp]), 1500 + i * 400));
  }
  _fetchModel(n) { this._gltf ??= new GLTFLoader(); return within(new Promise((res, rej) => this._gltf.load(`./models/${n}.glb`, res, undefined, rej)), 30000, n); }
  // v24: редкий гость в «Лёгком» — модель грузится при первом появлении, шейдер собирается до показа
  _lazyModel(n) {
    (this._lazy ??= {})[n] ??= this._fetchModel(n).then(g => {
      this._prepModel(n, g);
      const probe = this._clone(n); probe.obj.position.y = -500;
      return this.renderer.compileAsync(probe.obj, this.camera, this.scene).catch(() => {});
    }).then(() => { for (const o of this.agents.values()) if (!o.attached) this._attachModel(o); })
      .catch(e => { console.warn('модель', n, e?.message || e); delete this._lazy[n]; });
  }
  // v24: креветка — 34 куска с одинаковым материалом → один: рой из 12 креветок рисовался 408 вызовами отрисовки (два роя —
  // 816 из ~920 на кадр: больше всего времени и процессора, и видеокарты). Вид тот же
  _mergeModel(root) {
    root.updateMatrixWorld(true); const gs = [], ms = [];
    root.traverse(m => { if (!m.isMesh) return; const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); gs.push(g); ms.push(m); });
    if (gs.length < 2) return;
    const mesh = new THREE.Mesh(mergeGeometries(gs.every(g => g.index) ? gs : gs.map(g => g.index ? g.toNonIndexed() : g)), ms[0].material);
    for (const m of ms) m.removeFromParent(); root.add(mesh);
  }
  // v24: части модели с одним скелетом (или без него), одним положением и без текстур — в один меш; цвет части уходит в
  // цвет вершин (_restyle берёт его вместо цвета материала — вид тот же). Вызовов отрисовки и обновлений скелета меньше:
  // у косяка 16 рыб × 3 части = 48 → 16, у дельфина 2 → 1
  _mergeParts(root) {
    root.updateMatrixWorld(true); const groups = new Map();
    root.traverse(m => { if (!m.isMesh || Array.isArray(m.material) || m.material.map || m.morphTargetInfluences) return;
      const k = (m.skeleton?.uuid || '-') + '|' + m.matrixWorld.elements.map(x => x.toFixed(5)).join(',') + '|' + m.material.transparent + m.material.opacity + m.material.side;
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
    const KEEP = ['position', 'normal', 'color', 'skinIndex', 'skinWeight'];
    for (const ms of groups.values()) {
      if (ms.length < 2) continue;
      const gs = ms.map(m => { const g = m.geometry.clone(), n = g.attributes.position.count, c = m.material.color.clone().convertLinearToSRGB(), old = g.attributes.color, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([c.r * (old ? old.getX(i) : 1), c.g * (old ? old.getY(i) : 1), c.b * (old ? old.getZ(i) : 1)], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (!g.attributes.normal) g.computeVertexNormals();
        for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
        for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
        return g; });
      const geo = mergeGeometries(gs.every(g => g.index) ? gs : gs.map(g => g.index ? g.toNonIndexed() : g)); if (!geo) continue;
      const a = ms[0], mat = a.material.clone(); mat.color.setRGB(1, 1, 1);
      const mesh = a.isSkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
      mesh.name = a.name; mesh.position.copy(a.position); mesh.quaternion.copy(a.quaternion); mesh.scale.copy(a.scale); a.parent.add(mesh);
      if (a.isSkinnedMesh) mesh.bind(a.skeleton, a.bindMatrix);
      for (const m of ms) m.removeFromParent();
    }
  }
  _prepModel(n, g) {
    const A = this.assets;
    // size — длина по самой длинной горизонтальной оси; yaw — поворот, чтобы голова смотрела в +z; base — низ на 0 (стоящие)
    // ponytail: животные крупнее реального (дельфин 5 м) — иначе рядом с 60-метровым островом их не разглядеть
    const spec = { dolphin: [5, 0], whale: [20, 0], fish: [1.2, 0], shark: [7, 0], orca: [9, 0], gull: [3.4, -Math.PI / 2], gull_dark: [3.2, -Math.PI / 2],
      // v12: направление проверено ВИДОМ СВЕРХУ (web/_qa_models.html?m=...&top=1): лев, черепаха и косатка смотрят в +z
      // сами (в v11 по виду сбоку решили иначе: лев плыл боком, черепаха и косатка — задом); креветка — в −x, чайка — в +x
      pelican: [3.2, 0, 1], sea_lion: [3.8, 0, 1], palm_1: [0, 0, 1], palm_2: [0, 0, 1], palm_3: [0, 0, 1],
      jellyfish: [2.4, 0], octopus: [2.8, 0, 1], starfish: [1.5, 0, 1], crab: [1.3, 0, 1], turtle: [2.8, 0], shrimp: [.9, Math.PI / 2], stingray: [4.5, 0] };
    // мягкий тон вида, цвет контура, доля исходной раскраски
    const TONE = { dolphin: ['#a9bccb', '#bdf2ff', .2], whale: ['#8a90b8', '#aab8ff', .2], fish: ['#e6b894', '#ffd9a8', .3],
      shark: ['#9aa9b6', '#cfe8ff', .25], orca: ['#dfe7ec', '#bfe0ff', .5],
      gull: ['#f2f2ee', '#ffffff', .35], gull_dark: ['#6a7480', '#b8d4e8', .3], pelican: ['#cdb299', '#ffe2c0', .3], sea_lion: ['#9a8474', '#ffcf9c', .2],
      palm_1: ['#b4bf9c', '#dfe8cc', .45], palm_2: ['#b4bf9c', '#dfe8cc', .45], palm_3: ['#b4bf9c', '#dfe8cc', .45],
      jellyfish: ['#ff8ad8', '#ffc6f2', .7], octopus: ['#e58a7c', '#ffc9b5', .5], starfish: ['#f0a27e', '#ffd7bd', .55], crab: ['#e5805f', '#ffc8a8', .5],
      turtle: ['#a6c48f', '#e4ffcf', .45], shrimp: ['#ffb9aa', '#ffe6de', .45], stingray: ['#8ea4bc', '#cfe7ff', .3] };
    {
      const root = g.scene;
      if (n === 'shrimp') this._mergeModel(root); else if (n !== 'jellyfish') this._mergeParts(root);   // у медузы свечение берётся из цвета части
      this._restyle(root, ...TONE[n]);
      // медуза — неоновая: светится сама своим цветом и полупрозрачна; рисуется до воды (renderOrder), вода её подкрашивает
      // креветки роя — тоже с неоновым свечением (иначе мелкие бледные фигурки у дна не разглядеть)
      if (n === 'shrimp') root.traverse(m => { if (m.isMesh) for (const mt of [m.material].flat()) mt.emissive.set(0xff7a6a).multiplyScalar(.55); });
      // v24: изнанка — отдельная копия меша (рисуется раньше лица). Прозрачное двустороннее three.js рисует в два прохода и
      // каждый раз заново выбирает шейдер (needsUpdate) — на телефоне это было дороже всех остальных зверей вместе
      if (n === 'jellyfish') { const ms = []; root.traverse(m => m.isMesh && ms.push(m)); for (const m of ms) { m.renderOrder = -.8;
        for (const mt of [m.material].flat()) { mt.emissive.set(0xff3fc0).lerp(mt.color, .25).multiplyScalar(.7); mt.transparent = true; mt.opacity = .82; mt.depthWrite = false; mt.side = THREE.FrontSide; }
        const back = new THREE.Mesh(m.geometry, [m.material].flat().map(mt => { const b = mt.clone(); b.onBeforeCompile = mt.onBeforeCompile; b.customProgramCacheKey = mt.customProgramCacheKey; b.side = THREE.BackSide; return b; }));
        if (!Array.isArray(m.material)) back.material = back.material[0];
        back.renderOrder = -.801; m.add(back); } }
      if (n.startsWith('gull')) {   // переносим геометрию в систему модели: крылья вдоль z, изгиб в _makeFlap считается в ней
        root.updateMatrixWorld(true); const ms = []; root.traverse(m => m.isMesh && ms.push(m));
        for (const m of ms) { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.removeFromParent(); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); root.add(m); }
      }
      root.rotation.y = spec[n][1]; root.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(root, true), size = bb.getSize(new V3()), c = bb.getCenter(new V3());
      const s = spec[n][0] ? spec[n][0] / Math.max(size.x, size.z) : rnd(7, 9) / size.y;   // пальмы — по высоте
      const holder = new THREE.Group(); root.position.set(-c.x, spec[n][2] ? -bb.min.y : -c.y, -c.z);
      const inner = new THREE.Group(); inner.add(root); inner.scale.setScalar(s); holder.add(inner);
      holder.updateMatrixWorld(true);   // box — рамка в системе модели (голова +z), нужна процедурной анимации
      A[n] = { obj: holder, clips: g.animations, span: size.z * s, h: size.y * s, box: new THREE.Box3().setFromObject(holder, true) };
    }
  }
  // v22: фризы раз в несколько секунд (замер: qa/perf_profile.mjs) — сборка шейдеров посреди игры. Каждый вид зверя
  // при первом появлении и каждый эффект (круги на воде, брызги, дым, прыжок кузнечика) собирали шейдер, и кадр ждал
  // её (getProgramInfoLog — 0.35–1.5 с в программном рендере). Эффекты удаляют свой материал, когда гаснут; погас
  // последний — three.js выбрасывал и шейдер, и следующий всплеск собирал его заново (всплески — раз в 2–7 с).
  // Теперь все шейдеры собираются заранее, пока открыт экран входа (compileAsync — без ожидания, где браузер умеет
  // параллельную сборку), а образцы материалов (this.warm) живут всю игру — шейдеры больше не выбрасываются
  _warmUp() {
    const warm = this.warm = new THREE.Group(), at = new V3(0, -500, 0);
    const SP = ['seagull', 'tern', 'albatross', 'cormorant', 'pelican', 'dolphin', 'whale', 'shark', 'orca', 'sea_lion', 'sea_turtle',
      'shrimp_swarm', 'jellyfish', 'octopus', 'starfish', 'crab', 'stingray', 'fish_school'].filter(sp => !(this.lite && LAZY.has(sp)));
    SP.forEach((sp, i) => {
      const o = { id: -1 - i, sp, n: 0, seed: 1, t: 0, obj: new THREE.Group(), mixers: [], heading: 0 };
      this._attachModel(o);
      for (const f of o.fish || []) { this.scene.remove(f.obj); warm.add(f.obj); }
      for (const w of o.wings || []) w.visible = true;   // крылья пеликана на воде скрыты — образец рисуется с ними
      warm.add(o.obj);
    });
    const ship = { id: -99, sp: 'ship', obj: new THREE.Group() }; ship.obj.add(this._buildShip(ship)); warm.add(ship.obj);
    // образцы материалов эффектов — те же параметры, что в _ripple/_burst/_smoke/_hop/_flyingFish/_leap
    const pts = new THREE.BufferGeometry(); pts.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    warm.add(new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false })));
    warm.add(new THREE.Points(pts, new THREE.PointsMaterial({ color: 0xffffff, size: .6, transparent: true, opacity: .95, depthWrite: false, map: this.glowTex })));
    warm.add(new THREE.Points(pts, new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false, map: this.glowTex, opacity: 0 })));
    warm.add(new THREE.Points(pts, new THREE.PointsMaterial({ color: 0xc8e86a, size: .14, sizeAttenuation: true, transparent: true })));
    warm.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, .5), new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x2a4a5a, transparent: true, opacity: .75, side: THREE.DoubleSide, forceSinglePass: true })));
    const fish = this._clone('fish'); if (fish) warm.add(fish.obj);
    seededRandom(2311, () => { const k = this._hatchKit(), m = new THREE.InstancedMesh(k.geo, k.mat, 1); m.setColorAt(0, new THREE.Color(1, 1, 1)); warm.add(m); });   // v23: черепашата (и three.js берёт Math.random на id объектов)
    warm.traverse(n => { n.frustumCulled = false; });
    warm.position.copy(at); warm.updateMatrixWorld(true);
    // v24: частями по 4 образца с паузой — на слабом телефоне сборка всех ~30 шейдеров разом стояла секундами одним куском
    // (и вместе с распаковкой звука давала пик памяти). Сборка видит только видимое — части включаются по очереди
    const t0 = performance.now(), kids = warm.children.slice(), N = 4, ws = step('шейдеры'); let i = 0;
    const part = () => {
      if (i >= kids.length || this.lost) {
        for (const k of kids) k.visible = true; ws.done(i >= kids.length, this.lost ? 'контекст потерян' : '');
        if (new URLSearchParams(location.search).has('debug')) console.info(`[warm] шейдеры собраны за ${(performance.now() - t0).toFixed(0)} мс`);
        return;
      }
      kids.forEach((k, j) => { k.visible = j >= i && j < i + N; });
      const rt = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.rt);   // как в кадре: сцена рисуется в буфер this.rt
      const done = this.renderer.compileAsync(warm, this.camera, this.scene);
      this.renderer.setRenderTarget(rt);
      // без параллельной сборки (KHR_parallel_shader_compile) браузер доделывает шейдер при первой отрисовке — рисуем
      // образцы один раз в буфер 1×1 вместе со сценой (тот же свет и туман, значит те же шейдеры), пока открыт вход
      done.then(() => {
        const tiny = new THREE.WebGLRenderTarget(1, 1), prev = this.renderer.getRenderTarget();
        this.scene.add(warm); this.renderer.setRenderTarget(tiny); this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(prev); this.scene.remove(warm); tiny.dispose();
      }).catch(e => console.warn('прогрев шейдеров:', e)).then(() => { i += N; ws.note(`${Math.min(i, kids.length)} из ${kids.length}`); setTimeout(part, 16); });
    };
    part();
  }
  _clone(name) {
    const a = this.assets?.[name]; if (!a) return null;
    const obj = SkeletonUtils.clone(a.obj);
    let mixer = null;
    // клип плавания, если есть (у акулы первым идёт не он)
    // v15: именно «Swim» — у акулы первым идёт «Swim_Bite», и она всё время плыла с открытой пастью
    const clip = a.clips.find(c => /(^|\|)swim$/i.test(c.name)) || a.clips.find(c => /swim/i.test(c.name)) || a.clips[0];
    if (clip) { mixer = new THREE.AnimationMixer(obj); const act = mixer.clipAction(clip); act.play(); act.time = Math.random() * clip.duration; }
    return { obj, mixer };
  }

  // v24: пальмы одного вида — одна InstancedMesh на часть модели (было 16 копий — 16 вызовов отрисовки); качание —
  // матрица экземпляра каждый кадр (_swayPalms). Точечная фактура считает масштаб с матрицей экземпляра — как у копии
  _plantPalms() {
    const pts = this.grassPts.filter(p => p.y > 1.3 && p.y < 4.5), by = [[], [], []];
    for (let i = 0; i < 16 && pts.length; i++) {
      const p = pts.splice((Math.random() * pts.length) | 0, 1)[0];
      by[i % 3].push({ p: p.clone().setY(p.y - .2), ry: Math.random() * 6.28, sc: rnd(.8, 1.15), seed: Math.random() * 10 });
    }
    this.palms = [];
    by.forEach((list, k) => {
      const a = this.assets[`palm_${k + 1}`]; if (!a || !list.length) return;
      a.obj.updateMatrixWorld(true);
      a.obj.traverse(n => {
        if (!n.isMesh) return;
        const mat = [n.material].flat().map(mt => this._hook(Object.assign(mt.clone(), { onBeforeCompile: mt.onBeforeCompile, customProgramCacheKey: mt.customProgramCacheKey }),
          sh => { sh.vertexShader = sh.vertexShader.replace('vSP = transformed * length(modelMatrix[0].xyz);', 'vSP = transformed * length((modelMatrix * instanceMatrix)[0].xyz);'); }, 'stInst'));
        const m = new THREE.InstancedMesh(n.geometry, Array.isArray(n.material) ? mat : mat[0], list.length);
        m.userData = { list, B: n.matrixWorld.clone() }; this._swayPalms(m, 0); m.computeBoundingSphere(); m.boundingSphere.radius += 2;
        this.scene.add(m); this.palms.push(m);
      });
    });
  }
  _swayPalms(m, t) {
    const { list, B } = m.userData, M = this._pM ||= new THREE.Matrix4(), E = this._pE ||= new THREE.Euler(), Q = this._pQ ||= new THREE.Quaternion(), S = this._pS ||= new V3();
    list.forEach((q, j) => { E.set(0, q.ry, Math.sin(t * (.8 + this.cur.wind) + q.seed) * (.01 + this.cur.wind * .03)); M.compose(q.p, Q.setFromEuler(E), S.setScalar(q.sc)).multiply(B); m.setMatrixAt(j, M); });
    m.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ данные
  onState(m) {
    Object.assign(this.tgt, {
      tod: m.time_of_day, daylight: m.daylight, weather: m.weather, wind: m.wind_speed, wave: m.wave_height,
      temp: m.temperature, tension: m.tension, fog: m.fog_active ? m.fog : 0,
      rain: m.rain_active ? clamp((m.rain - .3) / .5) : 0,   // капли — только когда дождь объявлен (раньше с 0.4 — «дождь» шёл куда чаще журнала)
    });
    if (!this.snapped) { this.snapped = true; Object.assign(this.cur, this.tgt); }
    this.weatherLabel = m.weather_label + (m.rain_active ? ' · дождь' : '') + (m.fog_active ? ' · туман' : '');
    this.timeLabel = m.time;
    this._syncAgents(m.agents || []);
  }
  onEvent(e) {
    this._addLog(e); if (VOICES.has(e.type)) this.recent.push(performance.now());
    const o = this.agents.get(e.agent);
    const pos = o ? o.obj.position.clone() : this.W(e.panorama * 2 - 1, e.distance ?? .5, 0);
    if (e.type === 'thunder' || e.type === 'storm_start') this.flashV = 1;
    if (o && CRITTER_SP.has(o.sp) && e.act && !['arrive', 'leave', 'back', 'hide', 'flee', 'eat'].includes(e.act)) o.act = { code: e.act, t: 0 };
    if (o?.sp === 'pelican' && e.act === 'catch') o.spill = 2.5;   // сливает воду из клюва
    if (e.type === 'jump_splash' && o?.sp === 'whale') {   // v14: кит выпрыгнул во весь рост — огромный всплеск при падении
      o.jump = 3.2;
      setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 90, 9); this._burst(p, 0xdff4ff, 40, 5); this._ripple(p, 9); setTimeout(() => this._ripple(p, 14, 3), 300); }, 2800);
    }
    if (e.type === 'jump_splash' && (o?.sp === 'dolphin' || o?.sp === 'orca')) { o.jump = o.sp === 'orca' ? 1.6 : 1.3; this._ripple(pos.clone().setY(.05), o.sp === 'orca' ? 5 : 3); setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._splash(p, o.sp === 'orca' ? 1.4 : 1); }, o.sp === 'orca' ? 1450 : 1150); }
    if (e.type === 'dive_splash' && o?.sp === 'sea_lion') o.plop = true;   // брызги — когда он на самом деле войдёт в воду
    else if (e.type === 'dive_splash' && o?.sp === 'whale' && e.act === 'pecslap') {   // v19: шлепок грудным плавником — сбоку
      o.pec = 2.2;
      setTimeout(() => { const p = o.obj.position.clone().add(new V3(Math.cos(o.heading) * 6, 0, -Math.sin(o.heading) * 6)).setY(.05); this._burst(p, 0xffffff, 40, 6); this._ripple(p, 5); }, 1100);
    } else if (e.type === 'dive_splash' && o?.sp === 'whale') {   // шлепок хвостом: хвост поднимается и бьёт по воде
      o.slap = 2.2;
      setTimeout(() => { const p = o.obj.position.clone().add(new V3(-Math.sin(o.heading) * 9, 0, -Math.cos(o.heading) * 9)).setY(.05); this._burst(p, 0xffffff, 50, 7); this._ripple(p, 6); }, 1300);
    } else if (e.type === 'dive_splash' && o?.sp === 'pelican') {   // пеликан: взлёт, пике камнем, вход в воду
      o.dive = 2.6; o.diveP = deepSpot(o.obj.position.clone(), -1.2, 2);   // v19: только в воду (нырял на лету в сушу)
      setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 34, 6.5); this._burst(p, 0xdff4ff, 16, 3.5); this._ripple(p, 3.5); }, 2050);
    }
    else if (e.type === 'dive_splash' && o?.sp === 'tern' && e.act === 'hover') {   // v19: крачка зависает, потом ныряет
      o.hover = 1.2; o.hoverP = deepSpot(o.obj.position.clone(), -1, 1.5).setY(4.5); o.diveP = o.hoverP.clone();
      setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 22, 5); this._ripple(p, 2.5); }, 1900);
    }
    else if (e.type === 'dive_splash' && o) { if (BIRDS.has(o.sp)) { o.dive = 1.2; o.diveP = deepSpot(o.obj.position.clone(), -1, 1.5); } setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 28, 6); this._burst(p, 0xdff4ff, 14, 3.5); this._ripple(p, 3); }, BIRDS.has(o.sp) ? 700 : 100); }
    if (e.type === 'flying_fish') this._flyingFish(this.W(e.panorama * 2 - 1, e.distance ?? .5, 0));
    if (e.type === 'whale_arrive' || e.type === 'whale_surface') setTimeout(() => this._spout(o), 1500);
    if (e.type === 'whale_blow') setTimeout(() => this._spout(o), 150);   // v14: серия выдохов на поверхности
    if (e.type === 'whale_dive' && o) o.fluke = 3;
    // v19: кит окружил косяк кольцом пузырей и выныривает с раскрытой пастью; косатка выглядывает из воды; скат роется в песке
    if (e.type === 'whale_lunge' && o) {
      const c = o.obj.position.clone().setY(.06); this._ripple(c, 12, 2.5); setTimeout(() => this._ripple(c, 9, 2), 400);
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832; this._burst(c.clone().add(new V3(Math.cos(a) * 9, 0, Math.sin(a) * 9)), 0xe8fbff, 6, 1.5, true); }
      setTimeout(() => { o.lunge = 3; setTimeout(() => { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 60, 7); this._ripple(p, 8); }, 1400); }, 600);
    }
    if (e.type === 'orca_spyhop' && o) o.spy = 4;
    if (o?.sp === 'stingray' && e.act === 'feed') this._burst(o.obj.position.clone(), 0xd8c7a0, 18, 1.2, true);
    if (o?.sp === 'shrimp_swarm' && e.act === 'flee') o.fleeT = 6;   // рой прыснул врассыпную
    if (e.type === 'octopus_leave' && o && e.text.includes('чернила')) this._burst(o.obj.position.clone(), 0x2a1f33, 40, 2.5);   // облако чернил
    // акула бросилась на косяк: всплеск и круги; мелкая рыба вокруг бросается врассыпную
    if (e.type === 'shark_hunt' && o) { const p = o.obj.position.clone().setY(.05); this._burst(p, 0xffffff, 18, 6); this._ripple(p, 5); this.panicAt = p; this.panicT = 6; this._sharkAct(o, 'bite', 2.5); }
    if (e.type === 'shark_flee' && o) this._sharkAct(o, 'fast', 6);
  }
  // где событие звучит для слушателя: сторона и дальность — от реального места на экране относительно
  // камеры (звук синхронен картинке и при вращении камеры); delay — всплеск нырка звучит, когда птица
  // на экране касается воды, а не в момент решения нырнуть
  spatialAt(pos) {
    const v = pos.clone().applyMatrix4(this.camera.matrixWorldInverse);
    return { panorama: clamp(.5 + v.x / (Math.abs(v.z) + 12) * .8), distance: clamp((v.length() - 25) / 140) };
  }
  spatial(e) {
    const o = this.agents.get(e.agent);
    const pos = o ? o.obj.position.clone() : this.W((e.panorama ?? .5) * 2 - 1, e.distance ?? .5, 0);
    const out = this.spatialAt(pos);
    if (e.type === 'dive_splash' && o && BIRDS.has(o.sp)) out.delay = .7;
    if (e.type === 'dive_splash' && o?.sp === 'sea_lion') out.delay = 1.2;   // пока доползёт до воды
    if (e.type === 'whale_arrive' || e.type === 'whale_surface') out.delay = 1.5;   // выдох — вместе с фонтаном
    if (o?.sp === 'whale' && e.type === 'jump_splash') out.delay = 2.8;   // всплеск — когда кит упадёт в воду
    if (o?.sp === 'whale' && e.type === 'dive_splash') out.delay = 1.3;   // шлепок — когда хвост коснётся воды
    if (o?.sp === 'pelican' && e.type === 'dive_splash') out.delay = 2.05;   // пеликан долетит до воды
    if (o?.sp === 'tern' && e.type === 'dive_splash' && e.act === 'hover') out.delay = 1.9;   // v19: сначала зависает
    if (e.type === 'whale_lunge') out.delay = 2.0;   // всплеск — когда кит вынырнет из кольца пузырей
    return out;
  }
  _syncAgents(list) {
    const seen = new Set();
    // кто есть в самом начале — уже на месте; новые — приплывают издалека. Флаг только на непустом списке:
    // в первом кадре симуляция ещё не создала существ, и иначе ВСЕ стартовали в дымке за 200 м
    const far = !!this.synced; if (list.length) this.synced = true;
    for (const a of list) {
      seen.add(a.id); let o = this.agents.get(a.id);
      if (!o) { o = this._makeAgent(a, far); this.agents.set(a.id, o); }
      o.tx = a.x; o.td = a.dist; o.st = a.st; o.site = a.site ?? -1; o.rel = a.rel || 0; o.rk = a.rk || ''; if (a.cnt) o.cnt = a.cnt;
    }
    // ушедшие из симуляции — не исчезают, а уплывают/улетают в дымку и только там удаляются
    for (const o of this.agents.values()) if (!seen.has(o.id) && !o.gone) {
      if (o.sp === 'ship') { this._removeAgent(o); continue; }   // пароход к этому времени уже растаял в дымке
      o.gone = true; o.goneT = 0;
      if (STATIC.has(o.sp) || o.flat) o.away = o.anchor.clone().setY(o.anchor.y - 2.5);   // прячется в песок/расщелину на месте (медузу на песке смывает)
      else { const h = o.anchor.clone().setY(0); o.away = h.multiplyScalar(240 / (h.length() || 1)).setY(o.anchor.y); }
    }
    this.census = {}; for (const a of list) this.census[a.sp] = (this.census[a.sp] || 0) + (a.cnt || 1);   // v23: выводок черепашат — по числу малышей
  }

  // ------------------------------------------------------------------ существа
  _makeAgent(a, far = false) {
    const o = { id: a.id, sp: a.sp, n: a.n, x: a.x, d: a.dist, tx: a.x, td: a.dist, st: a.st, site: a.site ?? -1, rel: a.rel || 0, rk: a.rk || '', seed: Math.random() * 10, t: 0,
      jump: 0, dive: 0, fluke: 0, heading: Math.random() * 6.28, obj: new THREE.Group(), mixers: [] };
    const others = [...this.agents.values()].filter(q => q.sp === a.sp && !q.gone);
    if (a.sp === 'dolphin' || a.sp === 'orca') {   // стая держится вместе и плывёт строем (v13: общий такт, у каждого своё место)
      if (!others.length) this.podA = { ...this.podA, [a.sp]: Math.random() * 6.2832 }, this.podPh = { ...this.podPh, [a.sp]: Math.random() * 6.2832 };
      o.ang0 = this.podA[a.sp]; o.slot = 0; while (others.some(q => q.slot === o.slot)) o.slot++;   // v18: своё место в строю
    } else o.ang0 = Math.random() * 6.2832;
    if (a.sp === 'ship') {   // пароход (v13): случайная точка горизонта вне сектора дальнего острова, идёт от него прочь
      const isl = Math.atan2(-705, -910); let th, dth;
      do { th = Math.random() * 6.2832; dth = Math.atan2(Math.sin(th - isl), Math.cos(th - isl)); } while (Math.abs(dth) < .75);
      o.th0 = th; o.thDir = Math.sign(dth); o.model = this._buildShip(o); o.obj.add(o.model);
      if (!far) o.fade = 1;   // уже был при загрузке страницы (и в QA ?spawn=ship) — сразу виден
    }
    o.anchor = this._goal(o);
    if (far && !STATIC.has(a.sp) && a.sp !== 'ship' && a.st !== 'stranded') {   // v21: медузу выносит волной — появляется на месте   // новые приходят из дымки: морские — из открытого моря (снаружи от своей цели), птицы — с любой стороны
      const y = o.anchor.y, out = o.anchor.clone().setY(0).normalize();
      const dir = BIRDS.has(a.sp) && a.sp !== 'pelican' ? new V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize()
        : out.applyAxisAngle(new V3(0, 1, 0), POD[a.sp] ? this.podPh[a.sp] % 1.4 - .7 : rnd(-.7, .7));   // v18: стая — вся с одной стороны
      o.anchor.addScaledVector(dir, 170).setY(y);
    }
    o.obj.position.copy(o.anchor);
    this.scene.add(o.obj);
    this._attachModel(o);
    return o;
  }
  _attachModel(o) {
    if (!this.assets || o.attached) return;
    if (LAZY.has(o.sp) && !this.assets[o.sp]) { if (this.lite && o.id >= 0) this._lazyModel(o.sp); return; }   // v24: «Лёгкое» — модель придёт при первом появлении
    const add = name => { const m = this._clone(name); if (!m) return null; o.obj.add(m.obj); if (m.mixer) o.mixers.push(m.mixer); return m.obj; };
    if (o.sp === 'fish_school') {
      o.fish = [];
      for (let i = 0; i < 16; i++) { const m = this._clone('fish'); if (!m) break; this.scene.add(m.obj); if (m.mixer) o.mixers.push(m.mixer);
        o.fish.push({ obj: m.obj, ph: Math.random() * 6.28, k: rnd(.5, 1), h: rnd(-1.6, -.5) }); }
      o.obj.userData.fish = o.fish;
    } else if (o.sp === 'seagull' || o.sp === 'tern' || o.sp === 'albatross') {
      o.model = add('gull'); if (o.model) o.model.scale.setScalar(o.sp === 'albatross' ? 1.9 : o.sp === 'tern' ? .75 : 1);
    } else if (o.sp === 'cormorant') o.model = add('gull_dark');
    else if (o.sp === 'pelican') o.model = add('pelican');
    else if (o.sp === 'dolphin') o.model = add('dolphin');
    else if (o.sp === 'whale') o.model = add('whale');
    else if (o.sp === 'shark') {
      o.model = add('shark');
      const mx = o.mixers[o.mixers.length - 1],   /* v21: без .at() — его нет в Safari до 15.4 */ cl = this.assets.shark?.clips || [], pick = re => cl.find(c => re.test(c.name));
      if (mx) o.acts = { swim: mx.existingAction(pick(/(^|\|)swim$/i)), bite: pick(/bite/i) && mx.clipAction(pick(/bite/i)), fast: pick(/fast/i) && mx.clipAction(pick(/fast/i)) };
    }
    else if (o.sp === 'orca') o.model = add('orca');
    else if (o.sp === 'sea_lion') o.model = add('sea_lion');
    else if (o.sp === 'sea_turtle') o.model = add('turtle');
    else if (o.sp === 'shrimp_swarm') {   // рой: дюжина креветок вокруг общей точки
      // v24: одна InstancedMesh на рой (было 12 копий модели — 12 вызовов отрисовки на рой). Вид тот же: креветки и раньше
      // были одной формы и шевелились в такт (общие o.wig). Масштаб модели — у самой InstancedMesh: точечная фактура
      // берёт его из modelMatrix, как у копии модели
      const m = add('shrimp'); let mesh = null; m?.traverse(n => { if (n.isMesh) mesh ||= n; });
      if (mesh) {
        this._wiggle(o, 'shrimp', 'shrimp', m); m.updateMatrixWorld(true);
        const sc = this.assets.shrimp.obj.children[0].scale.x, rest = m.matrixWorld.clone().invert().multiply(mesh.matrixWorld).premultiply(new THREE.Matrix4().makeScale(1 / sc, 1 / sc, 1 / sc));
        const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, 12); inst.scale.setScalar(sc);
        inst.boundingSphere = new THREE.Sphere(new V3(), 4.5 / sc);   // весь рой (с разлётом при испуге) — для отсечения вне кадра
        m.removeFromParent(); o.obj.add(inst);
        o.shrimpI = { inst, rest, sc };
        o.shrimp = Array.from({ length: 12 }, () => ({ p: new V3(), ry: 0, off: new V3(rnd(-1.3, 1.3), rnd(-.4, .4), rnd(-1.3, 1.3)), ph: Math.random() * 6.28 }));
      }
    } else if (['jellyfish', 'octopus', 'starfish', 'crab', 'stingray'].includes(o.sp)) o.model = add(o.sp);
    if (o.model && BIRDS.has(o.sp) && o.sp !== 'pelican') this._makeFlap(o);
    if (o.model && WIG[o.sp]) this._wiggle(o, ...WIG[o.sp]);
    if (o.model && o.sp === 'pelican') this._pelicanWings(o);
    if (o.sp === 'jellyfish') {   // ореол неоновой медузы (ночью ярче, вспыхивает на каждом сжатии купола)
      o.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff7ad8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      o.halo.renderOrder = -.8; o.halo.scale.setScalar(5); o.obj.add(o.halo);
    }
    o.attached = true;
  }

  // процедурная анимация тела (v12) для моделей без своих клипов (косатка, лев, черепаха, пеликан, медуза): вершины
  // смещаются в шейдере в системе координат модели (голова +z, верх +y); u — доля длины от хвоста (0) к голове (1),
  // yn — доля высоты. Материалы у каждой особи свои (у каждой своя фаза). Режимы: tail — хвост вверх-вниз, lion — волна
  // по телу и ласты, flip — гребки ластами, head — наклон шеи и головы (uWB — угол), jelly — сжатие купола и щупальца.
  // uWT — фаза, uWA — сила движения, uWB — доп. параметр; ставит _stepAgent
  _wiggle(o, name, mode, H = o.model) {
    const box = this.assets[name].box; H.updateMatrixWorld(true);
    const inv = H.matrixWorld.clone().invert();
    o.wig ||= { t: { value: Math.random() * 6.28 }, a: { value: 0 }, b: { value: 0 } };
    const uBox = { value: new THREE.Vector4(box.min.z, box.max.z, Math.max(-box.min.x, box.max.x), 0) }, uY = { value: new THREE.Vector2(box.min.y, box.max.y) };
    const GL = {
      tail: `float w = pow(1. - u, 2.2); d.y = sin(uWT - (1. - u) * 2.6) * w * L * .08 * uWA;`,
      lion: `float w = pow(1. - u, 1.8); d.y = sin(uWT - (1. - u) * 2.2) * w * L * .07 * uWA;
             float s = smoothstep(.4, .95, abs(hp.x) / uBox.z) * smoothstep(.3, .6, u); d.y += s * sin(uWT * .5) * uBox.z * .3 * uWA;
             d.x += smoothstep(.75, 1., u) * smoothstep(.5, .9, yn) * sin(uWB) * L * .06;`,
      flip: `float s = smoothstep(.35, .95, abs(hp.x) / uBox.z), fr = step(.5, u), ph = uWT + (1. - fr) * 1.7;
             d.y = s * sin(ph) * uBox.z * mix(.2, .5, fr) * uWA; d.z = s * cos(ph) * uBox.z * mix(.08, .22, fr) * uWA;
             d.x += smoothstep(.85, 1., u) * sin(uWT * .21) * L * .04;`,
      head: `float hr = smoothstep(.55, .8, u) * smoothstep(.45, .75, yn);
             vec3 pv = vec3(0., mix(uY.x, uY.y, .5), mix(uBox.x, uBox.y, .55)), q = hp - pv; float an = uWB * 1.3 * hr, c = cos(an), sn = sin(an);
             d.yz += vec2(q.y * c - q.z * sn, q.y * sn + q.z * c) - q.yz; d.x += hr * sin(uWT * .7) * L * .05 * uWA;`,
      jelly: `float bell = smoothstep(.5, .8, yn), tip = clamp(1. - yn / .55, 0., 1.);
             d.xz -= hp.xz * .24 * uWA * bell; d.y += (uY.y - uY.x) * .06 * uWA * bell;
             d.x += sin(uWT - tip * 4.) * tip * tip * uBox.z * .45 * (1. - uWB); d.z += cos(uWT * .8 - tip * 3.5) * tip * tip * uBox.z * .45 * (1. - uWB);
             d.xz -= hp.xz * tip * .65 * uWB;`,
      // v13: краб — ноги по бокам перебирают (через одну), клешни спереди пощёлкивают; звезда — лучи медленно изгибаются;
      // осьминог — щупальца волнами; креветка — бьёт хвостом, шевелит усами
      crab: `float s = smoothstep(.45, .9, abs(hp.x) / uBox.z) * smoothstep(.6, .1, yn);
             d.y += s * max(0., sin(uWT + sign(hp.x) * 1.57 + hp.z * 6. / L)) * (uY.y - uY.x) * .45 * uWA;
             d.y += smoothstep(.72, .95, u) * smoothstep(.2, .6, abs(hp.x) / uBox.z) * max(0., sin(uWB)) * (uY.y - uY.x) * .5;`,
      star: `float r = length(hp.xz) / uBox.z; d.y += smoothstep(.35, 1., r) * sin(uWT + hp.x * 4. / uBox.z + hp.z * 3. / uBox.z) * uBox.z * .07 * uWA;`,
      octo: `float tip = clamp(1. - yn / .5, 0., 1.), an = atan(hp.z, hp.x);
             d.x += sin(uWT + an * 3. - tip * 3.) * tip * tip * uBox.z * .22 * uWA; d.z += cos(uWT * .8 + an * 2. - tip * 2.5) * tip * tip * uBox.z * .22 * uWA;
             d.y += sin(uWT * 1.3 + an * 4.) * tip * (uY.y - uY.x) * .15 * uWA;`,
      shrimp: `float tl = pow(clamp((.45 - u) / .45, 0., 1.), 1.5); d.y += sin(uWT) * tl * L * .12 * uWA;
               d.x += smoothstep(.85, 1., u) * sin(uWT * 1.7) * L * .05;`,
    }[mode];
    H.traverse(n => {
      if (!n.isMesh) return;
      const toH = { value: inv.clone().multiply(n.matrixWorld) }, fromH = { value: new THREE.Matrix3().setFromMatrix4(toH.value.clone().invert()) };
      const mk = src => {   // clone() не копирует хуки тона/фактуры — переносим сами (см. CLAUDE.md)
        const m = src.clone(); m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey;
        return this._hook(m, sh => {
          Object.assign(sh.uniforms, { uToH: toH, uFromH: fromH, uWT: o.wig.t, uWA: o.wig.a, uWB: o.wig.b, uBox, uY });
          sh.vertexShader = 'uniform mat4 uToH; uniform mat3 uFromH; uniform float uWT, uWA, uWB; uniform vec4 uBox; uniform vec2 uY;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
            { vec3 hp = (uToH * vec4(transformed, 1.)).xyz; float L = uBox.y - uBox.x, u = clamp((hp.z - uBox.x) / L, 0., 1.), yn = clamp((hp.y - uY.x) / (uY.y - uY.x), 0., 1.);
              vec3 d = vec3(0.); ${GL} transformed += uFromH * d; }`);
        }, 'wig' + mode);
      };
      n.material = Array.isArray(n.material) ? n.material.map(mk) : mk(n.material);
      (o.mats ||= []).push(...[n.material].flat());
    });
  }
  // крылья пеликана (v12): у модели (и у всех пеликанов на poly.pizza) крылья сложены — для полёта свои плоские крылья
  // в тон оперения, на воде сложены (скрыты); взмах — поворот вокруг плеча, см. _stepAgent
  _pelicanWings(o) {
    const box = this.assets.pelican.box, L = box.max.z - box.min.z, span = L * 1.15, ch = L * .32, v = (x, y) => new THREE.Vector2(x, y);
    const g = new THREE.ShapeGeometry(new THREE.Shape([v(0, -ch * .5), v(span * .55, -ch * .45), v(span, -ch * .15), v(span * .92, ch * .1), v(span * .5, ch * .35), v(0, ch * .5)]));
    g.rotateX(Math.PI / 2);   // в плоскость XZ: размах вдоль +x, хорда вдоль z
    const mat = this._stippled(new THREE.MeshLambertMaterial({ color: 0xcdb299, emissive: 0x2a2018, side: THREE.DoubleSide, flatShading: true }), true, 7);
    o.wings = [-1, 1].map(sg => {
      const piv = new THREE.Group(), w = new THREE.Mesh(g, mat); w.scale.x = sg; piv.add(w); piv.visible = false;
      piv.position.set(sg * box.max.x * .6, lerp(box.min.y, box.max.y, .45), lerp(box.min.z, box.max.z, .5)); o.model.add(piv); return piv;
    });
  }
  // взмахи крыльев: у модели чайки нет анимации — сгибаем вершины крыльев в шейдере (дальше от тела — сильнее)
  _makeFlap(o) {
    o.flap = { value: 0 }; o.fold = { value: 0 };   // v21: fold 0..1 — крылья сложены (птица на воде/на земле)
    o.model.traverse(n => {
      if (!n.isMesh) return;
      n.geometry.computeBoundingBox(); const bb = n.geometry.boundingBox, half = { value: Math.max(-bb.min.z, bb.max.z) };
      const src = n.material;   // clone() не копирует хуки тона/фактуры — переносим их сами
      n.material = src.clone(); n.material.onBeforeCompile = src.onBeforeCompile; n.material.customProgramCacheKey = src.customProgramCacheKey;
      this._hook(n.material, sh => {
        sh.uniforms.uFlap = o.flap; sh.uniforms.uHalf = half; sh.uniforms.uFold = o.fold;
        sh.vertexShader = 'uniform float uFlap, uHalf, uFold;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float wf = clamp((abs(transformed.z) - .15 * uHalf) / (.85 * uHalf), 0., 1.); transformed.y += wf * wf * uFlap * uHalf;' +
          '\n float az = abs(transformed.z), wb = .15 * uHalf; if (az > wb) transformed.z = sign(transformed.z) * (wb + (az - wb) * (1. - .78 * uFold));');
      }, 'flap');
    });
  }

  // цель с учётом глубины (v12): для крупных пловцов — ближайшее место, где под всем их кругом достаточно глубоко.
  // Считается заново, только когда «сырая» цель сдвинулась (deepSpot — десятки проб рельефа)
  _goal(o, dt = 0) {
    if (o.gone) return o.away;
    const t = this._targetPos(POD[o.sp] ? this._podLead(o) : o), rad = ORB[o.sp];
    if (rad === undefined || landed(o)) return t;
    if (!o._gRaw || o._gRaw.distanceToSquared(t) > .25) { o._gRaw = t.clone(); o._gOut = deepSpot(t.clone(), SWIM_DEPTH[o.sp], rad); }
    // v13: сглаживаем — deepSpot шагает по 3 м, и цель у мели скакала (дельфинов «дёргало в некоторых местах»)
    if (!o._gSm || !dt) o._gSm = o._gOut.clone(); else o._gSm.lerp(o._gOut, 1 - Math.exp(-dt * .8));
    return o._gSm.clone();
  }

  // пароход (v13): простые формы в стиле мира — корпус с красной ватерлинией, белые надстройки, две трубы с дымом, ночью
  // огоньки иллюминаторов и мачт. Стоит в дымке горизонта (как дальний остров), появляется и тает плавно (uK)
  // v14 в стиле мира: плавный корпус (нос клином, корма скруглена) в пастели палитры — шалфей с коралловой ватерлинией,
  // кремовые надстройки, трубы с полосой; точечная фактура и светящийся контур, как у животных; дым — облачка из точек
  _buildShip(o) {
    const g = new THREE.Group(), K = o.shipK = { value: 0 };
    const hook = sh => { Object.assign(sh.uniforms, { uHaze: this.uFarHaze, uK: K, uRimK: this.uRimK });
      sh.fragmentShader = 'uniform vec3 uHaze; uniform float uK, uRimK;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n totalEmissiveRadiance += vec3(1., .92, .8) * .35 * uRimK * pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.5);')
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(uHaze, mix(gl_FragColor.rgb, uHaze, .45), uK);\n#include <fog_fragment>'); };
    const mat = (c, vc = false) => this._hook(this._stippled(new THREE.MeshLambertMaterial({ color: c, vertexColors: vc, fog: false }), true, .25), hook, 'ship2' + vc);
    const part = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); g.add(m); return m; };
    const hs = new THREE.Shape(); hs.moveTo(-7, -42); hs.quadraticCurveTo(0, -49, 7, -42); hs.lineTo(7.5, 18); hs.quadraticCurveTo(7, 38, 0, 54); hs.quadraticCurveTo(-7, 38, -7.5, 18); hs.closePath();
    const hull = new THREE.ExtrudeGeometry(hs, { depth: 9, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1, bevelSegments: 2, curveSegments: 12 });
    hull.rotateX(Math.PI / 2); hull.translate(0, 7, 0);   // вид сверху → корпус: нос в +z, высота вверх, осадка ~3 м
    const HP = hull.attributes.position, hc = [];
    for (let i = 0; i < HP.count; i++) hc.push(...(HP.getY(i) < .9 ? rgb('#d9907f') : HP.getY(i) > 7.2 ? rgb('#d3dcd3') : rgb('#6a8a80')));   // ватерлиния, корпус, фальшборт
    hull.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    const hm = new THREE.Mesh(hull, mat(0xffffff, true)); g.add(hm);
    part(new THREE.BoxGeometry(11, 7, 34), 0xe9e2cf, 0, 11.5, -6);            // надстройка
    part(new THREE.BoxGeometry(12, 3.5, 9), 0xe9e2cf, 0, 16.7, 8);            // мостик
    part(new THREE.BoxGeometry(8, 3, 16), 0xe9e2cf, 0, 16.2, -14);            // верхняя палуба
    o.funnels = [];
    for (const z of [-6, -19]) {
      part(new THREE.CylinderGeometry(2.6, 2.9, 12, 14), 0xe7c07a, 0, 21, z); part(new THREE.CylinderGeometry(2.66, 2.66, 1.8, 14), 0x3f5e57, 0, 24.6, z);
      o.funnels.push(new V3(0, 28, z));
    }
    for (const z of [30, -38]) part(new THREE.CylinderGeometry(.3, .4, 20, 6), 0x92bfbd, 0, 17, z);   // мачты
    const L = []; for (let z = -40; z <= 30; z += 5) L.push(7.7, 3.6, z, -7.7, 3.6, z); L.push(0, 26.5, 30, 0, 26.5, -40);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    o.shipLights = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uPix: this.uPix, uA: { value: 0 } },
      vertexShader: `uniform float uPix; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(2., 1.8 * uPix / max(-mv.z, 1.)); }`,
      fragmentShader: `uniform float uA; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(1., .85, .55, uA * (1. - d * 2.)); }` });
    const lp = new THREE.Points(lg, o.shipLights); lp.frustumCulled = false; g.add(lp);
    return g;
  }
  _stepShip(o, dt, base) {
    const ob = o.obj, th = o.th0 + o.thDir * o.t * .0048;   // ~7 м/с по дуге 1450 м
    ob.position.set(base.x, Math.sin(o.t * .5) * .3, base.z);
    o.heading = Math.atan2(-Math.sin(th) * o.thDir, Math.cos(th) * o.thDir);
    ob.rotation.set(0, 0, 0); ob.rotateY(o.heading); ob.rotateZ(Math.sin(o.t * .4) * .012);
    o.fade = lerp(o.fade ?? 0, o.st === 'leave' ? 0 : 1, 1 - Math.exp(-dt * .15));   // проявляется и тает за ~10–20 с
    o.shipK.value = o.fade; o.shipLights.uniforms.uA.value = o.fade * (1 - (this._day ?? 1)) * .9;
    if ((o.smokeT = (o.smokeT ?? 0) - dt) <= 0 && o.fade > .1) {   // дым из труб, сносит ветром
      o.smokeT = .8; ob.updateMatrixWorld();
      for (const f of o.funnels) this._smoke(ob.localToWorld(f.clone()), o.fade);
    }
  }
  // дым парохода (v14): облачко из точек (как вся наша фактура) — поднимается, разрастается и тает, сносится ветром
  _smoke(p, k) {
    const n = 14, g = new THREE.BufferGeometry(), dir = [];
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0), 3));
    for (let i = 0; i < n; i++) dir.push(new V3(rnd(-1, 1), rnd(-.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(.3, 1)));
    const c = new THREE.Color(...this._palette().hor).lerp(new THREE.Color(.86, .87, .88), .55 * (this._day ?? 1));
    const m = new THREE.PointsMaterial({ color: c, size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false, map: this.glowTex, opacity: 0 });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; this.scene.add(pts);
    let t = 0; const life = 12, wind = 2 + this.cur.wind * 6, c0 = p.clone();
    this.fx.push(dt => {
      t += dt; const u = t / life, a = g.attributes.position; c0.y += 2.5 * dt; c0.x += wind * dt;
      dir.forEach((d, i) => a.setXYZ(i, c0.x + d.x * (2 + u * 14), c0.y + d.y * (2 + u * 8), c0.z + d.z * (2 + u * 14))); a.needsUpdate = true;
      m.size = 3.2 + u * 6; m.opacity = .55 * k * Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u);
      if (u >= 1) { this.scene.remove(pts); g.dispose(); m.dispose(); return false; } return true;
    });
  }

  // v19: куда плыть сейчас — прямо к цели, если путь глубокий, иначе к следующей точке маршрута A* (navPath). Проверка
  // пути и поиск — раз в секунду (пробы рельефа недешёвы)
  _via(o, tgt, dt) {
    const p = o.anchor;
    if ((o.navT = (o.navT ?? Math.random()) - dt) <= 0) {
      o.navT = 1;
      const need = SWIM_DEPTH[o.sp], rad = ORB[o.sp], d = Math.hypot(tgt.x - p.x, tgt.z - p.z), n = Math.ceil(d / NAV_C);
      const L = POD[o.sp] ? this._podLead(o) : o;
      if (L !== o) o.path = L.path ? L.path.map(q => q.clone()) : null;   // стая идёт маршрутом вожака (свои маршруты расходились)
      else {
        let clear = true; for (let i = 1; i < n && clear; i++) clear = shoal(lerp(p.x, tgt.x, i / n), lerp(p.z, tgt.z, i / n), rad, need) === 0;
        o.path = clear ? null : navPath(p, tgt, need, rad);
      }
    }
    while (o.path?.length && Math.hypot(o.path[0].x - p.x, o.path[0].z - p.z) < NAV_C) o.path.shift();
    return o.path?.length ? new V3(o.path[0].x, tgt.y, o.path[0].z) : tgt;
  }
  // вожак стаи (v18): старший из оставшихся — вся стая идёт к его цели, а не каждый к своей
  _podLead(o) { let L = o; for (const q of this.agents.values()) if (q.sp === o.sp && !q.gone && q.id < L.id) L = q; return L; }

  // куда существо стремится по данным симуляции
  // Угол вокруг острова: у каждого существа свой (ang0) + медленный дрейф по x из симуляции — раньше угол брался
  // только из x (±2.7 рад), и все новые сходились в один сектор перед камерой («бегут в одну точку»).
  _targetPos(o, depth = 0) {
    // v19: связь из симуляции — к кому держится ('to'), от кого уходит ('from'), за кем летит цепочкой ('flock').
    // Раньше у каждого зверя был свой угол вокруг острова: «акула у косяка» в журнале — на экране по разные стороны
    const q = !depth && o.rel && !(o.sp === 'sea_lion' && o.st !== 'away' && o.st !== 'raft') && this.agents.get(o.rel);
    if (q && !q.gone && q !== o) {
      const own = this._targetPos(o, 1);
      if (o.rk === 'flock') {   // пеликаны: ведомые — в линию за ведущим, по касательной к его кругу
        const t = this._targetPos(q, 1), L = Math.hypot(t.x, t.z) || 1, k = (o.id - q.id) * 5;
        return t.add(new V3(t.z / L * k, 0, -t.x / L * k)).setY(own.y);
      }
      const qp = (q.fish?.length || POD[q.sp] || q.sp === 'whale' ? q.anchor : q.obj.position).clone();
      if (o.sp === 'sea_lion' && Math.hypot(qp.x - own.x, qp.z - own.z) > 60) return own;   // v19: далеко от своего берега не уплывает (плыл домой через остров)
      if (o.rk === 'from') {
        const dx = own.x - qp.x, dz = own.z - qp.z, d = Math.hypot(dx, dz) || 1;
        return d >= FLEE_R ? own : new V3(qp.x + dx / d * FLEE_R, own.y, qp.z + dz / d * FLEE_R);
      }
      const a = o.seed * 2.1, rr = REL_R[o.sp] ?? 0, x = qp.x + Math.cos(a) * rr, z = qp.z + Math.sin(a) * rr;
      if (o.sp === 'crab') return hq(x, z) < 0 ? own : new V3(x, groundAt(x, z, .3), z);   // в воду не идёт
      if (o.sp === 'octopus') { const g = hq(x, z); return g > -.3 ? own : new V3(x, g + .1, z); }   // на сушу не вылезает
      return new V3(x, own.y, z);
    }
    if (o.sp === 'ship') { const th = o.th0 + o.thDir * o.t * .0048; return new V3(Math.cos(th) * 1450, 0, Math.sin(th) * 1450); }
    // v11: морской лев — на пляже своего берега (главный остров или островок, site из симуляции), по одному-двое;
    // стоит на рельефе (groundAt), в воде (away — купается, leave — уходит) — в нескольких метрах от кромки
    if (o.sp === 'sea_lion') {
      const e = shoreAt(o.site, o.x * Math.PI + o.site * 1.7);
      if (o.st === 'away' || o.st === 'leave') { const k = o.st === 'leave' ? 45 : 8; return deepSpot(new V3(e.x + e.dx * k, -.6, e.z + e.dz * k), -1.5, 1.5); }
      let x = e.x - e.dx * 1.6, z = e.z - e.dz * 1.6;
      const c = siteOf(o.site); for (let i = 0; i < 12 && hq(x, z) < .3; i++) { x += (c.cx - x) * .08; z += (c.cz - z) * .08; }   // v19: как у краба
      return new V3(x, groundAt(x, z, 1.2), z);
    }
    // краб — на мокром песке у кромки, морская звезда — на мелководье сразу за ней (видна сквозь воду)
    if (o.sp === 'crab' || o.sp === 'starfish') {
      const e = shoreAt(o.site, o.x * Math.PI + o.site * 2.3 + o.seed * .2, .25), k = o.sp === 'crab' ? -.7 : .9;
      let x = e.x + e.dx * k, z = e.z + e.dz * k;
      // v19: на маленьких неровных островках точка «чуть выше кромки» бывала в воде — краба сдвигаем вглубь суши
      if (o.sp === 'crab') { const c = siteOf(o.site); for (let i = 0; i < 12 && hq(x, z) < .15; i++) { x += (c.cx - x) * .08; z += (c.cz - z) * .08; } }
      return new V3(x, groundAt(x, z, .3) - (o.st === 'hide' ? .6 : 0), z);   // краб в норке — под песком
    }
    // креветки и осьминог: риф (site 0) или отмели островков; у дна
    if (o.sp === 'shrimp_swarm' || o.sp === 'octopus') {
      let x, z;
      if (o.site === 0) {
        const a = o.x * REEF.half; let r = REEF.r + Math.sin(o.seed * 3) * REEF.width * .6;
        for (let i = 0; i < 12 && hq(Math.sin(a) * r, Math.cos(a) * r) > -1.2; i++) r += (i % 2 ? -1 : 1) * (i + 1) * .8;   // v19: гребень рифа бывает над водой
        x = Math.sin(a) * r; z = Math.cos(a) * r;
      }
      else ({ x, z } = shoreAt(o.site, o.x * Math.PI + o.seed, -2.5));
      return new V3(x, hq(x, z) + (o.sp === 'shrimp_swarm' ? 1.2 : .1), z);
    }
    // v19: черепаха греется на пляже главного острова / спит под уступом рифа; медуза, выброшенная штормом, — на песке
    if (o.sp === 'sea_turtle' && o.st === 'bask') { const e = shoreAt(0, o.ang0, .25), x = e.x - e.dx * 1.2, z = e.z - e.dz * 1.2; return new V3(x, groundAt(x, z, .6) + .15, z); }
    if (o.sp === 'sea_turtle' && o.st === 'sleep') { const a = Math.sin(o.seed * 5) * REEF.half, r = REEF.r; return new V3(Math.sin(a) * r, hq(Math.sin(a) * r, Math.cos(a) * r) + .6, Math.cos(a) * r); }
    if (o.sp === 'jellyfish' && o.st === 'stranded') {
      // v21: на сухом песке в ~1.5 м от кромки (лежала прямо на границе воды)
      const e = shoreAt(o.site, o.x * Math.PI + o.site * 2.3 + o.seed * .2, .25), x = e.x - e.dx * 1.5, z = e.z - e.dz * 1.5;
      return new V3(x, groundAt(x, z, .3) + .05, z);
    }
    // скат — над песчаной отмелью главного острова, у дна
    if (o.sp === 'stingray') {
      const e = shoreAt(0, o.ang0 + o.x * .9, -1.5); let k = 2 + o.d * 14, x = e.x + e.dx * k, z = e.z + e.dz * k;
      while (k > 0 && hq(x, z) > -.8) { k -= 1; x = e.x + e.dx * k; z = e.z + e.dz * k; }   // v19: за отмелью бывает островок
      return new V3(x, Math.min(-.7, hq(x, z) + .8), z);
    }
    const a = o.ang0 + o.x * .9, d = BIRDS.has(o.sp) ? (o.sp === 'pelican' ? o.d * .3 : o.d * .5) : o.d, r = R + 5 + d * 45;
    // медуза: ночью ближе к поверхности, днём глубже (суточная вертикальная миграция планктона, v14)
    return new V3(Math.sin(a) * r, BIRDS.has(o.sp) ? BIRD_ALT[o.sp] : o.sp === 'jellyfish' ? lerp(-1.1, -2.6, this._day ?? 1) : o.sp === 'sea_turtle' ? -1.3 : 0, Math.cos(a) * r);
  }

  // место в строю стаи (v18, см. SLOTS/POD): на круге радиуса Rc + вбок, отстаёт по дуге своего круга
  _podSpot(o, base) {
    const [Rc, L, B] = POD[o.sp], [l, b] = SLOTS[o.slot % SLOTS.length], r = (Rc + l * L) * (o.st === 'guard' ? .85 : 1);   // v19: при акуле плотнее
    const a = (this.podRun?.[o.sp] ?? 0) + (this.podPh?.[o.sp] ?? 0) - b * B / r;
    // v19: место в строю попало на мель (у островка) — подтягиваемся к точке стаи, она на глубине (косатка заходила на островок)
    const need = SWIM_DEPTH[o.sp] * .5; let k = 1, x, z;
    do { x = base.x + Math.cos(a) * r * k; z = base.z + Math.sin(a) * r * k; k -= .125; } while (k > .5 && hq(x, z) > need);
    return new V3(x, base.y, z);
  }

  _stepAgent(o, dt) {
    o.t += dt; o.x += (o.tx - o.x) * (1 - Math.exp(-dt * 1.5)); o.d += (o.td - o.d) * (1 - Math.exp(-dt * 1.5));
    if (o.sp === 'hatchling') { this._stepHatch(o, dt); return; }
    o.jump = Math.max(0, o.jump - dt); o.dive = Math.max(0, o.dive - dt); o.fluke = Math.max(0, o.fluke - dt); o.slap = Math.max(0, (o.slap || 0) - dt);
    for (const m of o.mixers) m.update(dt * (o.sp === 'whale' ? .5 : 1) * (o.mixK ?? 1));
    if (o.act) o.act.t += dt;
    const act = (code, dur) => o.act?.code === code && o.act.t < dur;   // идёт ли сейчас это действие из журнала
    // якорь движется к цели с ограниченной скоростью — так существа приходят из дымки и уходят в неё
    const tgt = this._goal(o, dt), dv = tgt.clone().sub(o.anchor), dl = dv.length(), vmax = (SPEED[o.sp] || 5) * dt;
    // пловцы огибают мель (v18, swimStep); птицы — по прямой (пеликан тоже прилетает по воздуху)
    // v21: черепаха спит на рифе/греется на пляже, медуза на песке — без обхода мели только последние 12 м (черепаха
    // плыла к месту сна на рифе по прямой — через главный остров)
    if (ORB[o.sp] && !BIRDS.has(o.sp) && !(landed(o) && dl < 12)) {
      const via = this._via(o, tgt, dt);
      if (o.path?.length) { const d = via.clone().sub(o.anchor).setY(0), l = d.length(); o.anchor.addScaledVector(d, Math.min(1, vmax / (l || 1))); o.anchor.y += clamp(tgt.y - o.anchor.y, -vmax, vmax); }
      else swimStep(o, via, vmax);
    }
    else if (dl > vmax) o.anchor.addScaledVector(dv, vmax / dl); else o.anchor.copy(tgt);
    if (o.sp === 'ship') { this._stepShip(o, dt, o.anchor.clone()); return; }
    const stay = STATIC.has(o.sp) || o.flat;
    if (o.gone && ((o.goneT += dt) > (stay ? 4 : 70) || (!stay && dl < 5))) { this._removeAgent(o); return; }
    const ob = o.obj, base = o.anchor.clone(), prev = ob.position.clone();
    let pitch = 0, roll = 0;
    if (o.sp === 'cormorant' && o.st === 'dry' && !o.gone) {
      // v14: сушит крылья — стоит на камне у кромки, крылья раскинуты и чуть подрагивают, смотрит в сторону моря
      // v21: стоит вертикально, крылья раскрыты наполовину и горизонтально — как сушится настоящий баклан; раньше
      // тело лёжа и крылья вверх «V» — выглядел птицей, застывшей в полёте над песком
      if (!o.perch) { const e = shoreAt(0, o.ang0, .5); o.perch = new V3(e.x - e.dx * 2, 0, e.z - e.dz * 2); o.perch.y = groundAt(o.perch.x, o.perch.z, .4) + (this.assets?.gull_dark?.span ?? 1.4) * .42; o.perchH = Math.atan2(e.dx, e.dz); }
      ob.position.lerp(o.perch, 1 - Math.exp(-dt * 1.5));
      if (ob.position.distanceTo(o.perch) < 2) {
        o.upK = Math.min(1, (o.upK ?? 0) + dt);
        if (o.flap) o.flap.value = .05 + Math.sin(o.t * 3) * .02;
        if (o.fold) o.fold.value = .45 * o.upK;
        o.heading += Math.atan2(Math.sin(o.perchH - o.heading), Math.cos(o.perchH - o.heading)) * (1 - Math.exp(-dt * 2));
        ob.rotation.set(0, 0, 0); ob.rotateY(o.heading); ob.rotateX(-.35 - .85 * o.upK); return;
      }
    } else if (BIRDS.has(o.sp) && o.sp !== 'pelican') {
      o.perch = null; o.upK = 0;
      // v12 «резвее»: не ровный круг, а петли и восьмёрки с меняющимся радиусом и скоростью, набор высоты взмахами,
      // спуск планированием, крен в повороте (по скорости поворота), клюв вниз при снижении; при нырке — пике к воде
      const alb = o.sp === 'albatross', f = FLAP[o.sp] || FLAP.seagull;
      o.fa = (o.fa ?? o.seed) + dt * (alb ? .16 : o.sp === 'tern' ? .5 : .38) * (1 + .35 * Math.sin(o.t * .23 + o.seed));
      const a = o.fa, rad = (alb ? 16 : 8) * (1 + .35 * Math.sin(o.t * .11 + o.seed * 3)), fig = Math.sin(o.t * .05 + o.seed) > .3;
      let p = base.clone().add(new V3(Math.cos(a) * rad, Math.sin(o.t * .4 + o.seed) * 2.2 + Math.sin(o.t * 1.1 + o.seed * 2) * .5, (fig ? Math.sin(2 * a) * .6 : Math.sin(a)) * rad));
      // v19: альбатрос в штиль сидит на воде (без ветра не парит); крачка перед нырком зависает над волной
      if (o.st === 'sit' && !o.gone) p = base.clone().add(new V3(Math.cos(o.t * .05 + o.seed) * 3, .25 + Math.sin(o.t * 1.2 + o.seed) * .08, Math.sin(o.t * .05 + o.seed) * 3));
      if (o.hover > 0) { if ((o.hover -= dt) <= 0) o.dive = 1.2; else p = o.hoverP.clone().add(new V3(0, Math.sin(o.t * 9) * .08, 0)); }
      if (o.dive > 0) {
        const k = Math.sin((1 - o.dive / 1.2) * Math.PI); p.y = lerp(p.y, .3, k);
        if (o.diveP) { p.x = lerp(p.x, o.diveP.x, k); p.z = lerp(p.z, o.diveP.z, k); }   // v19: ныряет только в воду
      }
      // v19: круг полёта заходит на остров (холмы до 11 м) — над сушей держимся выше рельефа
      if (o.st !== 'sit' || o.gone) p.y = Math.max(p.y, groundAt(p.x, p.z, 2) + (o.dive > 0 || o.hover > 0 ? .3 : 5));   // v21: 3 → 5 м
      ob.position.lerp(p, 1 - Math.exp(-dt * 4));
      if (!(o.dive > 0) && !(o.hover > 0) && o.st !== 'dry' && o.st !== 'sit') { const g = groundAt(ob.position.x, ob.position.z, 1.5); ob.position.y = Math.max(ob.position.y, g + (g > 0 ? 3.5 : 1.5)); }   // v21: +3.5 только над сушей   // v19: и в движении не ниже (v21: 1.5 → 3.5 м — у холмов птица выглядела сидящей)
      const v = ob.position.clone().sub(prev), sp = Math.hypot(v.x, v.z) / Math.max(dt, 1e-3);
      if (sp > .05) { const h = Math.atan2(v.x, v.z), dh = Math.atan2(Math.sin(h - (o.hPrev ?? h)), Math.cos(h - (o.hPrev ?? h))); o.hPrev = h;
        o.bank = lerp(o.bank ?? 0, clamp(-dh / Math.max(dt, 1e-3) * sp * .06, -.9, .9), 1 - Math.exp(-dt * 3)); }
      roll = o.bank ?? 0; pitch = -Math.atan2(v.y, Math.hypot(v.x, v.z) + 1e-4) * .7;
      const climb = clamp(v.y / Math.max(dt, 1e-3) * .6 + .5);
      o.fp = (o.fp ?? 0) + dt * f[0] * (.7 + .6 * climb) * 6.2832;
      o.fAmp = lerp(o.fAmp ?? .3, o.st === 'sit' && !o.gone ? 0 : o.hover > 0 ? .6 : o.dive > 0 ? .12 : lerp(f[2], f[1], climb), 1 - Math.exp(-dt * 3));
      if (o.st === 'sit' && !o.gone) { roll = 0; pitch = 0; }
      if (o.fold) o.fold.value = lerp(o.fold.value, o.st === 'sit' && !o.gone ? 1 : 0, 1 - Math.exp(-dt * 2));   // v21: сидит на воде — крылья сложены
      if (o.flap) o.flap.value = Math.sin(o.fp) * o.fAmp;
    } else if (o.sp === 'pelican') {
      // v12: прилетает и улетает по воздуху (на своих крыльях, _pelicanWings), на месте садится на воду; на воде
      // покачивается, иногда окунает клюв и потягивает крылья; на «нырок» (событие) — зачерпывает рыбу клювом
      // v19: над сушей — только в полёте, и взлетает быстрее, чем садится (после нырка «скользил» низко над пляжем)
      const fly = dl > 2 || o.gone || hq(ob.position.x, ob.position.z) > -.8;
      o.fly = lerp(o.fly ?? (fly ? 1 : 0), fly ? 1 : 0, 1 - Math.exp(-dt * (fly ? 2.5 : .8)));
      const sink = -(this.assets?.pelican?.h ?? 3) * .42;   // сидит в воде по брюхо — лап не видно (было: «ходит по воде»)
      const p = base.clone().add(new V3(Math.cos(o.t * .1 + o.seed) * 3, sink + Math.sin(o.t * 1.3) * .08, Math.sin(o.t * .1 + o.seed) * 3));
      p.lerp(base.clone().setY(5 + Math.sin(o.t * .7) * .6), o.fly);
      if (o.dive > 0 && o.diveP) p.set(o.diveP.x, p.y, o.diveP.z);   // v19: пикирует туда, где вода
      ob.position.lerp(p, 1 - Math.exp(-dt * 2));
      // v21: взлетая с воды к далёкой цели, первые доли секунды скользил телом сквозь пляж — над сушей не ниже +2.5 м
      { const g = groundAt(ob.position.x, ob.position.z, 1); if (g > -.3) ob.position.y = Math.max(ob.position.y, g + 2.5); }
      // v14 (Википедия «Brown pelican»): нырок — взлёт на ~12 м, пике камнем клювом вперёд (крылья сложены), вход в воду,
      // всплытие; потом сливает воду из клюва (голова вверх) и глотает рыбу
      const dv = o.dive > 0 ? 1 - o.dive / 2.6 : -1, scoop = 0;
      if (dv >= 0) {
        ob.position.y = dv < .5 ? lerp(sink, 12, smooth(0, .5, dv)) : dv < .78 ? lerp(12, -1.5, smooth(.5, .78, dv)) : lerp(-1.5, sink, smooth(.78, 1, dv));
        o.fly = dv < .5 ? 1 : 0;
      }
      o.spill = Math.max(0, (o.spill || 0) - dt);
      if (o.wig) {
        o.wig.t.value += dt * lerp(1.2, 8.5, o.fly);
        o.stretchT = (o.stretchT ?? rnd(8, 20)) - dt; o.dipT = (o.dipT ?? rnd(4, 10)) - dt;
        const stretch = o.stretchT < 0 ? Math.sin(clamp(-o.stretchT / 1.6) * Math.PI) : 0; if (o.stretchT < -1.6) o.stretchT = rnd(10, 25);
        const dip = o.dipT < 0 ? Math.sin(clamp(-o.dipT / 1.4) * Math.PI) * .7 : 0; if (o.dipT < -1.4) o.dipT = rnd(5, 14);
        o.wig.a.value = 1; o.wig.b.value = o.spill > 0 ? -.5 * Math.sin(o.spill / 2.5 * Math.PI) : Math.max(dip, scoop) * (1 - o.fly);
        o.wingK = dv >= .5 ? 0 : Math.max(o.fly, stretch * .7);
      }
      for (const [i, w] of (o.wings || []).entries()) {
        const sg = i ? 1 : -1, k = o.wingK ?? 0;
        w.visible = k > .05; w.scale.set(Math.max(.05, k), 1, 1); w.rotation.z = sg * (Math.sin(o.wig ? o.wig.t.value : 0) * .55 * k + .12);
      }
      pitch = (dv >= .5 && dv < .8 ? 1.3 : dv >= 0 && dv < .5 ? -.25 : 0) + Math.sin(o.t * 1.3 + o.seed) * .04 * (1 - o.fly); roll = Math.sin(o.t * 1.1 + o.seed * 2) * .05;
    } else if (o.sp === 'dolphin') {
      // v13 строем: общий такт стаи (раньше у каждого свой — плыли наперерез друг другу и их расталкивало каждый кадр),
      // своё место в строю — сбоку (fs) и позади (fb)
      const p = this._podSpot(o, this._podLead(o).anchor.clone())   /* v19: строй — от точки вожака (свои точки расходились в пути) */;
      p.y = o.st === 'rest' ? -.3 + Math.sin(o.t * .5 + o.seed) * .12   // v14: ночной отдых — медленно, у самой поверхности
                            : -.15 + Math.sin(o.t * 1.4 + o.seed) * .35;   // выныривают дышать
      if (o.jump > 0) { const u = 1 - o.jump / 1.3; p.y = Math.sin(u * Math.PI) * 4.5 - .3; }
      ob.position.x += (p.x - ob.position.x) * (1 - Math.exp(-dt * 3)); ob.position.z += (p.z - ob.position.z) * (1 - Math.exp(-dt * 3));
      ob.position.y = p.y;
    } else if (o.sp === 'shark') {
      // акула идёт у поверхности: над водой только плавник, кружит вокруг своей точки
      const a = o.t * .2 + o.seed, p = base.clone().add(new V3(Math.cos(a) * 7, 0, Math.sin(a) * 7));
      p.y = -.45 + Math.sin(o.t * .5 + o.seed) * .12;
      ob.position.lerp(p, 1 - Math.exp(-dt * 1.5));
    } else if (o.sp === 'orca') {
      const p = this._podSpot(o, this._podLead(o).anchor.clone())   /* v19: строй — от точки вожака (свои точки расходились в пути) */;   // v13: строем, как дельфины
      p.y = o.st === 'stalk' ? -1.1 : -.5 + Math.sin(o.t * 1.1 + o.seed) * .45;   // v19: подкрадывается — глубже, не всплывает
      if (o.jump > 0) { const u = 1 - o.jump / 1.6; p.y = Math.sin(u * Math.PI) * 6 - .5; }
      o.spy = Math.max(0, (o.spy || 0) - dt); const spy = o.spy > 0 ? Math.sin((1 - o.spy / 4) * Math.PI) : 0;
      if (spy) p.y = -.8 + spy * 2.4;   // v19: выглядывает из воды (spyhop) — голова вверх, медленно
      ob.position.lerp(p, 1 - Math.exp(-dt * 2.5));
      if (o.wig) { o.wig.t.value += dt * (o.jump > 0 ? 5 : 2.6); o.wig.a.value = 1; }   // v12: бьёт хвостом, как дельфин
      pitch = -Math.atan2(ob.position.y - prev.y, 1e-3 + Math.hypot(ob.position.x - prev.x, ob.position.z - prev.z)) * .6 - spy * 1.35;
    } else if (o.sp === 'whale') {
      const up = o.st === 'surface' || o.st === 'arrive' || o.st === 'rest';
      // на глубину — не ниже дна (раньше −12 при дне −10: кит «плыл под землёй»)
      o.wy = lerp(o.wy ?? -6, up ? -.9 : Math.max(-12, groundAt(ob.position.x, ob.position.z, 6) + 3.8), 1 - Math.exp(-dt * .5));
      // v18: круг 12 м вокруг своей точки; если на круге под телом мелко (среди островков) — круг сжимается к точке
      o.wa = (o.wa ?? o.seed) + dt * (o.st === 'rest' ? .004 : .05);   // v19: отдыхает — почти не движется
      const a = o.wa, c = Math.cos(a), sn = Math.sin(a), wr = o.wr ?? 12;
      o.wr = shoal(base.x + c * wr, base.z + sn * wr, HALF.whale, SWIM_DEPTH.whale) > 0 ? Math.max(0, wr - 3 * dt) : Math.min(12, wr + dt);
      const p = base.clone().add(new V3(c * o.wr, 0, sn * o.wr));
      ob.position.x += (p.x - ob.position.x) * (1 - Math.exp(-dt)); ob.position.z += (p.z - ob.position.z) * (1 - Math.exp(-dt));
      ob.position.y = o.wy + Math.sin(o.t * .6) * .25;
      if (o.fluke > 0) pitch = Math.sin((1 - o.fluke / 3) * Math.PI) * .6;  // «поднял хвост и ушёл на глубину»
      if (o.slap > 0) pitch = Math.sin((1 - o.slap / 2.2) * Math.PI) * .9;  // v14: шлепок хвостом — хвост вверх и об воду
      o.lunge = Math.max(0, (o.lunge || 0) - dt); o.pec = Math.max(0, (o.pec || 0) - dt);
      if (o.lunge > 0) { const u = Math.sin((1 - o.lunge / 3) * Math.PI); ob.position.y = -1.5 + u * 4; pitch = -u * 1.25; }   // v19: выпад пастью вверх из кольца пузырей
      if (o.pec > 0) roll = Math.sin((1 - o.pec / 2.2) * Math.PI) * 1.3;   // v19: на боку, хлопает грудным плавником
      if (o.jump > 0) {   // v14: прыжок во весь рост — нос вверх, в воздухе поворот на бок, падение
        const u = 1 - o.jump / 3.2; ob.position.y = -1 + Math.sin(u * Math.PI) * 10;
        pitch = -(1 - 2 * u) * 1.1; roll = Math.sin(u * Math.PI) * 1.2;
      }
    } else if (o.sp === 'sea_lion') {
      // v12: по суше переваливается на ластах не быстрее 1.4 м/с (раньше его сталкивало «с мели» по 1.5 м за кадр — он
      // телепортировался в воду), высота сглажена — в воду соскальзывает плавно, у кромки всплеск; в воде ложится
      // на живот (наклон вперёд) и гребёт (волна по телу и ласты, _wiggle) — над водой голова и спина
      const onLand = (o.st === 'stay' || o.st === 'arrive') && !o.gone;
      if (onLand && o.landOff) base.add(o.landOff);   // v21: отодвинут соседом по берегу
      const dv2 = new V3(base.x - ob.position.x, 0, base.z - ob.position.z), dist = dv2.length();
      const step = (groundAt(ob.position.x, ob.position.z, 1.2) > -.3 ? 1.4 : 3) * dt;
      if (dist > step) ob.position.addScaledVector(dv2, step / dist); else { ob.position.x = base.x; ob.position.z = base.z; }
      if (!onLand && dist < 1 && o.st !== 'raft') { ob.position.x += Math.cos(o.t * .5 + o.seed) * dt * 1.2; ob.position.z += Math.sin(o.t * .5 + o.seed) * dt * 1.2; }   // купается — кружит
      // v23: «движется» — и когда догнал свою точку, а она ещё плывёт к берегу (скорость тела за кадр): раньше считался
      // лежащим, разворачивался мордой к морю и плыл к пляжу задом до минуты (qa heading_check: 12.8% кадров движения)
      const mv = Math.hypot(ob.position.x - prev.x, ob.position.z - prev.z) / Math.max(dt, 1e-3);
      const gh = groundAt(ob.position.x, ob.position.z, 1.2), wet = smooth(.1, -.9, gh), H = this.assets?.sea_lion?.h ?? 3, moving = dist > .3 || mv > .3 ? 1 : 0;
      const ty = lerp(Math.max(.15, gh), -H * .45 + Math.sin(o.t * 1.2) * .06, wet);
      o.ly = o.ly === undefined ? ty : lerp(o.ly, ty, 1 - Math.exp(-dt * 3));
      ob.position.y = o.ly + (1 - wet) * moving * Math.abs(Math.sin(o.t * 5)) * .12;
      if ((wet > .5) !== !!o.wet) {   // пересёк кромку: всплеск (и плеск, если его не озвучило событие «плюхнулся»)
        o.wet = wet > .5;
        if (o.wet) { const q = ob.position.clone().setY(.05); this._burst(q, 0xffffff, 26, 5); this._burst(q, 0xdff4ff, 12, 3); this._ripple(q, 3); if (!o.plop) this.onLocalSound?.('splash', q, .7); }
        o.plop = false;
      }
      o.pose = lerp(o.pose ?? wet, wet, 1 - Math.exp(-dt * 2));
      // v21: в воде голова над водой, тело наискось, задние ласты тянутся следом (было 0.55 рад носом вниз — голова
      // уходила под воду, а зад с ластами торчал вверх; сверено видом сбоку: 0.25 — естественнее всего)
      pitch = o.pose * .25 + (1 - wet) * moving * Math.sin(o.t * 5) * .06;
      o.raftK = lerp(o.raftK ?? 0, o.st === 'raft' && !o.gone ? 1 : 0, 1 - Math.exp(-dt * 1.5));   // v19: «плотик» — на боку, ласт над водой
      roll = o.raftK * 1.25; pitch *= 1 - o.raftK;
      if (o.wig) { o.wig.t.value += dt * lerp(.8, 3.2, o.pose); o.wig.a.value = o.pose; o.wig.b.value = o.t * .3; }
      if (onLand && !moving) {   // лежит на месте — поворачивается к морю, дышит
        const sc = siteOf(o.site), h = Math.atan2(base.x - sc.cx, base.z - sc.cz);
        o.heading += Math.atan2(Math.sin(h - o.heading), Math.cos(h - o.heading)) * (1 - Math.exp(-dt * 2));
        ob.rotation.set(0, 0, 0); ob.rotateY(o.heading); ob.rotateX(pitch); if (o.model) o.model.scale.y = 1 + Math.sin(o.t * 1.3 + o.seed) * .03; return;
      }
    } else if (o.sp === 'crab') {
      // бегает боком вдоль кромки туда-сюда, замирает; смотрит в сторону моря
      const sc = siteOf(o.site), out = new V3(base.x - sc.cx, 0, base.z - sc.cz).normalize(), side = new V3(out.z, 0, -out.x);
      // v14 действия: «пробежал бочком» — быстрая пробежка, «поднял клешни и замер» — стоит с поднятыми клешнями,
      // «щёлкает клешнями» — быстро щёлкает
      const claws = act('claws', 4), going = claws ? 0 : act('scuttle', 4) ? 1 : Math.sin(o.t * .23 + o.seed * 2) > -.2 ? 1 : 0;
      o.ca = (o.ca ?? 0) + dt * .7 * (act('scuttle', 4) ? 2.2 : 1) * going;
      const run = Math.sin(o.ca + o.seed) * 1.4;
      if (o.wig) { o.wig.t.value += dt * (going && o.st !== 'hide' ? 16 : 1.5); o.wig.a.value = going ? 1 : .3;
        o.wig.b.value = claws ? Math.PI / 2 : o.wig.b.value + dt * (act('snap', 3) || act('drum', 3) ? 14 : 2.3); }
      const p = base.clone().addScaledVector(side, run);
      if (o.landOff) p.add(o.landOff);   // v21: отодвинут соседями
      if (hq(p.x, p.z) < .1) { p.copy(base); o.landOff?.multiplyScalar(.9); }   // v19: пробежка вдоль кромки не заходит в воду
      ob.position.x += (p.x - ob.position.x) * (1 - Math.exp(-dt * 4)); ob.position.z += (p.z - ob.position.z) * (1 - Math.exp(-dt * 4));
      ob.position.y += ((o.st === 'hide' || o.gone ? base.y : groundAt(ob.position.x, ob.position.z, .3)) - ob.position.y) * (1 - Math.exp(-dt * 5));
      ob.rotation.set(0, Math.atan2(out.x, out.z), 0); return;
    } else if (o.sp === 'starfish' || o.sp === 'octopus') {
      // сидят у дна, чуть шевелятся (осьминог ещё медленно переползает)
      // v14 действия: осьминог «ползёт» — переползает на новое место, «просунул щупальце» — щупальца тянутся сильнее,
      // «сменил цвет» — окраска уходит в цвет песка и камней; звезда «ползёт» — сдвигается на ладонь
      if ((act('crawl', .1)) && !o.crawlTo) o.crawlTo = new V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(o.sp === 'octopus' ? 1.6 : .4);
      if (!act('crawl', 12)) o.crawlTo = null;
      o.off ??= new V3(); if (o.crawlTo) o.off.lerp(o.crawlTo, 1 - Math.exp(-dt * .25));
      const p = (o.sp === 'octopus' ? base.clone().add(new V3(Math.cos(o.t * .08 + o.seed) * .8, 0, Math.sin(o.t * .08 + o.seed) * .8)) : base.clone()).add(o.off);
      if (o.sp === 'starfish' && o.landOff) p.add(o.landOff);   // v21: отодвинута соседками
      if (o.sp === 'octopus' && hq(p.x, p.z) > -.6) p.set(base.x, 0, base.z);   // v19: на крутом склоне островка вылезал из воды
      p.y = hq(p.x, p.z) + (base.y - hq(base.x, base.z));
      ob.position.lerp(p, 1 - Math.exp(-dt * 2));
      ob.rotation.set(0, o.seed + o.t * (o.sp === 'octopus' ? .05 : .01), 0);
      if (o.model && o.sp === 'octopus') o.model.scale.set(1 + Math.sin(o.t * 1.1) * .04, 1 - Math.sin(o.t * 1.1) * .05, 1 + Math.sin(o.t * 1.1) * .04);
      const busy = act('reach', 5) || act('pool', 5) || act('crawl', 12) || act('feed', 10);
      if (o.wig) { o.wig.t.value += dt * (o.sp === 'octopus' ? 1.3 : .45) * (busy ? 2.5 : 1); o.wig.a.value = busy ? 2.2 : 1; }
      if (o.sp === 'octopus' && o.mats) {
        o.camoK = lerp(o.camoK ?? 0, act('camo', 7) ? 1 : 0, 1 - Math.exp(-dt * 1.5));
        o.origCol ??= o.mats.map(m => m.color.clone());
        o.mats.forEach((m, i) => m.color.copy(o.origCol[i]).lerp(new THREE.Color(.62, .56, .46), o.camoK * .85));
      }
      return;
    } else if (o.sp === 'jellyfish') {
      // v12 «динамичнее»: купол резко сжимается — медуза рывком всплывает, потом медленно раскрывается и опускается,
      // щупальца волнами тянутся следом (_wiggle 'jelly'); ночью неон сильнее, вспыхивает на каждом сжатии, есть ореол
      if (o.st === 'stranded' || o.flat) {   // v19: выброшена штормом — плоская лужица на песке, чуть светится
        // v21: лежит НА песке там, куда вынесло (низ модели на земле; раньше висела куполом), сплющена, щупальца
        // подобраны под купол (uWB); появляется за ~2 с, при смыве — тает на месте
        const washed = o.gone || o.st === 'leave';
        o.flat = true; o.flatK = clamp((o.flatK ?? 0) + dt * (washed ? -.4 : .5));
        const q = (o.flatPos ??= base.clone()).clone(); if (o.landOff) q.add(o.landOff);
        const sy = .07 * o.flatK, bx = this.assets?.jellyfish?.box;
        q.y = groundAt(q.x, q.z, .4) + .02 - (bx ? bx.min.y * sy : 0);
        ob.position.lerp(q, 1 - Math.exp(-dt * 4));
        if (o.model) o.model.scale.set(.9 * o.flatK, sy, .9 * o.flatK);
        if (o.wig) { o.wig.a.value = 0; o.wig.b.value = 1; }
        for (const m of o.mats || []) m.emissiveIntensity = .5 + (1 - (this._day ?? 1)) * .5;
        if (o.halo) o.halo.material.opacity = .08 + (1 - (this._day ?? 1)) * .2;
        // лежит по склону песка, а не горизонтальным диском, висящим краем над землёй
        const e = .6, gx = hq(q.x + e, q.z) - hq(q.x - e, q.z), gz = hq(q.x, q.z + e) - hq(q.x, q.z - e);
        ob.quaternion.setFromUnitVectors(new V3(0, 1, 0), new V3(-gx, 2 * e, -gz).normalize()); ob.rotateY(o.seed); return;
      }
      o.jp = (o.jp ?? Math.random()) + dt / (2.2 + (o.seed % 1) * .8);
      const ph = o.jp % 1, pulse = ph < .25 ? Math.sin(ph / .25 * Math.PI * .5) : Math.max(0, 1 - (ph - .25) / .45);
      o.jv ??= 0; o.jv += ((ph < .25 ? 1.1 : 0) - .25 - o.jv * .8) * dt;
      o.jy = clamp((o.jy ?? 0) + o.jv * dt, -1.2, .6);
      // действия из журнала: «пульсирует у поверхности» — поднимается, «опускается в глубину» — опускается, «светится» — вспышка
      o.jyB = lerp(o.jyB ?? 0, act('rise', 20) ? .9 : act('sink', 20) ? -1.3 : 0, 1 - Math.exp(-dt * .4));
      const flash = act('glow', 4) ? Math.sin(o.act.t / 4 * Math.PI) : 0;
      const p = base.clone().add(new V3(Math.cos(o.t * .1 + o.seed) * 2.5, o.jy + o.jyB, Math.sin(o.t * .13 + o.seed) * 2.5));
      ob.position.lerp(p, 1 - Math.exp(-dt * 2));
      if (o.wig) { o.wig.t.value += dt * 2.4; o.wig.a.value = pulse; }
      const nk = 1 - (this._day ?? 1);
      for (const m of o.mats || []) m.emissiveIntensity = 1 + nk * .9 + pulse * (.25 + nk * .7) + flash * 1.5;   // насыщенный неон, не белый
      if (o.halo) { o.halo.material.opacity = (.1 + nk * .6) * (.6 + .4 * pulse); o.halo.scale.setScalar(6 + pulse * 2); }
      ob.rotation.set(Math.sin(o.t * .4 + o.seed) * .12, o.seed + o.t * .05, Math.cos(o.t * .35 + o.seed) * .12); return;
    } else if (o.sp === 'sea_turtle') {
      // плывёт кругами у дна и время от времени всплывает подышать
      // v14 (Википедия «Green sea turtle»): ныряет на минуты, всплывает на пару вдохов; отдыхает, лёжа на дне.
      // «всплыла подышать» — поднимается к поверхности, «опустилась на дно» — ложится и почти не гребёт
      const still = (o.st === 'bask' || o.st === 'sleep') && !o.gone;   // v19: греется на пляже / спит под уступом рифа
      o.ta = (o.ta ?? o.seed) + dt * (act('rest', 30) || still ? 0 : .12);
      const a = o.ta, p = still ? base.clone() : base.clone().add(new V3(Math.cos(a) * 6, 0, Math.sin(a) * 6));
      if (!still) p.y = base.y + Math.pow(Math.max(0, Math.sin(o.t * .09 + o.seed)), 6) * 1.15;
      if (act('breathe', 9) && !still) p.y = -.25;
      if (act('rest', 30) && !still) p.y = hq(ob.position.x, ob.position.z) + .5;
      if (o.st === 'bask' && !o.gone) p.y = groundAt(ob.position.x, ob.position.z, .6) + .15;   // ползёт по песку
      ob.position.lerp(p, 1 - Math.exp(-dt * 1.2));
      pitch = -Math.atan2(ob.position.y - prev.y, 1e-3 + Math.hypot(ob.position.x - prev.x, ob.position.z - prev.z)) * .5;
      roll = Math.sin(o.t * 1.2 + o.seed) * .08 * (act('rest', 30) ? 0 : 1);
      if (o.wig) { o.wig.t.value += dt * (act('rest', 30) || still ? .4 : act('breathe', 9) ? 2.6 : 1.7); o.wig.a.value = act('rest', 30) || still ? .15 : 1; }   // гребёт ластами
    } else if (o.sp === 'stingray') {
      // скользит над песком плавными кругами, «крылья» волной
      // v14: «зарылся в песок» — ложится на дно и замирает (виден бугорок), «взмахнул крыльями» — частые взмахи
      const bury = act('bury', 25);
      o.sa = (o.sa ?? o.seed) + dt * (bury ? 0 : .16);
      const a = o.sa, p = base.clone().add(new V3(Math.cos(a) * 5, Math.sin(o.t * .5) * .15, Math.sin(a) * 5));
      if (bury) p.y = hq(ob.position.x, ob.position.z) + .12;
      if (hq(p.x, p.z) > -.5) p.set(base.x, p.y, base.z);   // v19: круг заходил на отмель островка — остаёмся над своей точкой
      ob.position.lerp(p, 1 - Math.exp(-dt * (bury ? .8 : 1.5)));
      roll = Math.sin(o.t * 1.6 + o.seed) * .12 * (bury ? 0 : 1);
      o.mixK = bury ? .08 : act('flap', 3) ? 3 : 1;
    } else if (o.sp === 'shrimp_swarm') {
      // рой: каждая креветка мелко «дёргается» вокруг центра; испуг (flee) — разлетаются шире
      ob.position.lerp(base, 1 - Math.exp(-dt * 1.2));
      if (act('boil', .1) || act('snap', .1)) o.fleeT = Math.max(o.fleeT || 0, 2.5);   // v14: «закипел», «щёлкает» — рой всколыхнулся
      const spread = o.fleeT > 0 ? 2.2 : 1; o.fleeT = Math.max(0, (o.fleeT || 0) - dt);
      if (o.mats) { const fl = act('flash', 3) ? Math.sin(o.act.t / 3 * Math.PI) : 0; for (const m of o.mats) m.emissiveIntensity = 1 + fl * 2; }   // «вспыхивает в лучах»
      if (o.wig) { o.wig.t.value += dt * (o.fleeT > 0 ? 14 : 5); o.wig.a.value = 1; }
      const SI = o.shrimpI, M = this._shM ||= new THREE.Matrix4(), Q = this._shQ ||= new THREE.Quaternion(), one = new V3(1, 1, 1), Yax = new V3(0, 1, 0);
      (o.shrimp || []).forEach((sh, i) => {
        const qx = sh.p.x, qz = sh.p.z;
        sh.p.set(sh.off.x * spread + Math.sin(o.t * 1.7 + sh.ph) * .35, sh.off.y + Math.sin(o.t * 2.3 + sh.ph) * .15, sh.off.z * spread + Math.cos(o.t * 1.3 + sh.ph) * .35);
        const vx = sh.p.x - qx, vz = sh.p.z - qz; if (vx * vx + vz * vz > 1e-8) sh.ry = Math.atan2(vx, vz);
        if (SI) { M.compose(sh.p.clone().divideScalar(SI.sc), Q.setFromAxisAngle(Yax, sh.ry), one).multiply(SI.rest); SI.inst.setMatrixAt(i, M); }
      });
      if (SI) SI.inst.instanceMatrix.needsUpdate = true;
      return;
    } else if (o.sp === 'fish_school') {
      ob.position.copy(base);
      // v19: сбит охотниками в плотный шар у поверхности; ночью рассыпан и медленнее; при испуге — шире
      const ball = o.st === 'ball' ? 1 : 0, scatter = o.st === 'alert' ? 2 : o.st === 'shoal' ? 1.7 : 1;
      o.ballK = lerp(o.ballK ?? 0, ball, 1 - Math.exp(-dt * 1.5));
      for (const f of o.fish || []) {
        const r = lerp(5 * f.k * scatter, 1.1 + f.k * .6, o.ballK), a = o.t * (o.st === 'shoal' ? .3 : .6) / f.k * (1 + o.ballK * 1.5) + f.ph, fp = f.obj.position.clone();
        f.obj.position.set(base.x + Math.cos(a) * r, lerp(f.h, -.5 + Math.sin(f.ph * 3) * .5, o.ballK) + Math.sin(o.t * 1.3 + f.ph) * .2, base.z + Math.sin(a) * r * lerp(.7, 1, o.ballK));
        f.obj.visible = this._fishInWater(f.obj.position, base.x, base.z, base);   // v22: и рыбы косяка — не в склоне
        const v = f.obj.position.clone().sub(fp); if (v.lengthSq() > 1e-8) f.obj.rotation.y = Math.atan2(v.x, v.z);
      }
      return;
    }
    // поворот по направлению движения (все модели смотрят в +z), плавно. v13: по сглаженной скорости — толчки
    // расталкивания (_separate) и мели больше не дёргают курс и наклон
    const v = ob.position.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    o.vel = (o.vel || v.clone()).lerp(v, 1 - Math.exp(-dt * 5));
    if (o.vel.x * o.vel.x + o.vel.z * o.vel.z > .01) {
      const h = Math.atan2(o.vel.x, o.vel.z); let dh = h - o.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      o.heading += dh * (1 - Math.exp(-dt * 4));
    }
    if (o.sp === 'dolphin') pitch = -Math.atan2(o.vel.y, Math.hypot(o.vel.x, o.vel.z) + 1e-4) * .8;
    ob.rotation.set(0, 0, 0); ob.rotateY(o.heading); ob.rotateX(pitch); ob.rotateZ(roll);
  }

  // v23 (этап 3): черепашонок — крошечная модель (панцирь, голова, четыре ласта; голова +z), один InstancedMesh на выводок.
  // Ласты гребут в шейдере (своя фаза у каждого малыша). Материал общий и прогревается на экране входа (_warmUp)
  _hatchKit() {
    if (this._hk) return this._hk;
    const part = (g, fl) => { g.deleteAttribute('uv'); g.setAttribute('aFl', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(fl), 1)); return g; };
    const parts = [part(new THREE.SphereGeometry(1, 8, 5).scale(.15, .07, .19).translate(0, .06, 0), 0), part(new THREE.SphereGeometry(.05, 6, 4).translate(0, .07, .21), 0)];
    for (const sg of [1, -1]) {
      parts.push(part(new THREE.BoxGeometry(.17, .016, .06).rotateY(-sg * .45).translate(sg * .17, .045, .08), sg));        // передние ласты — длинные
      parts.push(part(new THREE.BoxGeometry(.08, .016, .05).rotateY(sg * .5).translate(sg * .11, .035, -.14), sg * .6));   // задние
    }
    const geo = mergeGeometries(parts); geo.computeVertexNormals();
    const mat = this._hook(this._stippled(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1d2a26, flatShading: true }), true, 40), sh => {
      sh.uniforms.uT = this.uT;
      sh.vertexShader = 'uniform float uT; attribute float aFl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = uT * 8. + float(gl_InstanceID) * 1.7 + (aFl > 0. ? 0. : 3.14), r = max(0., abs(transformed.x) - .07);
        transformed.y += sin(ph) * r * .9 * abs(aFl); transformed.z += cos(ph) * r * .45 * abs(aFl);`);
    }, 'hatch');
    return (this._hk = { geo, mat });
  }
  // v23: выводок — гнездо на сухом песке пляжа главного острова (место — из симуляции, o.x); малыши по одному
  // выбираются из песка (песок «кипит»), ползут вниз по пляжу к воде веером, у кромки — крошечный всплеск, дальше
  // уплывают под водой и тают. Свой ход времени (o.t): события симуляции — только журнал. Точка выводка (o.obj) —
  // середина ещё видимых малышей: за ней летит камера и по ней звучат шорох песка и всплески рядом с камерой
  _stepHatch(o, dt) {
    if (!o.kids) {
      if (!this.assets) return;
      const e = shoreAt(0, o.x * Math.PI * .9 + .3);
      let k = 5.5, x = e.x - e.dx * k, z = e.z - e.dz * k;
      while (k > 2 && hq(x, z) > 1.4) { k -= .25; x = e.x - e.dx * k; z = e.z - e.dz * k; }   // на песке, не в траве
      o.nest = new V3(x, hq(x, z), z); o.out = new V3(e.dx, 0, e.dz);
      const kit = this._hatchKit(), n = o.cnt || 12, m = o.hatchMesh = new THREE.InstancedMesh(kit.geo, kit.mat, n), C = new THREE.Color();
      const TONES = [[.42, .4, .34], [.36, .36, .33], [.46, .42, .36], [.38, .41, .37]];
      for (let i = 0; i < n; i++) m.setColorAt(i, C.setRGB(...TONES[i % 4].map(v => v * rnd(.9, 1.1))));
      m.frustumCulled = false; this.scene.add(m);
      o.kids = Array.from({ length: n }, () => ({ born: rnd(1, 25), wait: rnd(3, 10), sp: rnd(.07, .13), a: rnd(-.55, .55), ph: Math.random() * 6.28,
        p: o.nest.clone().add(new V3(rnd(-.7, .7), 0, rnd(-.7, .7))), h: Math.atan2(e.dx, e.dz), wet: false, swim: 0, k: 0 }));
      o.sandT = 0; o.sndT = 0;
    }
    const M = this._hM ||= new THREE.Matrix4(), Q = this._hQ ||= new THREE.Quaternion(), Sc = this._hS ||= new V3(), Y = this._hY ||= new V3(0, 1, 0), c = new V3();
    let live = 0, boil = false, crawling = false;
    o.kids.forEach((q, i) => {
      const age = o.t - q.born;
      if (age >= 0) {
        q.k = clamp(q.k + dt * (q.swim > 4 ? -.6 : 2));   // появился; отплыл — тает
        if (age < 1.6) { boil = true; q.p.y = hq(q.p.x, q.p.z) - .16 + age / 1.6 * .16; }   // выбирается из песка
        else if (age > 1.6 + q.wait) {
          const dir = o.out.clone().applyAxisAngle(Y, q.a + Math.sin(o.t * 1.3 + q.ph) * .35);   // веером вниз по пляжу, виляя
          q.p.addScaledVector(dir, (q.wet ? .35 : q.sp) * dt); q.h = Math.atan2(dir.x, dir.z);
          const g = hq(q.p.x, q.p.z);
          if (!q.wet && g < -.05) {   // кромка: крошечный всплеск
            q.wet = true; const w = q.p.clone().setY(.04), d = w.distanceTo(this.camera.position); this._ripple(w, .7, 1.1);
            if (d < 30) this.onLocalSound?.('splash', w, .3 * (1 - d / 30));
          }
          if (q.wet) { q.swim += dt; q.p.y = Math.max(g + .12, -Math.min(.6, q.swim * .15)); }
          else { q.p.y = g + Math.abs(Math.sin(o.t * 9 + q.ph)) * .015; crawling = true; }
        }
      }
      if (q.k > .01) { live++; c.add(q.p); }
      Q.setFromAxisAngle(Y, q.h); M.compose(q.p, Q, Sc.setScalar(q.k)); o.hatchMesh.setMatrixAt(i, M);
    });
    o.hatchMesh.instanceMatrix.needsUpdate = true;
    o.obj.position.copy(live ? c.divideScalar(live) : o.nest);
    // песок «кипит» над гнездом, пока малыши выбираются; шорох песка рядом с камерой, пока выбираются и ползут
    if (boil && (o.sandT -= dt) <= 0) { o.sandT = rnd(.4, .9); this._burst(o.nest.clone().add(new V3(rnd(-.5, .5), .05, rnd(-.5, .5))), 0xd8c7a0, 6, 1, true); }
    const cd = o.obj.position.distanceTo(this.camera.position);
    if ((boil || crawling) && cd < 30 && (o.sndT -= dt) <= 0) { o.sndT = rnd(.7, 1.6); this.onLocalSound?.('sand', o.obj.position, 1 - cd / 30); }
    if (o.gone && (!live || o.t > 200)) this._removeAgent(o);
  }

  // звук при приближении (v11): медуза/осьминог/черепаха — бульки, креветки — треск, краб — щёлканье; ближе — громче.
  // Каждый звучит сам по себе раз в несколько секунд, только если камера рядом (до 32 м)
  _nearSounds(dt) {
    if ((this._nearT = (this._nearT || 0) - dt) > 0) return;
    this._nearT = .5;
    const cam = this.camera.position;
    for (const o of this.agents.values()) {
      const cat = NEAR_SND[o.sp]; if (!cat || o.gone || o.st === 'hide') continue;
      const d = o.obj.position.distanceTo(cam); if (d > 32) continue;
      if ((o.sndT = (o.sndT ?? rnd(0, 3)) - .5) > 0) continue;
      o.sndT = rnd(3, 8); this.onLocalSound?.(cat, o.obj.position, 1 - d / 32);
    }
  }

  // акула (v15): на время броска — клип укуса, при бегстве — быстрый ход; потом плавно обратно к обычному плаванию
  _sharkAct(o, k, dur) {
    const A = o.acts, a = A?.[k]; if (!a || !A.swim) return;
    a.reset(); a.play(); A.swim.crossFadeTo(a, .3, false);
    clearTimeout(o.actTimer); o.actTimer = setTimeout(() => { A.swim.reset(); A.swim.play(); a.crossFadeTo(A.swim, .5, false); }, dur * 1000);
  }
  // «показать обитателя» (v13, нажатие на строку в панели «Обитатели»): камера плавно подлетает к зверю и следует за ним,
  // пока пользователь сам не возьмётся за камеру. Повторное нажатие на тот же вид — следующая особь
  focusSpecies(sp) {
    const list = [...this.agents.values()].filter(o => o.sp === sp && !o.gone).sort((a, b) => a.id - b.id); if (!list.length) return;
    this.onDiscover?.(sp);   // v23: выбрал в «Обитателях» — вид найден (бестиарий)
    const i = this._follow?.sp === sp ? (list.findIndex(o => o.id === this._follow.id) + 1) % list.length : 0;
    this._follow = { id: list[i].id, sp, t: 0, dist: FOLLOW_D[sp] || 12 }; this._fly = null; this._freeCam = false; this._censusHTML = null;
  }
  _stepFollow(dt) {
    const f = this._follow, C = this.controls;
    // v22: при слежении — вращение и приближение вокруг зверя; сдвиг и «приближение к курсору» спорили бы со слежением
    C.enablePan = !f; C.zoomToCursor = !f;
    if (!f) return;
    const o = this.agents.get(f.id);
    if (!o || o.gone) { this.unfollow(); return; }
    const tg = C.target, cam = this.camera.position, p = o.fish?.length ? o.anchor.clone().setY(-1) : o.obj.position.clone();
    f.t += dt; const k = 1 - Math.exp(-dt * (f.t < 2.5 ? 1.8 : 4));
    const before = tg.clone(); tg.lerp(p, k); cam.add(tg.clone().sub(before));   // камера едет вместе с точкой обзора
    if (f.user) return;   // v22: человек взялся за камеру — расстояние и ракурс его, не возвращаем
    const off = cam.clone().sub(tg), d = off.length() || 1;
    off.multiplyScalar(lerp(d, f.dist, k) / d);
    if (off.y < f.dist * .4) off.y = lerp(off.y, f.dist * .5, k);   // смотрим сверху-сбоку (под воду — сквозь воду)
    cam.copy(tg).add(off);
  }
  // v22: плашка «Слежу: Дельфин №3 ✕» — за кем сейчас камера (каждый кадр, и на паузе); ✕ или Esc — отпустить
  _followChip() {
    const f = this._follow, o = f && this.agents.get(f.id), fe = this._chipEl ??= $('#follow'); if (!fe) return;
    const t = o ? `Слежу: ${o.sp === 'fish_school' ? NAMES.fish_school : `${NAMES[o.sp] || o.sp} №${o.n}`}` : '';
    if (t !== this._chipT) { this._chipT = t; fe.firstChild.textContent = t; fe.classList.toggle('show', !!o); }
  }
  unfollow() { if (this._follow) { this._follow = null; this._censusHTML = null; this._idle = 0; } }

  // QA (?look=crab): один раз подвести камеру к первому существу этого вида — снять его крупно; границы камеры
  // для такого снимка не действуют (островки и риф дальше 42 м)
  _qaLook() {
    const q = new URLSearchParams(location.search), fsp = q.get('follow');   // ?follow=dolphin — проверка «показать обитателя»
    if (fsp && !this._followed && [...this.agents.values()].some(o => o.sp === fsp && o.t > .3)) { this._followed = true; this.focusSpecies(fsp); }
    const sp = this._look ??= q.get('look') || '';
    if (!sp || this._looked) return;
    // ?look=cloud — ближайшее видимое облако, камера выше него (проверка «облака режутся/пропадают сверху»)
    const cl = sp === 'cloud' && this.clouds.filter(c => c.visible).sort((a, b) => a.position.length() - b.position.length())[0];
    const cr = sp === 'crawl' && this.crawlers.find(c => c.kind === (q.get('kind') || 'ants'));   // ?crawl=1&look=crawl — букашки крупно
    // v21 QA: look=stranded — медуза на песке
    const pick = q => sp === 'stranded' ? q.sp === 'jellyfish' && q.st === 'stranded' : q.sp === sp;
    const o = cl ? { obj: cl } : cr ? { obj: { position: new V3(cr.x, hq(cr.x, cr.z), cr.z) } } : [...this.agents.values()].find(q => pick(q) && !q.gone && q.t > .3); if (!o) return;
    const p = o.obj.position, d = cr ? 2.2 : cl ? 70 : sp === 'ship' ? 220 : sp === 'whale' ? 30 : sp === 'stranded' ? 4.5 : sp === 'crab' || sp === 'starfish' || sp === 'shrimp_swarm' || sp === 'cormorant' ? 6 : 12;
    const side = q.get('lookside') === '1';   // v21 QA: вид сбоку, почти с уровня воды
    this.controls.target.copy(p); this.camera.position.copy(p).add(side ? new V3(d * .95, Math.max(.4, -p.y + .6), d * .3) : new V3(d * .7, d * .55, d * .7)); this.controls.update();
    this._looked = true; this._freeCam = true; console.log('QALOOK', sp, p.toArray().map(v => v.toFixed(1)).join(','), 'ground', hq(p.x, p.z).toFixed(1));
  }

  // морские звери не влезают друг в друга (дельфины стаи кружили по одинаковым кругам и сходились в одну модель)
  // и не заплывают на мель островков. ponytail: попарный перебор O(n²) — зверей в воде ~10–20, хватает
  _separate(dt) {
    // v21: на суше — толчок копится в o.landOff (не больше 2.5 м, понемногу ослабевает), его прибавляет _stepAgent к
    // точке зверя; у кромки толчок, ведущий в воду, направляется вглубь суши
    for (const o of this.agents.values()) o.landOff?.multiplyScalar(1 - Math.min(1, dt * .05));
    const ld = [...this.agents.values()].filter(o => !o.gone && LAND_R[o.sp] && o.st !== 'hide' &&
      (o.sp !== 'jellyfish' || o.st === 'stranded') && (o.sp !== 'sea_lion' || ((o.st === 'stay' || o.st === 'arrive') && !o.wet)));
    for (let i = 0; i < ld.length; i++) for (let j = i + 1; j < ld.length; j++) {
      const A = ld[i], B = ld[j], a = A.obj.position, b = B.obj.position, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
      const over = LAND_R[A.sp] + LAND_R[B.sp] - d; if (over <= 0) continue;
      const k = over * .5 / d * (1 - Math.exp(-dt * 6));
      for (const [o, p, s] of [[A, a, -1], [B, b, 1]]) {
        let mx = s * dx * k, mz = s * dz * k;
        if (o.sp !== 'starfish' && hq(p.x + mx, p.z + mz) < .15) {
          const c = siteOf(o.site > 0 ? o.site : 0), ix = c.cx - p.x, iz = c.cz - p.z, il = Math.hypot(ix, iz) || 1, st = Math.hypot(mx, mz);
          mx = ix / il * st; mz = iz / il * st;
        }
        p.x += mx; p.z += mz;
        const L = (o.landOff ||= new V3()); L.x += mx; L.z += mz; if (L.length() > 2.5) L.setLength(2.5);
      }
    }
    // v19: тело не ниже дна (+ полвысоты тела) — у всех, кто в воде; черепаха, уплывая с рифа, была «под рифом»
    for (const o of this.agents.values()) {
      const c = CLEAR[o.sp]; if (c === undefined || landed(o)) continue;
      const p = o.obj.position, g = hq(p.x, p.z) + c; if (p.y < g) p.y = g;
    }
    // лев на суше — не пловец: его не расталкиваем
    const sw = [...this.agents.values()].filter(o => SWIM_R[o.sp] && !(o.sp === 'sea_lion' && !o.wet) && !landed(o));
    for (let i = 0; i < sw.length; i++) {
      const a = sw[i].obj.position;
      for (let j = i + 1; j < sw.length; j++) {
        const b = sw[j].obj.position, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
        const over = SWIM_R[sw[i].sp] + SWIM_R[sw[j].sp] - d;
        if (over > 0) { const k = over * .5 / d * (1 - Math.exp(-dt * 6)); a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }   // v13: мягко, без рывков
      }
      // мель (v12): у длинных проверяем нос, середину и хвост; толкаем вниз по склону от мелкого места, не быстрее
      // 8 м/с (раньше до 1.5 м за кадр — зверь «прыгал»). Льва не толкаем: он сам выходит на берег и уходит с него
      const o = sw[i], need = SWIM_DEPTH[o.sp]; if (need === undefined || o.sp === 'sea_lion' || o.sp === 'pelican') continue;
      const hx = Math.sin(o.heading), hz = Math.cos(o.heading), half = HALF[o.sp] || 0;
      for (const k of half ? [-1, 0, 1] : [0]) {
        const px = a.x + hx * half * k, pz = a.z + hz * half * k, g = hq(px, pz); if (g <= need) continue;
        const e = 1, gx = hq(px + e, pz) - hq(px - e, pz), gz = hq(px, pz + e) - hq(px, pz - e), L = Math.hypot(gx, gz) || 1;
        const step = Math.min(8 * dt, (g - need) * .5); a.x -= gx / L * step; a.z -= gz / L * step;
      }
    }
  }

  _removeAgent(o) {
    this.scene.remove(o.obj); if (o.hatchMesh) this.scene.remove(o.hatchMesh);   // v23: выводок черепашат — свой объект сцены for (const f of o.fish || []) this.scene.remove(f.obj);   // рыбки косяка — отдельные объекты сцены
    this.agents.delete(o.id);
    // v22: свои кости копий модели и свои крылья пеликана освобождаем сразу (раньше висели до сборки мусора). Материалы
    // не трогаем: с ними ушли бы собранные шейдеры, и следующий такой же зверь собирал бы их заново — рывок
    this._freeBones(o.obj); for (const f of o.fish || []) this._freeBones(f.obj);
    o.wings?.[0].children[0].geometry.dispose();
  }
  // v22: у каждой копии модели (SkeletonUtils.clone) свой скелет, и three.js держит для него текстуру костей — освобождаем,
  // когда копия больше не рисуется (иначе с каждым прыжком рыбы и ушедшим зверем их становилось больше)
  _freeBones(obj) { obj.traverse(n => n.skeleton?.dispose()); }

  // ------------------------------------------------------------------ эффекты
  _ripple(pos, size = 3, life = 1.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(.08); this.scene.add(m); let t = 0;
    this.fx.push(dt => { t += dt; const u = t / life; m.scale.setScalar(.3 + u * size); m.material.opacity = .9 * (1 - u) * (1 - u);
      if (u >= 1) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; } return true; });
  }
  _burst(pos, color, n = 20, speed = 7, up = false) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); v.push([rnd(-1, 1) * speed * .4, rnd(.5, 1) * speed * (up ? 1.8 : 1), rnd(-1, 1) * speed * .4]); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color, size: up ? .9 : .6, transparent: true, opacity: .95, depthWrite: false, map: this.glowTex });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; this.scene.add(pts); let t = 0, life = up ? 2.4 : 1.2;
    this.fx.push(dt => {
      t += dt; const a = g.attributes.position;
      for (let i = 0; i < n; i++) { v[i][1] -= 13 * dt; a.array[i * 3] += v[i][0] * dt; a.array[i * 3 + 1] = Math.max(0, a.array[i * 3 + 1] + v[i][1] * dt); a.array[i * 3 + 2] += v[i][2] * dt; }
      a.needsUpdate = true; m.opacity = .95 * (1 - t / life);
      if (t >= life) { this.scene.remove(pts); g.dispose(); m.dispose(); return false; } return true;
    });
  }
  // вход в воду после прыжка (дельфин, косатка): два слоя брызг (высокий и низкий веер), двойные круги и плеск в звуке
  // (v11: пользователь просил больше брызг и звук). k — размер зверя
  _splash(p, k = 1) {
    this._burst(p, 0xffffff, Math.round(46 * k), 7.5 * k); this._burst(p, 0xdff4ff, Math.round(24 * k), 4 * k);
    this._ripple(p, 4 * k); setTimeout(() => this._ripple(p, 6 * k, 2.2), 250);
    this.onLocalSound?.('splash', p, Math.min(1, .7 * k));
  }
  // фонтан кита: столб брызг вверх
  _spout(o) {
    if (!o || !this.agents.has(o.id)) return;
    const p = o.obj.position.clone().add(new V3(Math.sin(o.heading) * 4, 0, Math.cos(o.heading) * 4)).setY(.2);
    this._burst(p, 0xeaf6ff, 70, 5, true); this._ripple(p, 5);
  }
  // прыжок рыбы вдали (v12): модель рыбы в k раз крупнее (иначе в 300 м не видно), дуга, всплеск на входе
  _leap(from, k) {
    const m = this._clone('fish'); if (!m) return;
    const to = from.clone().add(new V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(rnd(5, 9) * k / 3)), h = rnd(2.5, 4.5) * k / 3, life = rnd(1, 1.4);
    m.obj.scale.setScalar(k); m.obj.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); this.scene.add(m.obj); let t = 0;
    this._ripple(from, 2 * k); this._burst(from.clone().setY(.05), 0xeaf6ff, 14, 3 * k);
    this.fx.push(dt => {
      t += dt; const u = clamp(t / life); m.obj.position.lerpVectors(from, to, u); m.obj.position.y = Math.sin(u * Math.PI) * h;
      m.obj.rotation.x = -Math.cos(u * Math.PI) * .7; m.mixer?.update(dt * 2);
      if (u >= 1) { this.scene.remove(m.obj); this._freeBones(m.obj); const q = to.clone().setY(.05); this._burst(q, 0xffffff, 20, 3.5 * k); this._ripple(q, 3 * k); return false; } return true;
    });
  }
  // летучая рыба: настоящая рыбка по дуге над водой
  _flyingFish(from) {
    const m = this._clone('fish'); if (!m) return;
    // «крылья»: у модели рыбы их нет, добавляем пару полупрозрачных плавников — узнаётся как летучая рыба
    const wing = new THREE.PlaneGeometry(1.5, .5), wm = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x2a4a5a, transparent: true, opacity: .75, side: THREE.DoubleSide, forceSinglePass: true });
    for (const sgn of [-1, 1]) {
      const w = new THREE.Mesh(wing, wm); w.position.set(sgn * .5, .12, 0); w.rotation.set(-Math.PI / 2, 0, sgn * .35); m.obj.add(w);
    }
    const to = from.clone().add(new V3(rnd(-7, 7), 0, rnd(-7, 7))), h = rnd(2, 3.5), life = rnd(.9, 1.3);
    m.obj.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); this.scene.add(m.obj); let t = 0;
    this._ripple(from, 2);
    this.fx.push(dt => {
      t += dt; const u = clamp(t / life); m.obj.position.lerpVectors(from, to, u); m.obj.position.y = Math.sin(u * Math.PI) * h;
      m.obj.rotation.x = -Math.cos(u * Math.PI) * .6; m.mixer?.update(dt * 2);
      if (u >= 1) { this.scene.remove(m.obj); this._freeBones(m.obj); wing.dispose(); this._burst(to, 0xffffff, 22, 4.5); this._ripple(to, 2); this.onLocalSound?.('splash', to, .6); return false; } return true;
    });
  }

  // ------------------------------------------------------------------ журнал
  // v22: журнал «не летит»: не больше одной новой строки за 0.9 с времени мира (очередь до 8, старые лишние — отбрасываются);
  // то же событие (тип) за 15 с — не новая строка, а «×N» у прежней (или у ждущей в очереди); пока над журналом мышь или
  // его листают пальцем (и 4 с после) — новые строки ждут. Запись помнит зверя и место: нажатие — камера туда (focusEvent)
  _addLog(e) {
    if (['wave_break', 'splash', 'surf_surge', 'surf_calm'].includes(e.type)) return;
    const o = this.agents.get(e.agent);
    const rec = { type: e.type, time: e.time ?? '', text: e.text[0].toUpperCase() + e.text.slice(1), agent: o ? o.id : null, n: 1,
      pos: o ? o.obj.position.clone() : this.W((e.panorama ?? .5) * 2 - 1, e.distance ?? .5, 0) };
    const q = this._logQ.find(r => r.type === rec.type);
    if (q) { Object.assign(q, { ...rec, n: q.n + 1 }); return; }
    const last = this._logLast.get(rec.type);
    if (last && this.clock - last.at < 15 && last.li.isConnected) { last.at = this.clock; this._fillLog(last.li, { ...rec, n: (this._logRecs.get(last.li)?.n || 1) + 1 }); return; }
    this._logQ.push(rec); if (this._logQ.length > 8) this._logQ.shift();
  }
  _fillLog(li, rec) {
    li.innerHTML = '<time></time><span></span>'; li.firstChild.textContent = rec.time; li.lastChild.textContent = rec.text;
    if (rec.n > 1) { const b = document.createElement('b'); b.textContent = '×' + rec.n; li.lastChild.append(' ', b); }
    this._logRecs.set(li, rec);
    li.classList.add('new'); clearTimeout(li._t); li._t = setTimeout(() => li.classList.remove('new'), 2500);
  }
  _stepLog(dt) {   // на паузе (шаг мира 0) очередь стоит
    if (!dt || (this._logT -= dt) > 0 || !this._logQ.length || this._logHoldM || performance.now() < this._logHoldT) return;
    this._logT = .9;
    const rec = this._logQ.shift(), li = document.createElement('li');
    this._fillLog(li, rec); this._logLast.set(rec.type, { li, at: this.clock });
    // v22: журнал листается (40 записей); если его отлистали вниз — новая запись сверху не сдвигает то, что читают
    const box = this.logList, keep = box.scrollTop > 2;
    box.prepend(li);
    if (keep) { this._logOwn = performance.now(); box.scrollTop += li.offsetHeight; }
    while (box.children.length > 40) box.lastChild.remove();
  }
  // нажатие на запись журнала: зверь ещё здесь — камера к нему и следит (как «показать обитателя»); ушёл — к месту события
  focusEvent(r) {
    if (!r) return;
    const o = r.agent != null && this.agents.get(r.agent);
    if (o && !o.gone) { this.followAgent(o); return; }
    const p = r.pos.clone(), hr = Math.hypot(p.x, p.z); if (hr > 150) { p.x *= 150 / hr; p.z *= 150 / hr; }
    p.y = clamp(p.y, Math.max(0, hq(p.x, p.z) + .5), 30);
    this._follow = null; this._fly = { p, t: 0 }; this._idle = 0;
  }
  // слежение за этим зверем (журнал, двойное нажатие по зверю); v23: следит — вид найден (бестиарий)
  followAgent(o) { this._fly = null; this._follow = { id: o.id, sp: o.sp, t: 0, dist: FOLLOW_D[o.sp] || 12 }; this._freeCam = false; this._censusHTML = null; this.onDiscover?.(o.sp); }
  _stepFly(dt) {
    const f = this._fly; if (!f) return;
    const tg = this.controls.target, cam = this.camera.position, k = 1 - Math.exp(-dt * 2.2), before = tg.clone();
    f.t += dt; tg.lerp(f.p, k); cam.add(tg.clone().sub(before));
    const off = cam.clone().sub(tg), d = off.length() || 1; off.multiplyScalar(lerp(d, 32, k) / d);
    if (off.y < 12) off.y = lerp(off.y, 16, k);
    cam.copy(tg).add(off);
    if (tg.distanceTo(f.p) < .3 || f.t > 6) { this._fly = null; this._idle = 0; }
  }

  // ------------------------------------------------------------------ палитра
  _palette() {
    const dusk = clamp(Math.max(1 - Math.abs(this.cur.tod - .25) * 6, 1 - Math.abs(this.cur.tod - .75) * 6));
    const day = smooth(.04, .5, this.cur.daylight), stormy = clamp(Math.max(this.cur.rain, (this.cur.weather - .55) / .3) * .8);
    const out = { day, dusk, stormy };
    for (const k of ['zen', 'hor', 'sh', 'deep']) {
      let c = mix3(PAL.night[k], PAL.day[k], day); c = mix3(c, PAL.dusk[k], dusk * .8); c = mix3(c, PAL.storm[k], stormy * day);
      out[k] = c;
    }
    return out;
  }

  // ------------------------------------------------------------------ наведение мыши
  // v22: подпись появлялась «через раз» (замер qa/hover_check.mjs: видна 19–86% времени, пока курсор ведёт за зверем):
  // зверь ловился, только если курсор ближе 34 px к центру модели — у кита и у косяка (центр — пустота между рыбами)
  // это малая часть тела, а у плывущего зверя центр то входил в круг, то выходил. Теперь зона — по размеру зверя на
  // экране, у уже выбранного она в 1.6 раза шире; подпись стоит над зверем и держится 0.35 с, если курсор соскочил
  // зверь под точкой экрана (mx, my — от угла сцены): ближайший по размеру тела на экране; у уже выбранного (подпись)
  // зона в 1.6 раза шире; wide — для двойного нажатия пальцем (палец толще курсора)
  _pickAt(mx, my, wide = 1) {
    const w = this.w, h = this.h, v = this._hv ??= new V3(), cam = this.camera.position;
    const pxPerM = h / (2 * Math.tan(this.camera.fov * Math.PI / 360));   // пикселей экрана на метр на расстоянии 1 м
    let best = null, bestK = 1;
    for (const o of this.agents.values()) {
      if (o.gone) continue;
      v.copy(o.obj.position).project(this.camera);
      if (v.z > 1 || v.z < -1) continue;
      const px = (v.x * .5 + .5) * w, py = (-v.y * .5 + .5) * h, d = Math.hypot(px - mx, py - my);
      const rad = clamp((BODY_R[o.sp] ?? 1.5) * pxPerM / Math.max(1, o.obj.position.distanceTo(cam)), 0, 260);
      const k = d / (Math.max(30, rad) * (o === this._hov ? 1.6 : 1) * wide);
      if (k < bestK) { bestK = k; best = o; this._pickP = [px, py, rad]; }
    }
    return best;
  }
  _updateHover(dt = 0) {
    if (!this._mouseOver) { this._hov = null; this.tipEl.classList.remove('show'); return; }
    const best = this._pickAt(this._mouse.x, this._mouse.y);
    if (best) { this._hov = best; this._hovT = .35; this._hovP = this._pickP; }
    else if (this._hov && ((this._hovT -= dt) <= 0 || this._hov.gone)) this._hov = null;
    const o = this._hov;
    if (o) {
      const txt = o.sp === 'fish_school' ? NAMES.fish_school : `${NAMES[o.sp] || o.sp} №${o.n}`;
      if (this.tipEl.textContent !== txt) { this.tipEl.textContent = txt; this.onDiscover?.(o.sp); }   // v23: навёлся — вид найден (бестиарий)
      const r = this.stage.getBoundingClientRect(), [px, py, rad] = this._hovP;
      this.tipEl.style.left = (r.left + px) + 'px'; this.tipEl.style.top = (r.top + py - Math.min(rad, 60) * .5) + 'px';
      this.tipEl.classList.add('show');
    } else this.tipEl.classList.remove('show');
  }

  // v24: оценка памяти картинки для ?debug=1 (МБ): текстуры (с мип-уровнями), геометрии, буфер кадра
  memEstimate() {
    const tex = new Set(), geo = new Set();
    const visit = o => o.traverse(n => { if (n.geometry) geo.add(n.geometry);
      for (const m of [n.material].flat()) { if (!m) continue; for (const k in m) if (m[k]?.isTexture) tex.add(m[k]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) tex.add(u.value); } });
    visit(this.scene); if (this.warm) visit(this.warm); for (const a of Object.values(this.assets || {})) visit(a.obj);
    let t = 0, g = 0;
    for (const x of tex) { const w = x.image?.width || 0, h = x.image?.height || 0; t += w * h * (x.type === THREE.HalfFloatType ? 8 : x.type === THREE.FloatType ? 16 : 4) * (x.generateMipmaps !== false && x.minFilter > THREE.LinearFilter ? 1.33 : 1); }
    for (const x of geo) { for (const a of Object.values(x.attributes)) g += a.array?.byteLength || 0; if (x.index) g += x.index.array.byteLength; }
    const W = this.rt.width, H = this.rt.height, S = this.rt.samples;
    return { tex: t / 1048576, geo: g / 1048576, rt: W * H * 4 * (1.33 + (S ? 2 * S : 1) + 1) / 1048576 };
  }

  // насколько камера близко к острову (0 далеко .. 1 вплотную) — для звука насекомых
  proximity() {
    const c = this.camera.position, d = Math.hypot(c.x, c.z);
    return smooth(75, 28, d) * smooth(60, 22, c.y);
  }

  // качество картинки (v21 — только понижение по частоте кадров; v22 — и выбор в настройках, см. main.js): k — доля
  // разрешения от basePR, msaa — сглаживание буфера (в программном рендере его нет вовсе)
  // v23: life — доля растений, светлячков и мотыльков (раскладка случайная — редеют равномерно)
  // v24: lite — «Лёгкое»: уже загруженные текстуры моделей ужимаются до 256 (обратно не растут — до перезагрузки)
  setQuality({ k = 1, msaa = true, life = 1, lite = false } = {}) {
    const pr = this.basePR * k, samples = msaa && !this.soft ? (msaa === true ? 4 : msaa) : 0;   // v24: msaa — да/нет или число отсчётов (?bench=1)
    if (lite && !this.lite) { this.lite = true; for (const a of Object.values(this.assets || {})) a.obj.traverse(n => { for (const m of [n.material].flat()) if (m?.map) this._fitTex(m.map); }); }
    for (const m of this.flora || []) m.count = Math.round(m.userData.n * life);
    for (const g of this.flies || []) g.setDrawRange(0, Math.round(g.attributes.position.count * life));
    if (this.mothGeo) this.mothGeo.instanceCount = Math.round(this.mothGeo.userData.n * life);
    if (Math.abs(pr - this.renderer.getPixelRatio()) > 1e-3) { this.renderer.setPixelRatio(pr); this.resize(); }
    if (samples !== this.rt.samples) { this.rt.samples = samples; this.rt.dispose(); }
  }
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2()); this.rt.setSize(db.x, db.y); this.postMat.uniforms.uAspect.value = w / h;
    this.uPix.value = this.renderer.domElement.height / (2 * Math.tan(this.camera.fov * Math.PI / 360));
  }

  // ------------------------------------------------------------------ кадр
  // v22: dt — шаг мира (на паузе 0: звери, вода, эффекты замирают), dtc — настоящий шаг кадра: камеру на паузе можно
  // крутить и приближать (OrbitControls, слежение за зверем, перелёт к событию, границы), облёт сам не включается
  frame(dt, t, dtc = dt) {
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key of Object.keys(this.cur)) if (key !== 'tod') this.cur[key] += (this.tgt[key] - this.cur[key]) * k;
    this.cur.tod = this.tgt.tod;   // доля суток — круговая, не лерпим (см. v5)
    this.clock += dt;

    const P = this._palette(), { day, dusk, stormy } = P, night = 1 - day;
    // солнце: восход на востоке (+x) в 06:00, полдень наверху (чуть к югу), закат на западе в 18:00; луна — напротив
    const ang = (this.cur.tod - .25) * Math.PI * 2;
    const sunDir = new V3(Math.cos(ang), Math.sin(ang), -.35).normalize(), moonDir = sunDir.clone().multiplyScalar(-1).setZ(-.3).normalize();
    const sunUp = smooth(-.08, .12, sunDir.y), moonUp = smooth(-.05, .15, moonDir.y);
    this.sunGlow.position.copy(sunDir).multiplyScalar(900); this.sunDisc.position.copy(sunDir).multiplyScalar(900);
    this.sunGlow.material.opacity = sunUp * (1 - stormy * .8); this.sunDisc.material.opacity = sunUp * (1 - stormy * .9);
    this.sunGlow.material.color.setRGB(1, lerp(.62, .9, day - dusk * .5), lerp(.35, .7, day - dusk * .5));
    this.moon.position.copy(moonDir).multiplyScalar(900); this.moon.material.opacity = moonUp * (1 - stormy * .8) * lerp(1, .35, day);

    const zen = new THREE.Color(...P.zen), hor = new THREE.Color(...P.hor);
    const su = this.skyMat.uniforms; su.uZen.value.copy(zen); su.uHor.value.copy(hor); su.uSunDir.value.copy(sunDir);
    su.uSunCol.value.setRGB(1, .75 - dusk * .25, .45 - dusk * .2); su.uSunA.value = sunUp * (1 - stormy * .8);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = lerp(120, 25, Math.max(this.cur.fog, stormy * .5)); this.scene.fog.far = lerp(420, 180, Math.max(this.cur.fog, stormy * .5));
    this.starMat.uniforms.uA.value = smooth(.5, .05, day) * (1 - this.cur.rain) * (1 - this.cur.fog); this.starMat.uniforms.uT.value = t;
    this.stars.rotation.y = this.clock * .004;
    // дальний остров в дымке: своя окраска со светом + дымка горизонта (сильнее у подножия); ночью — светящаяся кромка
    this.uFarHaze.value.setRGB(...P.hor); this.uFarGlow.value.setRGB(...P.sh).multiplyScalar(.04 + smooth(.6, .1, day) * .16);   // еле заметно днём, чуть ярче ночью
    const volc = .12 + smooth(.6, .1, day) * .9 + dusk * .3;   // вулкан: днём едва тлеет, ночью светится
    this.uVolc.value.setRGB(1, .28, .08).multiplyScalar(volc); this.volcGlow.material.opacity = volc * .55 * (.85 + .15 * Math.sin(t * 1.3));
    if (this.curMat) { this.curMat.uniforms.uK.value = (lerp(.12, 1, smooth(.7, .1, day)) + dusk * .3) * (1 - this.cur.fog * .7); this.curMat.uniforms.uC.value.setRGB(...P.sh); }

    // свет: солнце (днём/на закате тёплое), луна (голубая), небо — рассеянный; ночью мир не проваливается в черноту
    this.sun.position.copy(sunDir).multiplyScalar(100); this.sun.intensity = 1.6 * sunUp * (1 - stormy * .6);
    this.sun.color.setRGB(1, lerp(.62, .95, day - dusk * .4), lerp(.4, .86, day - dusk * .4));
    this.moonLight.position.copy(moonDir).multiplyScalar(100); this.moonLight.intensity = .9 * moonUp * night;
    this.hemi.color.copy(zen).lerp(hor, .55).lerp(new THREE.Color(1, 1, 1), .3);   // на закате — тёплый свет горизонта, не тёмный зенит this.hemi.groundColor.setRGB(.42, .36, .26);
    this.hemi.intensity = lerp(1.3, 2.6, day);
    this.uBright.value = lerp(.6, .9, day);
    

    const wu = this.waterMat.uniforms;
    wu.uT.value = t; wu.uWave.value = .6 + this.cur.wave * 2.2 + this.cur.wind;
    wu.uSh.value.setRGB(...P.sh); wu.uDeep.value.setRGB(...P.deep); wu.uHor.value.copy(hor); wu.uZen.value.copy(zen);
    const lDir = sunUp > .01 ? sunDir : moonDir; wu.uLDir.value.copy(lDir);
    wu.uLCol.value.setRGB(1, .9, .75).multiplyScalar(sunUp * (1 - stormy)).add(new THREE.Color(.5, .6, .9).multiplyScalar(moonUp * night * .6));
    wu.uFoam.value = lerp(.5, .8, day); wu.uGlow.value = .15 + night * .75; wu.uCaps.value = clamp((this.cur.wind - .2) * 1.6);
    // v12: свечение основания островов и ореолы цветов/кораллов («люмен») — ночью и в сумерки, в метрах мира
    this.uIsle.value = smooth(.6, .1, day) * .55; this.uIsleCol.value.setRGB(...P.sh);
    this.uGlowK.value = smooth(.6, .1, day) * (1 - this.cur.fog * .5);
    for (const h of this.halos || []) h.visible = this.uGlowK.value > .01;
    // неон: ночью и в сумерки — сильно (светится всё яркое), днём мягче и только самое яркое — иначе засвечивает песок
    this.postMat.uniforms.uNeon.value = lerp(.95, .45, day); this.postMat.uniforms.uThr.value = lerp(.3, .62, day);
    this.uT.value = t; this.uWind.value = .04 + this.cur.wind * .22; this.uRimK.value = lerp(1.5, .65, day);   // светящийся контур животных (v11: ярче)
    if (this.moteMat) this.moteMat.uniforms.uK.value = lerp(1, .3, day);
    if (this.plankton) { this.plankton.uniforms.uK.value = smooth(.6, .1, day) * 1.3; this.fireflies.uniforms.uK.value = smooth(.5, .05, day) * (1 - this.cur.rain); }
    if (this.mothMat) this.mothMat.uniforms.uK.value = smooth(.5, .05, day) * (1 - this.cur.rain);   // v23: мотыльки — как светлячки
    // v24: днём светлячков, мотыльков и ближнего планктона не видно (uK = 0) — и не рисуем
    for (const p of this.glowPts || []) p.visible = p.material.uniforms.uK.value > .002;
    if (this.mothMesh) this.mothMesh.visible = this.mothMat.uniforms.uK.value > .002;
    if (this.farPlankton) this.farPlankton.uniforms.uK.value = (lerp(.18, 1.2, smooth(.75, .1, day)) + dusk * .4) * (1 - this.cur.fog * .7);
    if (this.foamMat) this.foamMat.uniforms.uWave.value = this.cur.wave;

    // облака: по ветру, в шторм больше и серее
    const cover = .3 + this.cur.weather * .5 + this.cur.rain * .4, wind = 1 + this.cur.wind * 8;
    const cCol = new THREE.Color().setScalar(lerp(1, .55, stormy)).lerp(new THREE.Color(1, .72, .6), dusk * .5 * day);
    const cEm = cCol.clone().multiplyScalar(lerp(.1, .6, day)).lerp(new THREE.Color(...P.hor), .25);
    for (const c of this.clouds) {
      const u = c.userData;
      c.visible = u.k < cover;
      c.position.x += dt * wind; if (c.position.x > 450) c.position.x -= 900;
      u.mat.color.copy(cCol); u.mat.emissive.copy(cEm);
      u.mat.opacity = .5 * smooth(u.w * .6, u.w * 1.8, c.position.distanceTo(this.camera.position)); u.pre.visible = u.mat.opacity > .03;   // вплотную к камере — тает
    }
    for (const m of this.palms || []) this._swayPalms(m, t);

    this.flashV = Math.max(0, (this.flashV || 0) - dt * 2.6); this.flashEl.style.opacity = (this.flashV * .4).toFixed(3);
    const ru = this.rain.material.uniforms; ru.uTime.value = t; ru.uAmt.value = this.cur.rain; ru.uSlant.value = .18 + this.cur.wind * .35;

    this._stepFollow(dtc); this._stepFly(dtc); this._followChip();
    if (!this._drag) this._idle += dtc;
    // v24: облёт — через 20 с покоя (было 12); облётом ведёт кадр сам (азимут, высота, точка взгляда), не autoRotate
    const spin = !this._follow && !this._fly && !this.paused && !this._freeCam && this._idle > 20;
    this.controls.autoRotate = false;
    if (spin) {
      // v24 (по видео автора, середина между прежним облётом и видео): низко над водой (17°) — горизонт и небо в кадре, оборот
      // 165 с вокруг главного острова, расстояние ~100 м мягко «дышит». Риф: когда камера проходит над его стороной
      // (+z, дуга 82 м), точка взгляда плавно переходит на ближний к камере участок рифа, камера подходит к нему (~48 м) и
      // смотрит круче — риф виден сквозь воду в середине кадра, остров у верхнего края; дальше так же плавно обратно.
      // Подбор на глаз: ?h= — угол над водой (градусы), ?turn= — секунд на оборот
      const qs = this._orbQ ??= new URLSearchParams(location.search), H = (+qs.get('h') || 17) * Math.PI / 180, TURN = +qs.get('turn') || 165;   // выбор автора 03.10: 17° и 165 с
      this._spinQA ??= qs.has('spinqa');   // QA: сразу в кадр облёта
      const tg0 = this.controls.target, cam0 = this.camera.position;
      if (!this._spun) this._orbA = Math.atan2(cam0.x, cam0.z);   // облёт продолжается оттуда, где камеру отпустили
      this._orbA -= dt * 2 * Math.PI / TURN; this._orbA = Math.atan2(Math.sin(this._orbA), Math.cos(this._orbA));   // в ту же сторону, что и прежний облёт
      const a = this._orbA, w = smooth(.3, .92, Math.cos(a)), ar = clamp(a, -.75, .75);
      // высота точки взгляда — плавно от середины острова к воде над рифом (границы точки обзора ниже на облёте не действуют:
      // на склонах они дёргали её вверх-вниз — рывки камеры)
      this._orbC ??= Math.max(4, islandH(0, 0) + .6);
      const T = new V3(Math.sin(ar) * 82 * w, this._orbC * (1 - w), Math.cos(ar) * 82 * w);
      const D = lerp(100 * (1 + .15 * Math.sin(this.clock * .09)), 48, w), e = lerp(H, .52, w);
      const C = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(D).add(T);
      // вход в облёт и любые расхождения — плавно (~2.5 с), без рывка
      const k = this._spinQA ? 1 : 1 - Math.exp(-dt * .4);
      tg0.lerp(T, k); cam0.lerp(C, k);
    }
    this._spun = spin;
    this.controls.update(dtc);
    this._qaLook();
    // границы (v13 свободнее): точка обзора — в пределах 150 м от острова (островки, риф, звери вокруг), по высоте — от
    // рельефа до 30 м; возвращается плавно, камера сдвигается вместе с ней (вид не меняется). Было: 42 м и потолок 8 м,
    // а на вершинах выше 8 м «потолок» и «не ниже рельефа» спорили: точку тянуло вниз вместе с камерой, а вверх — одну,
    // и камера каждый кадр оседала к острову («сама зумит, потом не оторвать»)
    const tg = this.controls.target, cam = this.camera.position;
    if (!this._freeCam && !this._follow && !spin) {
      const want = tg.clone(), hr = Math.hypot(tg.x, tg.z);
      if (hr > 150) { want.x *= 150 / hr; want.z *= 150 / hr; }
      want.y = clamp(want.y, Math.max(0, hq(want.x, want.z) + .5), 30);
      const off = want.sub(tg).multiplyScalar(1 - Math.exp(-dtc * 4)); tg.add(off); cam.add(off);
    }
    // камера — не под воду и не сквозь остров
    const floor = Math.max(1.5, hq(cam.x, cam.z) + 1.5); if (cam.y < floor) cam.y = floor;
    // небо, звёзды, солнце, луна — вокруг камеры: у мира нет края, куда можно «выехать»
    this.sky.position.copy(cam); this.stars.position.copy(cam);
    this.sunGlow.position.add(cam); this.sunDisc.position.add(cam); this.moon.position.add(cam);
    const WC = 10000 / this.waterN; this.water.position.x = Math.round(cam.x / WC) * WC; this.water.position.z = Math.round(cam.z / WC) * WC;
    this._day = day;
    // общий такт стай (v14: дельфины на ночном отдыхе кружат втрое медленнее)
    const dRest = [...this.agents.values()].some(q => q.sp === 'dolphin' && q.st === 'rest');
    this.podRun = { dolphin: (this.podRun?.dolphin ?? 0) + dt * (dRest ? .15 : .45), orca: (this.podRun?.orca ?? 0) + dt * .35 };
    for (const o of this.agents.values()) this._stepAgent(o, dt);
    this._separate(dt);
    this._nearSounds(dt);
    if (this.shoals) this._stepAmbient(dt, t);
    this._floraAvoid(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) if (!this.fx[i](dt)) this.fx.splice(i, 1);
    this._updateHover(dtc); this._stepLog(dt);
    this.renderer.setRenderTarget(this.rt); this.renderer.render(this.scene, this.camera);
    const ri = this.renderer.info.render; this.drawn = { calls: ri.calls, tris: ri.triangles + ri.points + ri.lines };   // v24: для ?debug=1
    this.renderer.setRenderTarget(null); this.renderer.render(this.postScene, this.postCam);
    return P;
  }

  hud() {
    $('#v-weather').textContent = this.weatherLabel; $('#v-time').textContent = this.timeLabel || '--:--';
    const setBar = (id, v, txt) => { $('#b-' + id).style.width = (clamp(v) * 100).toFixed(0) + '%'; $('#v-' + id).textContent = txt; };
    setBar('wind', this.cur.wind, (this.cur.wind * 25).toFixed(0) + ' М/С');
    setBar('wave', this.cur.wave, (this.cur.wave * 4.5).toFixed(1) + ' М');
    setBar('temp', this.cur.temp, (4 + this.cur.temp * 22).toFixed(0) + '°');
    const now = performance.now(); while (this.recent.length && now - this.recent[0] > 30000) this.recent.shift();
    const act = clamp(this.recent.length / 30); setBar('act', act, (act * 100).toFixed(0) + '%');
    setBar('ten', this.cur.tension, this.cur.tension.toFixed(2));
    const N = { hatchling: 'Черепашата', seagull: 'Чайки', tern: 'Крачки', cormorant: 'Бакланы', pelican: 'Пеликаны', albatross: 'Альбатросы', dolphin: 'Дельфины', whale: 'Киты', orca: 'Косатки', shark: 'Акулы', sea_lion: 'Морские львы', fish_school: 'Косяки',
      sea_turtle: 'Черепахи', stingray: 'Скаты', jellyfish: 'Медузы', octopus: 'Осьминоги', shrimp_swarm: 'Рои креветок', crab: 'Крабы', starfish: 'Морские звёзды',
      ship: 'Пароходы' };
    const html = Object.entries(N).filter(([k]) => this.census[k])
      .map(([k, v]) => `<div class="cs${this._follow?.sp === k ? ' on' : ''}" data-sp="${k}" title="Показать"><b>${this.census[k]}</b>${v}</div>`).join('') || '—';
    if (html !== this._censusHTML) { this._censusHTML = html; $('#census-body').innerHTML = html; }   // без лишней перерисовки — не срывает нажатие
  }
}
