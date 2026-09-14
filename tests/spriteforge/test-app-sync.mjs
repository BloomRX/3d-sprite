/*
 * Testa a sincronização slider <-> campo digitado do app.js.
 *
 * Não roda no navegador (não há como aqui), então o teste executa o BLOCO REAL do
 * app.js — extraído do arquivo pelo texto — contra um DOM mínimo que imita o
 * comportamento do <input type=range> do navegador (clamp + encaixe no passo).
 * Se o bloco mudar de forma, o teste falha em vez de testar outra coisa.
 *
 *   node tests/spriteforge/test-app-sync.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- pega o bloco REAL do app.js (o código que vai pro usuário, não uma cópia) ---
const src = readFileSync(
  fileURLToPath(new URL('../../spriteforge/app/app.js', import.meta.url)), 'utf8'
);
const inicio = src.indexOf('const ANGULOS = new Set');
const fim = src.indexOf("\n}", src.indexOf("num.addEventListener('change', () => commit(true));", inicio)) + 2;
const bloco = src.slice(inicio, fim);
if (!bloco.includes('dataset.baseMax') || !bloco.includes('range.max = String(acima ? raw : baseMax)')) {
  console.log('FALHA: o bloco extraído não é o esperado'); process.exit(1);
}

// --- DOM mínimo que se comporta como <input type=range> do navegador ---
class El {
  constructor({ min, max, step, value, kind }) {
    this.min = String(min); this.max = String(max); this.step = String(step);
    this._v = String(value); this.kind = kind; this.dataset = {}; this.handlers = {};
  }
  get value() { return this._v; }
  set value(v) {
    let n = Number(v);
    if (!Number.isFinite(n)) return;
    if (this.kind === 'range') {                       // o browser clampa E encaixa no passo
      n = Math.min(Number(this.max), Math.max(Number(this.min), n));
      if (this.step !== 'any') {
        const p = Number(this.step) || 1;
        n = Number(this.min) + Math.round((n - Number(this.min)) / p) * p;
        n = Math.round(n * 1e6) / 1e6;
      }
    }
    this._v = String(n);
  }
  addEventListener(t, fn) { (this.handlers[t] ??= []).push(fn); }
  dispatchEvent(ev) { for (const fn of (this.handlers[ev.type] ?? [])) fn(ev); }
}
class Event { constructor(type) { this.type = type; } }

const spec = {
  rngElevation: [-10, 89, 1, 18], rngAzimuth: [0, 359, 1, 0], rngFrames: [1, 32, 1, 12],
  rngCell: [16, 512, 8, 128], rngPadding: [0, 8, 1, 0], rngScaleLock: [0.05, 64, 0.05, 8],
  rngFps: [1, 30, 1, 12], rngZoom: [1, 8, 1, 1], rngLightAz: [0, 359, 1, 34], rngLightInt: [0, 5, 0.1, 2.6]
};
const el = {};
for (const [k, [mn, mx, st, v]] of Object.entries(spec)) el[k] = new El({ min: mn, max: mx, step: st, value: v, kind: 'range' });
for (const [, numKey] of [['rngElevation','elevationVal'],['rngAzimuth','azimuthVal'],['rngFrames','framesVal'],['rngCell','cellVal'],['rngPadding','paddingVal'],['rngScaleLock','scaleLockVal'],['rngFps','fpsVal'],['rngZoom','zoomVal'],['rngLightAz','lightAzVal'],['rngLightInt','lightIntVal']]) {
  const [mn, mx, st, v] = spec[{'elevationVal':'rngElevation','azimuthVal':'rngAzimuth','framesVal':'rngFrames','cellVal':'rngCell','paddingVal':'rngPadding','scaleLockVal':'rngScaleLock','fpsVal':'rngFps','zoomVal':'rngZoom','lightAzVal':'rngLightAz','lightIntVal':'rngLightInt'}[numKey]];
  el[numKey] = new El({ min: mn, max: mx, step: st, value: v, kind: 'number' });
}
const NUMERIC_PAIRS = [['rngElevation','elevationVal'],['rngAzimuth','azimuthVal'],['rngFrames','framesVal'],['rngCell','cellVal'],['rngPadding','paddingVal'],['rngScaleLock','scaleLockVal'],['rngFps','fpsVal'],['rngZoom','zoomVal'],['rngLightAz','lightAzVal'],['rngLightInt','lightIntVal']];

new Function('el', 'NUMERIC_PAIRS', 'Event', bloco)(el, NUMERIC_PAIRS, Event);
const digitar = (id, v) => { el[id].value = v; el[id].dispatchEvent(new Event('input')); };
const sair = (id) => el[id].dispatchEvent(new Event('change'));
const arrastar = (r, v) => { el[r].value = v; el[r].dispatchEvent(new Event('input')); };
const soltar = (r) => el[r].dispatchEvent(new Event('change'));

let fail = 0;
const ok = (c, m) => { if (!c) { console.log('FALHA:', m); fail++; } else console.log('  ok —', m); };

digitar('cellVal', '1024'); sair('cellVal');
ok(el.rngCell.value === '1024', `célula 1024 chega no slider (que o gerador lê): ${el.rngCell.value}`);
ok(el.cellVal.value === '1024', `o campo continua mostrando 1024: ${el.cellVal.value}`);
digitar('framesVal', '60'); sair('framesVal');
ok(el.rngFrames.value === '60', `60 frames no slider: ${el.rngFrames.value}`);
digitar('fpsVal', '60'); sair('fpsVal');
ok(el.rngFps.value === '60', `60 fps no slider: ${el.rngFps.value}`);
digitar('zoomVal', '16'); sair('zoomVal');
ok(el.rngZoom.value === '16', `zoom 16 no slider: ${el.rngZoom.value}`);
digitar('scaleLockVal', '200'); sair('scaleLockVal');
ok(el.rngScaleLock.value === '200', `escala 200 no slider: ${el.rngScaleLock.value}`);
digitar('lightIntVal', '12'); sair('lightIntVal');
ok(el.rngLightInt.value === '12', `intensidade 12 no slider: ${el.rngLightInt.value}`);
digitar('elevationVal', '200'); sair('elevationVal');
ok(el.rngElevation.value === '89' && el.elevationVal.value === '89', `ângulo continua clampado em 89: ${el.elevationVal.value}`);
digitar('azimuthVal', '400'); sair('azimuthVal');
ok(el.rngAzimuth.value === '359', `azimute clampado em 359: ${el.rngAzimuth.value}`);
digitar('cellVal', '7'); sair('cellVal');
ok(el.rngCell.value === '16', `mínimo continua valendo (7 -> 16): ${el.rngCell.value}`);
arrastar('rngCell', 256);
ok(el.cellVal.value === '256', `arrastar o slider atualiza o campo: ${el.cellVal.value}`);
soltar('rngCell');
ok(el.rngCell.max === '512', `soltar o slider devolve o teto de fábrica: max=${el.rngCell.max}`);
ok(el.rngCell.step === '8', `e o passo volta a 8: step=${el.rngCell.step}`);
digitar('cellVal', '1000');
ok(el.cellVal.value === '1000' && el.rngCell.value === '1000', `digitar não é sobrescrito no meio: campo=${el.cellVal.value} slider=${el.rngCell.value}`);
digitar('cellVal', '3');
ok(el.cellVal.value === '3', `digitar "3" a caminho de "300" não é podado pra 16: ${el.cellVal.value}`);

// setPair (usado por applySettings / presets) — precisa aceitar 1024 também
const setPairSrc = bloco.slice(bloco.indexOf('function setPair'), bloco.indexOf('for (const [rangeKey, numKey] of NUMERIC_PAIRS)'));
const el2 = {}; for (const k of Object.keys(el)) el2[k] = el[k];
new Function('el', 'ANGULOS', setPairSrc)(el2, new Set(['elevationVal','azimuthVal','lightAzVal']));
new Function('el','NUMERIC_PAIRS','Event', bloco)(el2, NUMERIC_PAIRS, Event);
el2.rngCell.max = '512'; el2.rngCell.step = '8';
new Function('el', 'ANGULOS', 'setPair', 'void 0;')({}, new Set(), () => {});
const aplicar = new Function('el', 'ANGULOS', setPairSrc + '; return setPair;')(el2, new Set(['elevationVal','azimuthVal','lightAzVal']));
aplicar('rngCell', 'cellVal', 1024);
ok(el2.rngCell.value === '1024' && el2.cellVal.value === '1024', `preset/ajuste com 1024 sobrevive: slider=${el2.rngCell.value} campo=${el2.cellVal.value}`);
aplicar('rngCell', 'cellVal', 128);
ok(el2.rngCell.value === '128' && el2.rngCell.max === '512', `voltar a 128 devolve o teto: max=${el2.rngCell.max}`);

const total = 17;
console.log(fail === 0
  ? `\n${total} passou, 0 falhou — sync slider/campo digitado do app.js`
  : `\n${total - fail} passou, ${fail} falhou`);
process.exit(fail === 0 ? 0 : 1);
