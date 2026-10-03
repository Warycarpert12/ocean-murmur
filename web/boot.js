// v24: ход загрузки и «лёгкий» режим. На слабых телефонах вход висел на «Открываю иллюминатор…» бесконечно: кнопка ждала,
// пока скачаются и распакуются 20 записей (~265 МБ распакованного звука) — без предела времени. Теперь у каждого шага
// загрузки есть время и итог (экран входа показывает ход, ?debug=1 — все шаги), а within() не даёт шагу держать вход.
const qs = new URLSearchParams(location.search);

export const steps = [];   // { name, t0, t1, st: 'идёт' | 'готово' | 'ошибка' | 'долго', note }
export const boot = { steps, t0: performance.now(), onChange: null };
const changed = () => { try { boot.onChange?.(); } catch { /* подпись входа — не главное */ } };
export function step(name) {
  const s = { name, t0: performance.now(), t1: 0, st: 'идёт', note: '' }; steps.push(s); changed();
  return {
    note(t) { s.note = t; changed(); },
    done(ok = true, why = '') { if (s.t1) return; s.t1 = performance.now(); s.st = ok === 'long' ? 'долго' : ok ? 'готово' : 'ошибка'; if (why) s.note = why; changed(); },
  };
}
// предел времени: по истечении — отказ с e.timeout; само обещание может ещё завершиться, его просто больше не ждут
export const within = (p, ms, what = 'шаг') => new Promise((res, rej) => {
  const t = setTimeout(() => rej(Object.assign(new Error(`${what}: дольше ${ms / 1000} с`), { timeout: true })), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
});

// устройство. navigator.deviceMemory (ГБ, округлено: 0.25…8) есть только в Chrome/Edge/Samsung и других Chromium —
// в Safari и Firefox его нет: там память неизвестна (null), и решают другие признаки
const mem = navigator.deviceMemory;
export const device = {
  mem: mem > 0 ? mem : null,
  touch: matchMedia('(pointer: coarse)').matches,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
};

// «Лёгкое» качество — для устройств с малой памятью: включается само, если памяти ≤ 2 ГБ или прошлый вход не дошёл до
// мира (вкладку закрыло или вход завис), и вручную в настройках. Выбор человека в настройках важнее автоматики
const KEY = 'abyssonata.quality', BOOT = 'abyssonata.boot';
let saved = null, userPick = false, lastFailed = false;
try {
  saved = localStorage.getItem(KEY); userPick = localStorage.getItem(KEY + '.user') === '1';
  const b = +localStorage.getItem(BOOT); lastFailed = b > 0 && Date.now() - b < 3 * 864e5;
} catch { /* приватное окно */ }
export const lastBootFailed = lastFailed;
export const autoLite = (device.mem !== null && device.mem <= 2) || lastFailed;
export const startLite = qs.get('lite') === '1' || saved === 'lite' || (!userPick && autoLite);
// метка «вход начат» снимается, когда мир уже несколько секунд на экране (main.js) — осталась при следующей загрузке
// значит, вход не дошёл до конца
export const markBoot = on => { try { on ? localStorage.setItem(BOOT, String(Date.now())) : localStorage.removeItem(BOOT); } catch { /* приватное окно */ } };
