// прогон ?bench=1 на ПК в виде телефона (801×373 ×3.375, сенсор): node benchpc.mjs <адрес> [cpu-замедление] [снимок]
import { launch, phone, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const [url, cpu = '1', shot = ''] = process.argv.slice(2);
const s = await launch({ gpu: true });
await phone(s, { w: 801, h: 373, dpr: 3.375, sw: 843, sh: 374 });
if (+cpu > 1) await s.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
await s.goto(`${url}?bench=1&noaudio=1&seed=7&rseed=7`);
await s.until('document.querySelector("#gate-btn")', 60000); await sleep(1500);
await s.tapSel('#gate-btn').catch(() => s.eval("document.getElementById('gate-btn')?.click()"));
await s.until('[...document.querySelectorAll("pre")].some(p => p.textContent.includes("пустая сцена"))', 900000, 2000);
const txt = await s.eval('[...document.querySelectorAll("pre")].find(p => p.textContent.includes("пустая сцена")).textContent');
console.log(txt);
if (shot) await s.shot(shot);
writeFileSync(`bench_pc_cpu${cpu}.txt`, txt);
s.close(); process.exit(0);
