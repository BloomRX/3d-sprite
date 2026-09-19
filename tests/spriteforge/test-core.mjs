/**
 * Testes de core.js — a parte pura do SpriteForge (azimutes, poses, auto-fit,
 * pivot, layout, schemas, GIF, luzes, limpeza). Roda em Node puro:
 *
 *   node --import ./tests/spriteforge/register-three.mjs tests/spriteforge/test-core.mjs
 *
 * Zero dependências: o `three` importado aqui é EXATAMENTE o arquivo vendido em
 * spriteforge/app/vendor/, então o teste exercita a mesma biblioteca do
 * navegador. Nada abaixo toca em WebGL (o que exige GPU fica fora de alcance).
 */
import { readFile } from 'node:fs/promises';
import * as THREE from '../../spriteforge/app/vendor/three.module.js';
import * as i18n from '../../spriteforge/app/i18n.js';
import * as log from '../../spriteforge/app/log.js';
import * as pasta from '../../spriteforge/app/pasta.js';
import * as core from '../../spriteforge/app/core.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ok  - ${msg}`); }
  else { fail++; console.error(`  FALHA - ${msg}`); }
}
function approx(a, b, tol = 1e-6, msg = '') { ok(Number.isFinite(a) && Math.abs(a - b) < tol, `${msg} [${a} ~ ${b}]`); }

/* ---------------- azimutes, tempos, amostragem ---------------- */
approx(core.directionAzimuth(0, 8), 0, 1e-12, 'dir 0 de 8 = 0 rad (frente)');
approx(core.directionAzimuth(4, 8), Math.PI, 1e-12, 'dir 4 de 8 = PI (costas)');
approx(core.directionAzimuth(2, 4), Math.PI, 1e-12, 'dir 2 de 4 = PI');
approx(core.directionAzimuth(2, 16), Math.PI / 4, 1e-12, 'dir 2 de 16 = 45 graus');
approx(core.directionAzimuth(0, 8, 90), Math.PI / 2, 1e-12, 'offset "frente em" +90 gira a dir 0');
approx(core.directionAzimuth(1, 8, -45), Math.PI / 4 - Math.PI / 4, 1e-12, 'offset negativo também vale');
approx(core.turntableAzimuth(1, 8), -Math.PI / 4, 1e-12, 'turntable inverte o sentido');
approx(core.turntableAzimuth(1, 8, 45), -Math.PI / 2, 1e-12, 'turntable aplica o offset de frente');

const t = core.frameTimes(0.708, 12);
ok(t.length === 12, 'frameTimes: 12 quadros');
approx(t[0], 0, 1e-12, 'primeiro quadro em t=0');
approx(t[1] - t[0], 0.059, 1e-9, 'passo uniforme (0.708/12)');
approx(t[11] - t[10], t[1] - t[0], 1e-12, 'passo constante até o fim');
ok(t[11] < 0.708, 'último quadro antes do fim do clipe');
approx(t[11] + (t[1] - t[0]), 0.708, 1e-12, 'o passo seguinte fecharia o loop exatamente');
const tOpen = core.frameTimes(0.708, 12, false);
approx(tOpen[11], 0.708, 1e-12, 'sem loop perfeito o último quadro cai no fim');
ok(core.frameTimes(0, 12).length === 1, 'duração inválida devolve um quadro só');

ok(JSON.stringify(core.pickEven(12, 12)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 'pickEven(12,12) = tudo');
ok(core.pickEven(12, 6).length === 6, 'pickEven(12,6) = 6 amostras');
ok(core.pickEven(12, 6)[0] === 0 && core.pickEven(12, 6)[5] === 11, 'amostragem cobre as pontas');
ok(JSON.stringify(core.pickEven(12, 1)) === JSON.stringify([0]), 'pickEven(12,1) = [0] (sem NaN)');
ok(core.pickEven(1, 6).length === 1, 'pickEven(1,6) = [0]');

/* ---------------- poses ---------------- */
const fakeModel = { animations: [], update: () => {}, updateMatrixWorld: () => {} };
const poses = core.buildPoses({ directionCount: 8, frameCount: 12, times: t, model: fakeModel, azimuthOffsetDeg: 30 });
ok(poses.length === 96, '8 direcoes x 12 quadros = 96 poses');
ok(poses[0].dir === 0 && poses[0].frame === 0 && poses[95].dir === 7 && poses[95].frame === 11, 'ordem: linha = direcao, coluna = quadro');
approx(poses[0].modelAzimuth, THREE.MathUtils.degToRad(30), 1e-12, 'offset de frente aplicado ao modelo');
approx(poses[1].modelAzimuth, THREE.MathUtils.degToRad(30), 1e-12, 'mesma direcao, mesmo azimute');
approx(poses[12].modelAzimuth, THREE.MathUtils.degToRad(75), 1e-12, 'dir 1 = 45 + offset');
ok(poses.every((p) => p.camAzimuth === 0), 'modelo girando: câmera parada');
ok(poses.every((p) => p.model === fakeModel), 'todas as poses carregam o modelo');
approx(poses[1].time, t[1], 1e-12, 'pose guarda o tempo do quadro');
const posesTT = core.buildPoses({ directionCount: 8, frameCount: 12, times: t, model: fakeModel, turntable: true });
approx(posesTT[12].camAzimuth, -Math.PI / 4, 1e-12, 'turntable: a câmera orbita (dir 1)');
ok(posesTT.every((p) => p.modelAzimuth === 0), 'turntable: o modelo não gira');
const sub = core.fitPoses(poses, { maxFrames: 6, maxDirections: 4 });
ok(sub.length === 24, `fitPoses amostra 4x6 = 24 poses (${sub.length})`);
ok(new Set(sub.map((p) => p.dir)).size === 4 && new Set(sub.map((p) => p.frame)).size === 6, 'amostra espalhada em 4 direcoes e 6 quadros');
ok(core.fitPoses(poses, { maxFrames: 12, maxDirections: 8 }).length === 96, 'sem subamostragem volta tudo');

/* ---------------- auto-fit com o modelo de verdade ---------------- */
globalThis.self = globalThis;
globalThis.ProgressEvent = class ProgressEvent extends Event {
  constructor(type, init = {}) { super(type); Object.assign(this, init); }
};
globalThis.document = { createElementNS: () => ({}) };
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
const buf = await readFile(new URL('../../spriteforge/app/samples/fox.glb', import.meta.url));
const { GLTFLoader } = await import('../../spriteforge/app/vendor/GLTFLoader.js');
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const fox = gltf.scene;
ok(core.prepareLoaded(fox, { doubleSide: false }).computedNormals >= 1, 'Fox recebe normal calculada (o GLB não traz NORMAL)');
ok(gltf.animations.length === 3, `Fox tem 3 clipes (${gltf.animations.map((a) => a.name).join(', ')})`);
const walk = gltf.animations.find((a) => a.name === 'Walk');
approx(walk.duration, 0.7083333, 1e-5, 'duração do clipe Walk');
const mixer = new THREE.AnimationMixer(fox);
mixer.clipAction(walk).play();
const applyPose = (p) => {
  fox.rotation.y = p.modelAzimuth;
  mixer.setTime(p.time);
  fox.updateMatrixWorld(true);
};

const foxPoses = core.buildPoses({ directionCount: 8, frameCount: 12, times: t, model: fox });
const fit = core.measureFit(foxPoses, applyPose, { elevationDeg: 18 });
ok(fit && Number.isFinite(fit.half) && fit.half > 0, `auto-fit devolve half finito (${fit.half.toFixed(4)})`);
ok(fit.samples === 96, 'mede as 96 poses');
approx(fit.half, fit.maxAbsX > fit.maxAbsY ? fit.maxAbsX / core.SCALE_FIX : fit.maxAbsY / core.SCALE_FIX, 1e-9, 'half = maxAbs / 0.86');
ok(fit.bounds.minX < 0 && fit.bounds.maxX > 0 && fit.bounds.minY < 0 && fit.bounds.maxY > 0, 'bounds assinados atravessam os dois eixos');
ok(fit.bounds.maxY - fit.bounds.minY > 0, 'bounds têm altura positiva');

// Passo 2 do auto-fit: com a câmera já enquadrada, nenhuma pose pode estourar.
const camFit = core.createOrthoCamera({ half: fit.half, center: fit.center, elevationDeg: 18, azimuthRad: 0, distance: fit.half * 6 + 1 });
const box = new THREE.Box3();
const corner = new THREE.Vector3();
let worst = 0;
for (const p of foxPoses) {
  applyPose(p);
  box.setFromObject(fox, true);
  core.placeCamera(camFit, fit.center, p.camAzimuth, 18, fit.half * 6 + 1);
  const view = camFit.matrixWorldInverse;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(view);
    worst = Math.max(worst, Math.abs(corner.x), Math.abs(corner.y));
  }
}
ok(worst <= fit.half + 1e-9, `nenhuma pose estoura a célula (pior ${worst.toFixed(4)} <= ${fit.half.toFixed(4)})`);
ok(worst / fit.half > 0.5, `enquadramento não fica frouxo (${((worst / fit.half) * 100).toFixed(1)}% da célula)`);
const fitTurn = core.measureFit(
  core.buildPoses({ directionCount: 8, frameCount: 12, times: t, model: fox, turntable: true }),
  applyPose, { elevationDeg: 18 }
);
ok(Math.abs(fitTurn.half - fit.half) > 1e-3, `turntable mede diferente de modelo girando (${fitTurn.half.toFixed(4)} vs ${fit.half.toFixed(4)})`);
const fitHigh = core.measureFit(foxPoses, applyPose, { elevationDeg: 89 });
ok(Number.isFinite(fitHigh.half) && fitHigh.half > 0, `auto-fit funciona a 89 graus (half ${fitHigh.half.toFixed(4)})`);
ok(core.measureFit([core.buildPoses({ directionCount: 1, frameCount: 1, times: [0], model: new THREE.Object3D() })[0]], () => {}, { elevationDeg: 0 }) === null, 'modelo vazio devolve null');

/* ---------------- amostra estática (sem animação) ---------------- */
const objText = await readFile(new URL('../../spriteforge/app/samples/crate.obj', import.meta.url), 'utf8');
const { OBJLoader } = await import('../../spriteforge/app/vendor/OBJLoader.js');
const crate = new OBJLoader().parse(objText);
ok(core.formatOf('crate.obj') === 'obj' && !core.supportsAnimation('crate.obj'), 'crate.obj: OBJ sem animação');
const cratePrep = core.prepareLoaded(crate, { doubleSide: true });
ok(cratePrep.computedNormals === 0, 'as normais do OBJ já vêm no arquivo (nada recalculado)');
let crateTris = 0;
crate.traverse((o) => { if (o.isMesh) crateTris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; });
ok(crateTris === 12, `caixote tem 12 triângulos (${crateTris})`);
const crateBox = new THREE.Box3().setFromObject(crate, true);
approx(crateBox.max.y - crateBox.min.y, 1, 1e-6, 'caixote tem 1 unidade de altura');
approx(crateBox.min.y, 0, 1e-6, 'caixote apoiado em y=0 (pivot base faz sentido)');
const cratePoses = core.buildPoses({ directionCount: 4, frameCount: 1, times: [0], model: crate });
ok(cratePoses.length === 4, 'sem animação: 1 frame por direção (4 poses)');
const crateFit = core.measureFit(cratePoses, (p) => { crate.rotation.y = p.modelAzimuth; crate.updateMatrixWorld(true); }, { elevationDeg: 0 });
approx(crateFit.half, 0.5 / core.SCALE_FIX, 1e-6, 'half do caixote = 0.5 / 0.86');
ok(crateFit.samples === 4, 'mede as 4 direções');

/* ---------------- pivot / enquadramento ---------------- */
const fCenter = core.frameForPivot(fit.bounds, 'center');
const fBase = core.frameForPivot(fit.bounds, 'base');
const fTop = core.frameForPivot(fit.bounds, 'top');
ok(fBase.cy >= fCenter.cy && fTop.cy <= fCenter.cy, 'pivot base sobe o alvo (modelo desce na tela), topo desce o alvo');
approx(fBase.half, fCenter.half, 1e-12, 'o half é o mesmo para qualquer pivot (nunca corta o modelo)');
approx(fit.frame.cx, fCenter.cx, 1e-9, 'measureFit já devolve o frame central');
approx(core.pivotPoint('center').y, 0.5, 1e-12, 'pivot centro = 0.5');
ok(core.pivotPoint('base').y > 0.9 && core.pivotPoint('base').y < 1, `pivot base perto da borda de baixo (${core.pivotPoint('base').y})`);
ok(core.pivotPoint('top').y > 0 && core.pivotPoint('top').y < 0.1, 'pivot topo perto da borda de cima');
ok(core.pivotPoint('qualquer').x === 0.5 && core.pivotPoint('qualquer').y === 0.5, 'pivot desconhecido cai no centro');

function ndcY(cam, bb) {
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const a = new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z).applyMatrix4(m).y;
  const b = new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z).applyMatrix4(m).y;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
applyPose({ modelAzimuth: 0, time: 0 });
const boxFox = new THREE.Box3().setFromObject(fox, true);
const framed = (f) => core.createFramedCamera({ half: f.half, center: fit.center, cx: f.cx, cy: f.cy, elevationDeg: 0, azimuthRad: 0, distance: f.half * 6 + 1 });
const yCenter = ndcY(framed(fCenter).camera, boxFox);
const yBase = ndcY(framed(fBase).camera, boxFox);
ok(yBase.lo >= -core.SCALE_FIX - 1e-9, `pivot base não corta a base (NDC ${yBase.lo.toFixed(3)})`);
ok(yBase.lo <= yCenter.lo + 1e-9, `pivot base empurra o modelo para baixo ou mantém (base ${yBase.lo.toFixed(3)} <= centro ${yCenter.lo.toFixed(3)})`);
const yTop = ndcY(framed(fTop).camera, boxFox);
ok(yTop.hi <= core.SCALE_FIX + 1e-9, `pivot topo não corta o topo (NDC ${yTop.hi.toFixed(3)})`);
ok(yTop.hi >= yCenter.hi - 1e-9, `pivot topo empurra o modelo para cima ou mantém (topo ${yTop.hi.toFixed(3)} >= centro ${yCenter.hi.toFixed(3)})`);
approx((yCenter.lo + yCenter.hi) / 2, 0, 0.02, 'pivot centro: modelo centralizado');
ok(yBase.hi <= 1 + 1e-9 && yTop.lo >= -1 - 1e-9 && yBase.lo >= -1 - 1e-9 && yTop.hi <= 1 + 1e-9, 'nenhum pivot corta o modelo');
// Semântica do pivot num caso com FOLGA vertical (modelo mais largo que alto):
// aí a âncora tem de encostar mesmo na borda útil, e é isso que diferencia
// base/centro/topo na prática.
const wide = { minX: -10, maxX: 10, minY: -1, maxY: 1 };
const wBase = core.frameForPivot(wide, 'base');
const wTop = core.frameForPivot(wide, 'top');
const wMid = core.frameForPivot(wide, 'center');
approx(wBase.half, wMid.half, 1e-12, 'o half não muda com o pivot (nunca corta)');
approx((wide.minY - wBase.cy) / wBase.half, -core.SCALE_FIX, 1e-12, 'pivot base: a base encosta em -0.86');
approx((wide.maxY - wTop.cy) / wTop.half, core.SCALE_FIX, 1e-12, 'pivot topo: o topo encosta em +0.86');
ok(wBase.cy > wMid.cy && wTop.cy < wMid.cy, 'base sobe o alvo, topo desce');
ok(wBase.cy > 0 && wTop.cy < 0, `alvo deslocado na direção certa (base ${wBase.cy.toFixed(3)}, topo ${wTop.cy.toFixed(3)})`);
approx(core.PIVOT_MARGIN, (1 - core.SCALE_FIX) / 2, 1e-12, 'PIVOT_MARGIN derivado do SCALE_FIX');
approx(core.pivotPoint('base').y, (1 + core.SCALE_FIX) / 2, 1e-12, 'pivot do metadata bate com o pixel da borda útil');
// O pivot é aplicado uma vez e a câmera é reposicionada por pose, então o
// resultado não pode depender do azimute. A elevação 0 torna isso mensurável:
// girar em torno de Y não muda as coordenadas Y do modelo, então o centro
// projetado tem de ser exatamente o mesmo em qualquer direção.
const yRef = ndcY(framed(fBase).camera, boxFox);
for (const az of [Math.PI / 2, Math.PI, -Math.PI / 3, 2.4]) {
  const cam = core.createFramedCamera({ half: fBase.half, center: fit.center, cx: fBase.cx, cy: fBase.cy, elevationDeg: 0, azimuthRad: az, distance: fBase.half * 6 + 1 });
  const y = ndcY(cam.camera, boxFox);
  approx((y.lo + y.hi) / 2, (yRef.lo + yRef.hi) / 2, 1e-6, `pivot idêntico no azimute ${az.toFixed(2)} (turntable)`);
}
const plain = core.createOrthoCamera({ half: fBase.half, center: fit.center, elevationDeg: 0, azimuthRad: 0, distance: fBase.half * 6 + 1 });
core.applyPivotOffset(plain, { cx: fBase.cx, cy: fBase.cy, half: fBase.half });
ok(plain.left === fBase.cx - fBase.half && plain.top === fBase.cy + fBase.half, 'applyPivotOffset desloca o frustum');
const cam89 = core.createFramedCamera({ half: fBase.half, center: fit.center, cx: fBase.cx, cy: fBase.cy, elevationDeg: 89, azimuthRad: 0.3, distance: fBase.half * 6 + 1 });
ok(Number.isFinite(cam89.camera.position.y) && cam89.target.length() > 0, 'pivot funciona a 89 graus (sem NaN)');

/* ---------------- layout e padding ---------------- */
const layout = core.computeLayout(8, 12, 128);
ok(layout.cell === 128 && layout.cols === 12 && layout.rows === 8, 'layout 8 direcoes x 12 quadros');
ok(layout.w === 1536 && layout.h === 1024, `sheet 1536x1024 (${layout.w}x${layout.h})`);
ok(layout.padding === 0 && layout.warning === null, 'sem padding e sem aviso');
ok(core.cellRect(layout, 0, 0).x === 0 && core.cellRect(layout, 0, 0).y === 0, 'célula (0,0) na origem');
ok(core.cellRect(layout, 0, 1).x === 128 && core.cellRect(layout, 1, 0).y === 128, 'passo de 128 px');
ok(core.cellRect(layout, 7, 11).x === 1408 && core.cellRect(layout, 7, 11).y === 896, 'última célula no canto');
const clamp = core.computeLayout(16, 64, 512);
ok(clamp.cell === 128 && clamp.w === 8192 && clamp.h <= 8192, `clamp 8192: célula ${clamp.cell}, sheet ${clamp.w}x${clamp.h}`);
ok(/reduzida/.test(clamp.warning || ''), 'clamp emite aviso');
const padded = core.computeLayout(8, 12, 128, 8192, 4);
ok(padded.w === 12 * 128 + 13 * 4, `padding entra na largura (${padded.w})`);
ok(padded.h === 8 * 128 + 9 * 4, `padding entra na altura (${padded.h})`);
ok(core.cellRect(padded, 0, 0).x === 4 && core.cellRect(padded, 0, 1).x === 136, 'retângulos respeitam o padding');
ok(core.cellRect(padded, 1, 0).y === 136, 'padding também entre linhas');
ok(core.computeLayout(8, 12, 128, 1000, 4).warning !== null, 'padding conta no limite de 8192');
ok(core.computeLayout(0, 0, 64).cols === 1 && core.computeLayout(0, 0, 64).rows === 1, 'layout degenerado vira 1x1');
ok(core.frameKey(0, 0) === 'dir00_001' && core.frameKey(7, 11) === 'dir07_012', 'frameKey com 2 e 3 dígitos, 1-based');

/* ---------------- schemas ---------------- */
const meta = core.buildMetadata({
  baseName: 'fox', layout, directionCount: 8, elevationDeg: 18, times: t,
  fps: 12, loop: true, ssaa: false, turntable: false, background: 'transparent',
  azimuthOffsetDeg: 0, pivot: 'base'
});
ok(JSON.stringify(Object.keys(meta)) === JSON.stringify(['tool', 'image', 'size', 'cell', 'grid', 'pivot', 'directions', 'animation', 'scale', 'render', 'shadow', 'frames']), 'chaves do metadata na ordem do schema');
ok(meta.image === 'fox_sheet.png', 'nome da sheet derivado do modelo');
ok(meta.size.w === 1536 && meta.size.h === 1024, 'bloco size');
ok(meta.cell.w === 128 && meta.cell.h === 128 && meta.cell.padding === 0, 'bloco cell com padding');
ok(meta.grid.cols === 12 && meta.grid.rows === 8, 'bloco grid');
ok(meta.pivot.y > 0.9 && meta.pivot.x === 0.5, 'pivot base exportado');
ok(meta.directions.count === 8 && meta.directions.angle_step_deg === 45 && meta.directions.angle_offset_deg === 0, 'bloco directions');
ok(meta.animation.frames.length === 12 && meta.animation.frames[0] === 0 && meta.animation.frames[1] === 59, 'tempos em ms (59 = round(0.059*1000))');
ok(meta.animation.fps === 12 && meta.animation.loop === true, 'fps e loop');
ok(meta.scale.locked === false && meta.scale.px_per_unit === null, 'scale livre por padrão');
ok(Object.keys(meta.frames).length === 96, '96 entradas em frames');
ok(meta.frames.dir00_001.frame.x === 0 && meta.frames.dir00_001.frame.y === 0, 'frame dir00_001 na origem');
ok(meta.frames.dir00_002.frame.x === 128, 'segundo quadro avança uma célula');
ok(meta.frames.dir01_001.frame.y === 128 && meta.frames.dir01_001.frame.x === 0, 'segunda linha = direção 1');
ok(meta.frames.dir07_012.frame.x === 1408 && meta.frames.dir07_012.frame.y === 896, 'último frame no canto');
ok(meta.frames.dir00_001.duration === 83, 'duração por frame em ms (1000/12)');
ok(meta.frames.dir00_001.trimmed === false && meta.frames.dir00_001.rotated === false, 'trimmed/rotated falsos');
ok(meta.shadow === null, 'sem a opção ligada, shadow vem null');
const metaSombra = core.buildMetadata({
  baseName: 'fox', layout, directionCount: 8, elevationDeg: 18, times: [0],
  shadow: { file: 'fox_Walk_shadow.png', layout: 'row-per-direction' }
});
ok(metaSombra.shadow.file === 'fox_Walk_shadow.png', 'camada de sombra registrada no metadata');
ok(metaSombra.shadow.layout === 'row-per-direction', 'a camada usa a mesma grade da sheet');
ok(Object.keys(metaSombra).indexOf('shadow') < Object.keys(metaSombra).indexOf('frames'), 'shadow vem antes de frames no schema');

const metaLock = core.buildMetadata({ baseName: 'a', layout, directionCount: 8, elevationDeg: 0, times: [0], lockScale: true, pxPerUnit: 8 });
ok(metaLock.scale.locked === true && metaLock.scale.px_per_unit === 8, 'escala travada registrada');
const metaPad = core.buildMetadata({ baseName: 'a', layout: padded, directionCount: 8, elevationDeg: 0, times: t });
ok(metaPad.cell.padding === 4 && metaPad.frames.dir00_002.frame.x === 136, 'padding propaga para os retângulos');
const metaOff = core.buildMetadata({ baseName: 'a', layout, directionCount: 8, elevationDeg: 0, times: [0], azimuthOffsetDeg: 45 });
ok(metaOff.directions.angle_offset_deg === 45, 'offset de frente registrado');

const ase = core.buildAsepriteJson(meta);
ok(Array.isArray(ase.frames) && ase.frames.length === 96, 'sidecar com 96 frames em array');
ok(ase.frames[0].frame.x === 0 && ase.frames[1].frame.x === 128 && ase.frames[12].frame.y === 128, 'ordem de leitura da sheet');
ok(ase.frames[0].duration === 83, 'duração no sidecar');
ok(ase.meta.size.w === 1536 && ase.meta.size.h === 1024, 'tamanho no sidecar');
ok(ase.meta.frameTags.length === 8 && ase.meta.frameTags[0].name === 'dir00', 'uma tag por direção');
ok(ase.meta.frameTags[0].from === 0 && ase.meta.frameTags[0].to === 11, 'tag dir00 cobre 0..11');
ok(ase.meta.frameTags[7].from === 84 && ase.meta.frameTags[7].to === 95, 'tag dir07 cobre 84..95');
ok(ase.meta.slices[0].name === 'pivot' && ase.meta.slices[0].keys[0].pivot.y === Math.round(meta.pivot.y * 128), 'anchor vira slice do Aseprite');
ok(ase.frames.every((f, i) => f.frame.x === Object.values(meta.frames)[i].frame.x), 'retângulos do sidecar idênticos aos do metadata');
const aseCenter = core.buildAsepriteJson(core.buildMetadata({ baseName: 'a', layout, directionCount: 8, elevationDeg: 0, times: [0] }));
ok(aseCenter.meta.slices[0].keys[0].pivot.x === 64 && aseCenter.meta.slices[0].keys[0].pivot.y === 64, 'pivot default = centro da célula (64,64)');

/* ---------------- GIF ---------------- */
const CELL = 64, N = 4;
const frames = [];
for (let f = 0; f < N; f++) {
  const rgba = new Uint8ClampedArray(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4;
      const dentro = x > 8 + f && x < 40 && y > 8 && y < 40;
      rgba[i] = dentro ? 20 + f * 30 : 0;
      rgba[i + 1] = dentro ? 120 : 0;
      rgba[i + 2] = dentro ? 220 : 0;
      rgba[i + 3] = dentro ? 255 : 0;
    }
  }
  frames.push(rgba);
}
const gif = core.encodeGif({ width: CELL, height: CELL, frames, delays: t.map(() => 1000 / 12), repeat: 0 });
ok(gif instanceof Uint8Array, 'encodeGif devolve Uint8Array');
ok(Buffer.from(gif.subarray(0, 6)).toString('ascii') === 'GIF89a', 'assinatura GIF89a');
const raw = Buffer.from(gif).toString('latin1');
ok((raw.match(/NETSCAPE2\.0/g) || []).length === 1, 'um bloco de loop NETSCAPE2.0');
ok(gif[gif.length - 1] === 0x3b, 'termina com o trailer 0x3B');
let gce = 0, transparent = 0, firstDelay = 0;
for (let i = 0; i < gif.length - 5; i++) {
  if (gif[i] === 0x21 && gif[i + 1] === 0xf9) {
    gce++;
    if (gif[i + 3] & 0x01) transparent++;
    if (gce === 1) firstDelay = gif[i + 4] | (gif[i + 5] << 8);
  }
}
ok(gce === N, `${N} blocos gráficos, um por quadro (${gce})`);
ok(transparent === N, `todos os quadros declaram índice transparente (${transparent})`);
ok(firstDelay === 8, `delay em centésimos de segundo (${firstDelay})`);
ok(gif.length > 200, `tamanho plausível (${gif.length} bytes)`);
const opaco = core.encodeGif({ width: 2, height: 2, frames: [new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255])] });
ok(opaco[0] === 0x47 && opaco[opaco.length - 1] === 0x3b, 'GIF sem transparência também codifica');

/* ---- alpha de 1 bit: a sombra e a serrilha ----
 * GIF não tem alpha parcial. Com o corte antigo em 8, a sombra do chão
 * (ShadowMaterial 0,35 => alpha ~89) virava preto sólido e a borda
 * antisserrilhada virava um halo com a cor do modelo. */
const px = (a) => new Uint8ClampedArray([0, 0, 0, a]);
ok(core.GIF_ALPHA_CUT === 128, `corte de alpha em 128 (${core.GIF_ALPHA_CUT})`);
ok(core.alphaMask(px(89))[0] === 1, 'sombra a 35% (alpha 89) vira transparente');
ok(core.alphaMask(px(89), 8)[0] === 0, 'com o corte antigo (8) ela sobrevivia — era o preto sólido');
ok(core.alphaMask(px(127))[0] === 1 && core.alphaMask(px(128))[0] === 0, 'o limiar é exatamente 128');
ok(core.alphaMask(px(0))[0] === 1 && core.alphaMask(px(255))[0] === 0, 'vazio some, opaco fica');
const borda = core.alphaMask(new Uint8ClampedArray([200, 120, 60, 90]));
ok(borda[0] === 1, 'pixel de borda com alpha parcial não vira mais halo opaco');

/* ---- pontilhado de Bayer: sombra num GIF transparente ---- */
const DW = 16, DH = 16;
const sombraCheia = new Uint8ClampedArray(DW * DH * 4);
for (let i = 0; i < DW * DH; i++) sombraCheia.set([0, 0, 0, 89], i * 4);
const soma = (a) => a.reduce((x, y) => x + y, 0);
const semDither = core.alphaMask(sombraCheia, 128, { width: DW });
const comDither = core.alphaMask(sombraCheia, 128, { dither: true, width: DW });
ok(soma(semDither) === DW * DH, 'sem dither a sombra a 35% some inteira');
const opacosDither = DW * DH - soma(comDither);
ok(opacosDither === 96, `com dither, 96 de 256 pontos ficam (6/16 = 37,5%, o mais perto de 35%) — obtidos ${opacosDither}`);
ok(opacosDither / (DW * DH) > 0.3 && opacosDither / (DW * DH) < 0.45, 'a densidade do pontilhado acompanha o alpha');
const vazioDither = core.alphaMask(new Uint8ClampedArray(DW * DH * 4), 128, { dither: true, width: DW });
ok(soma(vazioDither) === DW * DH, 'vazio continua 100% transparente mesmo com dither');
const opacoDither = new Uint8ClampedArray(DW * DH * 4);
for (let i = 0; i < DW * DH; i++) opacoDither.set([9, 9, 9, 255], i * 4);
ok(soma(core.alphaMask(opacoDither, 128, { dither: true, width: DW })) === 0, 'opaco continua 100% opaco com dither');
const meioDither = new Uint8ClampedArray(DW * DH * 4);
for (let i = 0; i < DW * DH; i++) meioDither.set([0, 0, 0, 128], i * 4);
ok(soma(core.alphaMask(meioDither, 255, { dither: true, width: DW })) < DW * DH, 'dither também suaviza outros alphas parciais');
const gifDither = core.encodeGif({ width: CELL, height: CELL, frames, delays: t.map(() => 83), transparent: true, dither: true });
ok(gifDither[0] === 0x47 && gifDither[gifDither.length - 1] === 0x3b, 'GIF pontilhado é um GIF válido');
let transDither = 0;
for (let i = 0; i < gifDither.length - 5; i++) if (gifDither[i] === 0x21 && gifDither[i + 1] === 0xf9 && (gifDither[i + 3] & 0x01)) transDither++;
ok(transDither === N, `os ${N} quadros do GIF pontilhado continuam transparentes (${transDither})`);
ok(core.BAYER4.length === 4 && core.BAYER4.every((l) => l.length === 4), 'matriz de Bayer 4x4');

/* ---- pivot personalizado ---- */
const PIV_MIN = core.PIVOT_MIN, PIV_MAX = core.PIVOT_MAX;
ok(Math.abs(PIV_MIN - 0.07) < 1e-12 && Math.abs(PIV_MAX - 0.93) < 1e-12, 'faixa do pivot = área útil (0.07..0.93)');
ok(JSON.stringify(core.clampPivot({ x: 0.5, y: 0.99 })) === JSON.stringify({ x: 0.5, y: PIV_MAX }), 'acima do teto é preso');
ok(JSON.stringify(core.clampPivot({ x: -3, y: 0 })) === JSON.stringify({ x: PIV_MIN, y: PIV_MIN }), 'abaixo do piso é preso');
ok(JSON.stringify(core.clampPivot({ x: 'abc', y: null })) === JSON.stringify({ x: 0.5, y: 0.5 }), 'lixo vira centro');
ok(JSON.stringify(core.pivotPoint('custom', { x: 0.3, y: 0.7 })) === JSON.stringify({ x: 0.3, y: 0.7 }), 'pivotPoint devolve o custom');
ok(JSON.stringify(core.pivotPoint('base')) === JSON.stringify({ x: 0.5, y: 1 - PIV_MIN }), 'preset base continua igual');

// Box largo e baixo: aqui base/centro/topo DIFEREM (no box alto eles coincidem,
// o que faria qualquer teste de igualdade passar sem provar nada).
const largo = { minX: -40, maxX: 40, minY: 0, maxY: 10 };
const presetas = { center: core.frameForPivot(largo, 'center'), base: core.frameForPivot(largo, 'base'), top: core.frameForPivot(largo, 'top') };
ok(presetas.base.cy !== presetas.center.cy && presetas.top.cy !== presetas.center.cy,
  `os três presets diferem neste box (cy ${presetas.top.cy.toFixed(1)} / ${presetas.center.cy.toFixed(1)} / ${presetas.base.cy.toFixed(1)})`);
for (const [nome, p] of [['center', { x: 0.5, y: 0.5 }], ['base', { x: 0.5, y: 1 - PIV_MIN }], ['top', { x: 0.5, y: PIV_MIN }]]) {
  const f = core.frameForPivot(largo, 'custom', core.SCALE_FIX, p);
  ok(Math.abs(f.cx - presetas[nome].cx) < 1e-9 && Math.abs(f.cy - presetas[nome].cy) < 1e-9 && Math.abs(f.half - presetas[nome].half) < 1e-9,
    `custom (${p.x}, ${p.y.toFixed(2)}) reproduz o preset "${nome}" exatamente`);
}
const meio = core.frameForPivot(largo, 'custom', core.SCALE_FIX, { x: 0.5, y: 0.75 });
ok(meio.cy > presetas.center.cy && meio.cy < presetas.base.cy, 'y=0.75 fica entre centro e base');

// Box alto e estreito: tem folga horizontal, então px desloca de verdade.
const alto = { minX: -10, maxX: 10, minY: 0, maxY: 40 };
ok(Math.abs(core.frameForPivot(alto, 'custom', core.SCALE_FIX, { x: 0.5, y: 0.5 }).cx) < 1e-9, 'px=0.5 centraliza');
ok(core.frameForPivot(alto, 'custom', core.SCALE_FIX, { x: 0.93, y: 0.5 }).cx < -9.9, 'px=0.93 empurra o modelo para a esquerda');
ok(Math.abs(core.frameForPivot(largo, 'custom', core.SCALE_FIX, { x: 0.6, y: 0.5 }).cx) < 1e-9,
  'sem folga horizontal px não desloca (mesmo fenômeno já documentado no eixo y)');

// O que importa: em NENHUM pivot o modelo sai da célula.
let piorNdc = 0;
for (const bounds of [largo, alto, { minX: -7, maxX: 3, minY: -5, maxY: 22 }, { minX: 0, maxX: 1, minY: 0, maxY: 1 }]) {
  for (let py = PIV_MIN; py <= PIV_MAX + 1e-9; py += 0.01) {
    for (const px of [PIV_MIN, 0.25, 0.5, 0.75, PIV_MAX]) {
      const f = core.frameForPivot(bounds, 'custom', core.SCALE_FIX, { x: px, y: py });
      piorNdc = Math.max(piorNdc,
        Math.abs((bounds.minX - f.cx) / f.half), Math.abs((bounds.maxX - f.cx) / f.half),
        Math.abs((bounds.minY - f.cy) / f.half), Math.abs((bounds.maxY - f.cy) / f.half));
    }
  }
}
ok(piorNdc <= 1 + 1e-9, `nenhum pivot personalizado corta o modelo (pior NDC ${piorNdc.toFixed(4)} em 4 boxes x 21 x 5)`);

const metaPivot = core.buildMetadata({
  baseName: 'fox', layout, directionCount: 8, elevationDeg: 18, times: [0],
  pivot: 'custom', custom: { x: 0.42, y: 0.88 }
});
ok(metaPivot.pivot.x === 0.42 && metaPivot.pivot.y === 0.88, 'o pivot personalizado vai para o metadata');
ok(core.DEFAULT_SETTINGS.pivotX === 0.5 && core.DEFAULT_SETTINGS.pivotY === 0.5 && core.DEFAULT_SETTINGS.pivotMark === true,
  'defaults: pivot no centro e alvo visível');

/* ---- OrbitControls vendido casa com o three vendido ---- */
const orbit = await import(new URL('../../spriteforge/app/vendor/OrbitControls.js', import.meta.url));
ok(typeof orbit.OrbitControls === 'function', 'vendor/OrbitControls.js carrega e exporta a classe');
{
  // Elemento DOM mínimo: o Controls só registra ouvintes de evento nele.
  const falso = {
    addEventListener() {}, removeEventListener() {}, style: {},
    ownerDocument: { addEventListener() {}, removeEventListener() {} },
    setPointerCapture() {}, releasePointerCapture() {}, getRootNode() { return this; }
  };
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
  cam.position.set(3, 4, 5);
  const ctrl = new orbit.OrbitControls(cam, falso);
  ok(ctrl.target instanceof THREE.Vector3, 'instancia com a câmera de preview');
  ctrl.enableDamping = true;
  ctrl.dampingFactor = 0.08;
  ctrl.target.set(0, 1, 0);
  ctrl.update();
  ok(Math.abs(cam.position.x - 3) < 1e-9 && Math.abs(cam.position.y - 4) < 1e-9,
    'update() sem entrada do mouse não arrasta a câmera');
  cam.position.set(0, 10, 0.001);
  ctrl.update();
  ok(Math.abs(cam.position.y - 10) < 1e-9,
    'posição definida por fora é respeitada — é o que framePreview() faz');
  ctrl.dispose();
  ok(true, 'dispose() não explode');
}

/* ---- a cor transparente não pode roubar uma cor de verdade ---- */
ok(JSON.stringify(core.reservarTransparente([[0, 0, 0]])) === '[[255,0,255],[0,0,0]]',
  'paleta de UMA cor (quadro só de sombra) ganha o magenta sem perder o preto');
ok(JSON.stringify(core.reservarTransparente([[0, 0, 0], [255, 0, 255]])) === '[[255,0,255],[0,0,0]]',
  'magenta fora do índice 0 é trocado para o índice 0');
ok(JSON.stringify(core.reservarTransparente([[0, 0, 0], [255, 0, 0]])) === '[[255,0,255],[0,0,0],[255,0,0]]',
  'sem magenta na imagem, acrescenta uma cor em vez de sobrescrever');
ok(JSON.stringify(core.reservarTransparente([[255, 0, 255], [0, 0, 0]])) === '[[255,0,255],[0,0,0]]',
  'com o magenta já no índice 0, a paleta não muda');

/* ---- GIF da sombra como sprite à parte (silhueta preta) ---- */
const SQ = 16;
const contar = SQ * SQ;
const quadroSombra = new Uint8ClampedArray(contar * 4);
const quadroVazio = new Uint8ClampedArray(contar * 4);
const quadroOpaco = new Uint8ClampedArray(contar * 4);
const quadroMeio = new Uint8ClampedArray(contar * 4);
for (let i = 0; i < contar; i++) {
  quadroSombra.set([0, 0, 0, 89], i * 4);      // ShadowMaterial 0,35 sobre transparente
  quadroOpaco.set([0, 0, 0, 255], i * 4);
  if (i < contar / 2) quadroMeio.set([0, 0, 0, 89], i * 4);
}
const gifDeSombra = (f, cut, dither) => Buffer.from(core.encodeGif({
  width: SQ, height: SQ, frames: [f], delays: [83], transparent: true, alphaCut: cut, dither: !!dither
}));
const silhueta = gifDeSombra(quadroSombra, 8);
const vazioGif = gifDeSombra(quadroVazio, 8);
ok(silhueta[0] === 0x47 && silhueta[silhueta.length - 1] === 0x3b, 'GIF da sombra em silhueta é um GIF válido');
ok(silhueta.equals(gifDeSombra(quadroOpaco, 8)),
  'a silhueta (alpha 89, corte 8) sai igual a um preto 100% opaco — é isso que o motor vai modular');
ok(!silhueta.equals(vazioGif), 'a silhueta não é um quadro vazio');
ok(gifDeSombra(quadroSombra, 128).equals(vazioGif),
  'com corte 128 e sem dither a sombra some inteira — é o que o usuário viu');
const pontilhadoGif = gifDeSombra(quadroSombra, 128, true);
ok(!pontilhadoGif.equals(vazioGif) && !pontilhadoGif.equals(silhueta),
  'a sombra pontilhada difere tanto do vazio quanto do sólido');
ok(!gifDeSombra(quadroMeio, 8).equals(silhueta) && !gifDeSombra(quadroMeio, 8).equals(vazioGif),
  'meio quadro de sombra é diferente dos dois extremos');
ok(core.DEFAULT_SETTINGS.shadowGif === 'silhueta', 'GIF da sombra em silhueta por padrão');
ok(new Set(core.BAYER4.flat()).size === 16, 'os 16 limiares de Bayer são distintos');
const sombra = new Uint8ClampedArray(4 * 4);
for (let i = 0; i < 4; i++) sombra.set([0, 0, 0, 89], i * 4);
const gifSombra = core.encodeGif({ width: 2, height: 2, frames: [sombra] });
let transparenteSombra = 0;
for (let i = 0; i < gifSombra.length - 5; i++) if (gifSombra[i] === 0x21 && gifSombra[i + 1] === 0xf9 && (gifSombra[i + 3] & 0x01)) transparenteSombra++;
ok(transparenteSombra === 1, 'um quadro só de sombra codifica como transparente');

/* ---- GIF com fundo (a sombra composta de verdade) ---- */
const gifFundo = core.encodeGif({ width: CELL, height: CELL, frames, delays: t.map(() => 83), transparent: false });
ok(gifFundo[0] === 0x47 && gifFundo[gifFundo.length - 1] === 0x3b, 'GIF com fundo é um GIF válido');
let gceFundo = 0, transFundo = 0;
for (let i = 0; i < gifFundo.length - 5; i++) {
  if (gifFundo[i] === 0x21 && gifFundo[i + 1] === 0xf9) { gceFundo++; if (gifFundo[i + 3] & 0x01) transFundo++; }
}
ok(gceFundo === N, `${N} quadros no GIF com fundo (${gceFundo})`);
ok(transFundo === 0, 'nenhum quadro declara transparência quando há fundo');
ok((Buffer.from(gifFundo).toString('latin1').match(/NETSCAPE2\.0/g) || []).length === 1, 'o loop continua presente no GIF com fundo');

/* ---------------- luzes ---------------- */
const mk = (x, y, z) => ({ light: new THREE.DirectionalLight(0xffffff, 1), dir: new THREE.Vector3(x, y, z).normalize() });
const rig = [mk(4, 8, 6), mk(-7, 3, 4), mk(-3, 5, -8)];
const center = new THREE.Vector3(1, 2, 3);
const r = core.placeLightRig(rig, center, 10);
ok(r === 10, 'placeLightRig devolve o raio usado');
ok(rig[0].light.position.equals(center.clone().addScaledVector(rig[0].dir, 40)), 'posição = centro + direção * raio * distância');
ok(rig[0].light.shadow.camera.left === -16 && rig[0].light.shadow.camera.top === 16, 'sombra cobre 1.6x o raio');
approx(rig[0].light.shadow.camera.near, 0.5, 1e-9, 'near = 0.05x o raio');
approx(rig[0].light.shadow.camera.far, 120, 1e-9, 'far = 12x o raio');
const tiny = core.placeLightRig([mk()], new THREE.Vector3(), 0);
ok(tiny === 1e-3, 'raio zero vira 1e-3 (luz não colapsa no modelo)');
const custom = core.placeLightRig([mk()], new THREE.Vector3(), 5, { near: 0.1, far: 2, shadowSpan: 1 });
ok(custom === 5, 'opções aceitas');
ok(rig[1].light.position.distanceTo(rig[0].light.position) > 0, 'luzes em posições distintas');

/* ---------------- limpeza ---------------- */
const geo = new THREE.BoxGeometry(1, 1, 1);
const tex = new THREE.DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1);
const mat = new THREE.MeshStandardMaterial({ map: tex });
const root = new THREE.Group();
const shared = new THREE.Mesh(geo, mat);
root.add(shared, new THREE.Mesh(geo, mat));
let g = 0, m = 0, x = 0;
geo.dispose = () => { g++; };
mat.dispose = () => { m++; };
tex.dispose = () => { x++; };
const stats = core.disposeHierarchy(root);
ok(g === 1 && m === 1 && x === 1, 'geometria/material/textura compartilhados liberados uma vez');
ok(stats.geometries === 1 && stats.materials === 1 && stats.textures === 1, 'estatísticas corretas');
ok(root.children.length === 2, 'disposeHierarchy não desmonta a cena (app.js faz o scene.remove)');

/* ---------------- presets ---------------- */
ok(core.DEFAULT_SETTINGS.directions === 8 && core.DEFAULT_SETTINGS.cell === 128 && core.DEFAULT_SETTINGS.elevation === 18, 'defaults do site');
ok(core.DEFAULT_SETTINGS.padding === 0 && core.DEFAULT_SETTINGS.lockScale === false, 'padding zero e escala livre por padrão');
ok(core.DEFAULT_SETTINGS.gifBg === 'dither' && core.DEFAULT_SETTINGS.lightIntensity === 2.6, 'GIF pontilhado e luz 2.6 por padrão');
ok(core.DEFAULT_SETTINGS.shadowLayer === true && core.DEFAULT_SETTINGS.playerShadow === true, 'camada de sombra ligada por padrão');
ok(core.presetSettings('char2d').pivot === 'base' && core.presetSettings('char2d').elevation === 0, 'preset personagem: pivot base, câmera no horizonte');
ok(core.presetSettings('iso').elevation === 30 && core.presetSettings('iso').pivot === 'center', 'preset isométrico: 30 graus, pivot centro');
ok(core.presetSettings('iso').lockScale === false, 'preset isométrico NÃO trava a escala (trava absoluta cortava modelos grandes)');
ok(core.DEFAULT_SETTINGS.lockScale === false && core.presetSettings('char2d').lockScale === false, 'nenhum preset trava a escala por padrão');
ok(core.presetSettings('props').directions === 4 && core.presetSettings('props').lightCamera === true, 'preset props: 4 direções, luz na câmera');
ok(core.presetSettings('props').cell === 64, 'preset props usa célula menor');
ok(core.presetSettings('default').cell === core.DEFAULT_SETTINGS.cell, 'preset default == defaults');
ok(core.presetSettings('inexistente').directions === core.DEFAULT_SETTINGS.directions, 'preset desconhecido cai no default');
const mut = core.presetSettings('iso'); mut.cell = 999;
ok(core.presetSettings('iso').cell === 128, 'presetSettings devolve cópia (mutar não vaza)');
ok(Object.keys(core.PRESETS).length === 5, '5 presets: default, char2d, iso, topdown, props');

/* ---- top-down 2.5D (Diablo/Hades) ---- */
const td = core.presetSettings('topdown');
ok(td.elevation === 30, `preset top-down usa 30°: ${td.elevation}`);
ok(td.pivot === 'base', 'pivot na BASE — em top-down a ordenação de profundidade é por Y, então a âncora tem que ficar nos pés');
ok(td.directions === 8 && td.shadow === true, '8 direções e sombra ligada');
ok(td.lockScale === false, 'não trava a escala (o preset não sabe o tamanho do seu modelo; a caixa do painel calibra)');
// A diferença que justifica existir além do isométrico:
ok(core.presetSettings('iso').pivot === 'center' && td.pivot === 'base',
  'top-down difere do isométrico justamente no pivot (centro x pés)');
// Ancorar nos pés vs no centro, em pixels, para o valor não ficar abstrato:
const ptBase = core.pivotPoint('base'), ptCentro = core.pivotPoint('center');
// Exato, não arredondado: a margem vem do SCALE_FIX, então (1-0.93)*128 = 8.96px.
const pxBase = (1 - ptBase.y) * 128, pxCentro = (1 - ptCentro.y) * 128;
ok(Math.abs(pxBase - PIV_MIN * 128) < 1e-9 && Math.abs(pxCentro - 64) < 1e-9,
  `numa célula de 128px a âncora fica ${pxBase.toFixed(2)}px acima da base (pés) e não ${pxCentro.toFixed(0)}px (centro)`);
ok(pxCentro - pxBase > 50,
  `a diferença é ${(pxCentro - pxBase).toFixed(2)}px — meio corpo de flutuação, que é o que quebra a ordenação por Y`);

/* ---- 30° é a projeção dimétrica 2:1 do Diablo (medido, não opinado) ----
 * Projeta um tile quadrado unitário do plano XZ pela câmera ortográfica e mede a
 * caixa na tela. Trava o ângulo: se alguém mexer na elevação do preset, isto falha. */
const tileRatio = (elevDeg, azDeg) => {
  const cam = core.createOrthoCamera({
    half: 1, center: new THREE.Vector3(0, 0, 0),
    elevationDeg: elevDeg, azimuthRad: THREE.MathUtils.degToRad(azDeg)
  });
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z).project(cam));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
};
ok(Math.abs(tileRatio(30, 0) - 2) < 1e-6, `30° dá tile 2:1 exato no azimute 0: ${tileRatio(30, 0).toFixed(6)}`);
ok(Math.abs(tileRatio(30, 45) - 2) < 1e-6, `e também a 45° — o ratio não depende do azimute: ${tileRatio(30, 45).toFixed(6)}`);
ok(Math.abs(tileRatio(35.264, 0) - Math.sqrt(3)) < 1e-3,
  `isométrico verdadeiro (35,264°) dá 1,73:1, não 2:1: ${tileRatio(35.264, 0).toFixed(4)}`);
ok(tileRatio(50, 0) < tileRatio(30, 0), 'subir a elevação (Hades) comprime o tile — por isso é outro visual, não outro preset');

/* ---------------- escala travada ---------------- */
approx(core.lockedHalf(128, 8), 8, 1e-12, 'trava a 8 px/un: half 8 (janela de 16 unidades)');
approx(core.lockedHalf(128, 0.564), 113.475, 1e-3, 'trava a 0.564 px/un: half ~113.5 (cabe o Fox)');
approx(core.pxPerUnitToFit(128, 113.49), 0.564, 1e-3, 'px/un que faz half 113.49 caber em 128px');
approx(core.pxPerUnitToFit(128, 64), 1, 1e-12, 'half 64 em célula 128 = 1 px/un');
for (const half of [8, 64, 113.49, 0.5]) {
  approx(core.lockedHalf(128, core.pxPerUnitToFit(128, half)), half, 1e-9, `ida e volta da calibração (half ${half})`);
}
approx(core.lockedHalf(128, 0), 64, 1e-12, 'px/un zero não divide por zero (cai em 1)');
approx(core.lockedHalf(128, -3), 64, 1e-12, 'px/un negativo idem');
approx(core.pxPerUnitToFit(128, 0), 1, 1e-12, 'half zero devolve 1 px/un em vez de Infinity');
// O número do bug reportado: 8 px/un sobre o Fox cobria 7% do modelo.
ok(core.lockedHalf(128, 8) / 113.49 < 0.08, 'a trava antiga do preset iso cobria <8% do Fox (o bug relatado)');
ok(core.pxPerUnitToFit(128, 113.49) < 1, 'o Fox precisa de menos de 1 px/un — por isso o slider ia de 1 a 64 e não servia');

/* ---------------- i18n (tradução pt-BR <-> en) ---------------- */
ok(Array.isArray(i18n.IDIOMAS) && i18n.IDIOMAS.length === 2, '2 idiomas disponíveis');
ok(i18n.IDIOMAS[0].id === 'pt-BR', 'pt-BR é o primeiro idioma (o padrão)');
ok(i18n.IDIOMAS.some((i) => i.id === 'en'), 'en está na lista');
ok(i18n.idiomaAtual() === 'pt-BR', 'começa em pt-BR — quem já usa o app não leva susto');
ok(i18n.t('Gerar spritesheet') === 'Gerar spritesheet', 'em pt-BR t() devolve o texto como está');
ok(i18n.norm('  Gerar\n  sheet  ') === 'Gerar sheet', 'norm() colapsa espaços e quebras de linha');
ok(i18n.norm('\u00a0Gerar\u00a0') === 'Gerar', 'norm() também derruba espaço não-quebrável');
ok(i18n.t('frase que não existe no dicionário') === 'frase que não existe no dicionário',
  'sem tradução o texto fica em português (falha suave, nunca undefined)');
const pt = i18n.t('sheet pronta: {w}×{h} ({cols}×{rows} células de {cell}px)',
  { w: 1024, h: 1024, cols: 8, rows: 8, cell: 128 });
ok(pt === 'sheet pronta: 1024×1024 (8×8 células de 128px)', 'em pt-BR as variáveis são interpoladas');
i18n.aplicarIdioma('en');
ok(i18n.idiomaAtual() === 'en', 'aplicarIdioma("en") troca o idioma');
ok(i18n.t('Gerar spritesheet') === 'Generate spritesheet', 'em en traduz o botão de gerar');
ok(i18n.t('Gerar GIFs') === 'Generate GIFs', 'em en traduz o botão de GIFs');
ok(i18n.t('Gerar') === 'Generate', 'em en traduz o verbo isolado');
const en = i18n.t('sheet pronta: {w}×{h} ({cols}×{rows} células de {cell}px)',
  { w: 1024, h: 1024, cols: 8, rows: 8, cell: 128 });
ok(en === 'sheet ready: 1024×1024 (8×8 cells of 128px)', 'em en traduz E interpola na mesma chamada');
ok(i18n.t('renderizando {i}/{n} — dir {d}, frame {f}', { i: 3, n: 24, d: '02', f: 7 })
  === 'rendering 3/24 — dir 02, frame 7', 'mensagem de progresso traduzida com 4 variáveis');
ok(i18n.t('modelo anterior liberado ({g} geometrias, {m} materiais, {tex} texturas)',
  { g: 12, m: 4, tex: 3 }) === 'previous model released (12 geometries, 4 materials, 3 textures)',
  'mensagem de liberação de VRAM traduzida');
ok(i18n.t('{nome} — {n} animação(ões)', { nome: 'Fox', n: 3 }) === 'Fox — 3 animation(s)',
  'variável que é nome de arquivo não é traduzida');
i18n.aplicarIdioma('en-GB');
ok(i18n.idiomaAtual() === 'pt-BR', 'idioma desconhecido cai em pt-BR em vez de quebrar');
i18n.aplicarIdioma('en');
i18n.aplicarIdioma('pt-BR');
ok(i18n.idiomaAtual() === 'pt-BR' && i18n.t('Gerar') === 'Gerar', 'dá para voltar para pt-BR');
// Todo texto visível do HTML precisa ter tradução em inglês — é isso que impede
// a interface de voltar "meio portuguesa" depois de uma edição no index.html.
const html = await readFile(new URL('../../spriteforge/app/index.html', import.meta.url), 'utf8');
// O DOM decodifica entidades antes de entregar o texto ao i18n, então a
// comparação tem que partir do texto decodificado.
const decodificar = (t) => t
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const visiveis = new Set();
for (const m of html.matchAll(/title="([^"]{2,})"/g)) visiveis.add(i18n.norm(decodificar(m[1])));
for (const m of html.matchAll(/<(?:label|button|option|h1|h2|h3|p|legend|summary)\b[^>]*>([^<]{2,})</g)) {
  visiveis.add(i18n.norm(decodificar(m[1])));
}
const semTraducao = [...visiveis].filter((txt) => {
  if (!txt) return false;
  if (/^[\d\s.:,%/·—–°-]*$/.test(txt)) return false;      // só número/pontuação
  return !i18n.temTraducao(txt);                            // não está no dicionário
});
ok(semTraducao.length === 0,
  `todo texto visível do HTML tem entrada no dicionário inglês${semTraducao.length ? ' — faltando: ' + semTraducao.slice(0, 8).join(' | ') : ''}`);
ok(visiveis.size >= 100, `a cobertura varre o HTML inteiro (${visiveis.size} textos)`);
ok(i18n.temTraducao('🇧🇷 Português'), 'o rótulo do próprio seletor tem entrada (fica igual de propósito)');
ok(i18n.t('🇧🇷 Português') === '🇧🇷 Português', 'o seletor de idioma não traduz o próprio nome do idioma');

/* ---------------- projeto salvo (.spriteforge.json) ---------------- */
const proj = core.buildProject({ ...core.DEFAULT_SETTINGS, cell: 256, directions: 4 },
  { nome: 'fox.glb', formato: 'glb' });
ok(proj.kind === core.PROJECT_KIND, 'projeto carrega o kind do SpriteForge');
ok(proj.version === core.PROJECT_VERSION, 'projeto carrega a versão do formato');
ok(proj.settings.cell === 256 && proj.settings.directions === 4, 'guarda o que o usuário mudou');
ok(proj.modelo.nome === 'fox.glb' && proj.modelo.formato === 'glb', 'lembra a identidade do modelo (não o arquivo)');
ok(Object.keys(proj.settings).length === Object.keys(core.DEFAULT_SETTINGS).length,
  'todas as chaves de settings vão junto — nenhuma opção fica de fora');
ok(!('kind' in proj.settings) && !('version' in proj.settings), 'settings não vaza metadado do envelope');
const volta = core.parseProject(JSON.stringify(proj));
ok(volta.ok && volta.projeto.settings.cell === 256, 'ida e volta preserva cell');
ok(volta.ok && volta.projeto.modelo.nome === 'fox.glb', 'ida e volta preserva o modelo');
ok(volta.ok && JSON.stringify(volta.projeto.settings) === JSON.stringify(proj.settings),
  'ida e volta preserva o objeto de settings inteiro');
ok(core.buildProject(core.DEFAULT_SETTINGS).modelo === null, 'sem modelo carregado o campo vem nulo');
// Arquivos corrompidos não podem derrubar a interface.
for (const ruim of ['{invalido', '', 'null', '[]', '"texto"', '{"a":1}',
  JSON.stringify({ kind: core.PROJECT_KIND, settings: 'x' })]) {
  const r = core.parseProject(ruim);
  ok(r.ok === false && typeof r.erro === 'string' && r.erro.length > 0,
    `arquivo inválido rejeitado com mensagem: ${JSON.stringify(ruim).slice(0, 40)}`);
}
// Versão futura: o que esta versão não conhece é ignorado, o que falta vem do default.
const futuro = core.buildProject(core.DEFAULT_SETTINGS);
futuro.version = 99;
futuro.settings.opcaoDoFuturo = 'x';
delete futuro.settings.cell;
const rf = core.parseProject(JSON.stringify(futuro));
ok(rf.ok && rf.projeto.version === 99, 'projeto de versão futura é aceito');
ok(rf.projeto.settings.cell === core.DEFAULT_SETTINGS.cell, 'chave ausente volta do default');
ok(!('opcaoDoFuturo' in rf.projeto.settings), 'chave desconhecida não entra no painel');
// Tipos errados caem no default em vez de corromper os controles.
const torto = core.buildProject(core.DEFAULT_SETTINGS);
torto.settings.cell = 'abc';
torto.settings.shadow = 'sim';
torto.settings.pivot = 123;
torto.settings.frames = null;
const rt = core.parseProject(JSON.stringify(torto));
ok(rt.ok && rt.projeto.settings.cell === core.DEFAULT_SETTINGS.cell, 'número não-numérico cai no default');
ok(rt.projeto.settings.shadow === core.DEFAULT_SETTINGS.shadow, 'booleano não-booleano cai no default');
ok(rt.projeto.settings.pivot === core.DEFAULT_SETTINGS.pivot, 'string não-string cai no default');
ok(rt.projeto.settings.frames === core.DEFAULT_SETTINGS.frames, 'null cai no default');
ok(rt.ignoradas.length === 3, 'os 3 valores ruins são reportados para a UI avisar');
// O formato que o localStorage já usava continua abrindo.
ok(core.parseProject(JSON.stringify({ preset: 'iso', settings: { cell: 128 } })).ok,
  'exportação antiga do localStorage ainda abre');
ok(core.parseProject(JSON.stringify(proj)).projeto.settings.directions === 4,
  'valor fora do default sobrevive (não é só "voltou pro padrão")');

/* ---------------- gravador de sessão (log.js) ----------------
 * O relógio é injetado, então nada aqui depende de tempo de parede. */
let relogio = 1_000_000;
const gr = log.criarGravador({ agora: () => relogio, id: 'sessao-de-teste' });
ok(gr.estado.id === 'sessao-de-teste', 'gravador aceita id fixo');
ok(gr.estado.eventos.length === 0, 'sessão nova começa sem eventos');
ok(log.RECURSOS.length >= 20, `a lista de recursos cobre o app inteiro (${log.RECURSOS.length})`);
ok(new Set(log.RECURSOS.map((r) => r.id)).size === log.RECURSOS.length, 'ids de recurso são únicos');
ok(log.RECURSOS.every((r) => r.rotulo && r.en), 'todo recurso tem rótulo em pt e en');
gr.registrar('inicio', 'sessão aberta');
relogio += 1500;
gr.registrar('modelo', 'fox.glb (glb) — 3 mesh, 12000 tris, 2 clips');
ok(gr.estado.eventos.length === 2, 'eventos acumulam');
ok(gr.estado.eventos[1].ms === 1500, 'carimbo é relativo ao início da sessão (ms)');
ok(gr.marcar('modelo') === true, 'recurso conhecido é marcado');
ok(gr.marcar('naoExiste') === false, 'recurso inexistente é recusado em vez de inventar linha');
ok(Object.keys(gr.estado.recursos).length === 1, 'só recursos válidos entram no inventário');
gr.marcar('modelo');
ok(gr.estado.recursos.modelo === 1500, 'marcar de novo não sobrescreve o horário da primeira vez');
// Fila de tamanho fixo: sessão longa não pode crescer sem limite.
const gr2 = log.criarGravador({ agora: () => relogio });
for (let i = 0; i < log.CAP_EVENTOS + 50; i += 1) gr2.registrar('x', `ev ${i}`);
ok(gr2.estado.eventos.length === log.CAP_EVENTOS, 'a fila respeita o limite de eventos');
ok(gr2.estado.descartados === 50, 'o que caiu é contado, não some em silêncio');
ok(gr2.estado.eventos[0].msg === 'ev 50', 'descarta o começo da sessão, mantém o fim (o mais recente importa)');
ok(gr2.estado.eventos[gr2.estado.eventos.length - 1].msg === `ev ${log.CAP_EVENTOS + 49}`, 'o último evento sobrevive');
ok(log.cortar('a'.repeat(900)).length <= 200, 'string gigante é cortada');
ok(log.cortar('curta') === 'curta', 'string curta passa intacta');
ok(log.cortar(null) === '', 'null não quebra o corte');
// Contadores que alimentam o resumo
gr.contarGeracao('iniciadas');
gr.contarGeracao('concluidas', 4200);
gr.contarDownload();
gr.contarErro();
ok(gr.estado.geracoes.concluidas === 1 && gr.estado.geracoes.msTotal === 4200, 'tempo de render acumula');
ok(gr.estado.downloads === 1 && gr.estado.erros === 1, 'downloads e erros são contados');
gr.contarGeracao('campoQueNaoExiste');
ok(gr.estado.geracoes.campoQueNaoExiste === undefined, 'contador inválido não cria campo');
gr.contarGeracao('falhas', -5);
ok(gr.estado.geracoes.msTotal === 4200, 'duração negativa não entra no total');
ok(log.formatarDuracao(450) === '450ms', 'duração em ms');
ok(log.formatarDuracao(12340) === '12.3s', 'duração em segundos');
ok(log.formatarDuracao(95000) === '1m35.0s', 'duração em minutos e segundos');
ok(log.formatarDuracao(NaN) === 'n/d', 'duração inválida não lança');
// JSON exportado
const j = gr.json({ idioma: 'en', ambiente: 'GPU X', modelo: 'fox.glb', opcoes: 'cell=128' });
ok(j.formato === 'spriteforge.session' && j.versao === 1, 'JSON se identifica com formato e versão');
ok(j.recursosUsados.includes('modelo') && !j.recursosUsados.includes('gifs'), 'usados e não usados separados');
ok(j.recursosNaoUsados.length === log.RECURSOS.length - 1, 'não usados = total - usados');
ok(j.contagem.erros === 1 && j.contagem.downloads === 1, 'contagem vai para o JSON');
ok(j.eventos.length === 2, 'a linha do tempo vai para o JSON');
ok(j.ambiente === 'GPU X' && j.opcoes === 'cell=128', 'ambiente e opções entram no JSON');
// Relatório legível nos dois idiomas
const txt = gr.texto({ idioma: 'pt-BR', ambiente: 'GPU X' });
ok(txt.includes('relatório da sessão'), 'relatório tem título em português');
ok(txt.includes('[x] carregou um modelo'), 'recurso usado aparece marcado');
ok(txt.includes('[ ] gerou os GIFs'), 'recurso NÃO usado aparece marcado — é o que mostra o que falta testar');
ok(txt.includes('nunca usados'), 'relatório tem seção do que não foi usado');
ok(txt.includes('GPU X'), 'ambiente entra no relatório');
ok(txt.includes('fox.glb (glb)'), 'os eventos entram na linha do tempo');
ok(txt.includes('gerações'), 'o resumo de gerações entra no relatório');
const txtEn = gr.texto({ idioma: 'en' });
ok(txtEn.includes('session report') && txtEn.includes('[ ] generated the GIFs'), 'relatório também sai em inglês');
// Persistência entre recarregamentos
const bruto = gr.serializar();
const gr3 = log.criarGravador({ agora: () => relogio });
ok(gr3.restaurar(bruto) === true, 'a sessão restaura do próprio serializado');
ok(gr3.estado.eventos.length === 2 && gr3.estado.recursos.modelo !== undefined, 'eventos e recursos voltam');
ok(gr3.estado.geracoes.msTotal === 4200, 'os contadores voltam');
ok(gr3.restaurar('{json quebrado') === false, 'JSON corrompido não lança');
ok(gr3.restaurar('null') === false, 'null é rejeitado');
ok(gr3.restaurar(JSON.stringify({ inicio: 'abc' })) === false, 'início inválido é rejeitado');
ok(gr3.estado.eventos.length === 2, 'restauração que falhou deixa a sessão intacta');
const sujo = JSON.stringify({
  inicio: relogio,
  eventos: [null, { ms: 'x', tipo: 'a', msg: 'b' }, 42],
  recursos: { modelo: 'n', gifs: 5, recursoFalso: 1 }
});
const gr4 = log.criarGravador({ agora: () => relogio });
ok(gr4.restaurar(sujo) === true, 'restauração tolera dado sujo');
ok(gr4.estado.eventos.length === 1, 'só o evento válido sobrevive');
ok(gr4.estado.eventos[0].ms === 0, 'carimbo inválido vira zero em vez de NaN');
ok(!('recursoFalso' in gr4.estado.recursos), 'recurso inexistente é filtrado na restauração');
ok(gr4.estado.recursos.gifs === 5, 'recurso válido é preservado');
// Um gravador não interfere no outro (os testes usam vários)
const gr5 = log.criarGravador({ agora: () => relogio });
ok(gr5.estado.eventos.length === 0, 'gravadores são independentes');
ok(gr5.estado.descartados === 0, 'o contador de descartados não vaza entre gravadores');

/* ---------------- pasta de saída (pasta.js) ----------------
 * Sem navegador aqui: o que dá para testar são as decisões puras e o
 * comportamento com handles falsos, que é onde mora a lógica. */
ok(pasta.nomeSeguro('fox_sheet.png') === 'fox_sheet.png', 'nome comum passa intacto');
ok(pasta.nomeSeguro('a/b\\c:d*e?f"g<h>i|j.png') === 'a_b_c_d_e_f_g_h_i_j.png',
  'caracteres inválidos no Windows viram "_" (o nome vira arquivo de verdade)');
ok(pasta.nomeSeguro('') === 'saida', 'nome vazio cai no substituto');
ok(pasta.nomeSeguro('..') === 'saida', '".." não pode virar nome de arquivo');
ok(pasta.nomeSeguro('.') === 'saida', '"." não pode virar nome de arquivo');
ok(pasta.nomeSeguro(null) === 'saida', 'null não quebra o nome');
ok(pasta.nomeSeguro('x'.repeat(300)).length === 180, 'nome gigante é truncado');
ok(pasta.nomeSeguro('  fox   sheet.png  ') === 'fox sheet.png', 'espaços sobrando são colapsados');
ok(pasta.destinoArquivo({ name: 'saida' }, true) === 'pasta', 'pasta escolhida + permissão -> grava na pasta');
ok(pasta.destinoArquivo({ name: 'saida' }, false) === 'download', 'pasta sem permissão -> download (não perde o arquivo)');
ok(pasta.destinoArquivo(null, true) === 'download', 'sem pasta -> download');
ok(pasta.destinoArquivo(null, false) === 'download', 'nem pasta nem permissão -> download');
ok(pasta.apiDisponivel() === false, 'sem window a API não está disponível (e nada lança)');
ok(await pasta.permissaoOk(null) === false, 'handle nulo -> sem permissão');
ok(await pasta.permissaoOk({}) === false, 'handle sem queryPermission -> sem permissão');
ok(await pasta.permissaoOk({ queryPermission: async () => 'granted' }) === true, 'permissão já concedida');
const promptPede = { queryPermission: async () => 'prompt', requestPermission: async () => 'granted' };
ok(await pasta.permissaoOk(promptPede) === true, 'permissão em prompt: pede e consegue');
let pediu = false;
const espiao = { queryPermission: async () => 'prompt', requestPermission: async () => { pediu = true; return 'granted'; } };
ok(await pasta.permissaoOk(espiao, false) === false, 'sem pedir, permissão em prompt devolve false');
ok(pediu === false, 'e NÃO chama requestPermission — só um gesto do usuário pode pedir');
ok(await pasta.permissaoOk({ queryPermission: async () => 'prompt', requestPermission: async () => 'denied' }) === false,
  'usuário negou a permissão -> false');
// escreverArquivo tem que fechar o fluxo mesmo quando o write falha,
// senão o arquivo fica travado e a próxima gravação não sai.
let fechouFeliz = false;
await pasta.escreverArquivo({
  getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => { fechouFeliz = true; } }) })
}, 'a.png', 'dados');
ok(fechouFeliz === true, 'fluxo é fechado no caminho feliz');
let fechouFalha = false;
let lancou = false;
try {
  await pasta.escreverArquivo({
    getFileHandle: async () => ({
      createWritable: async () => ({
        write: async () => { throw new Error('disco cheio'); },
        close: async () => { fechouFalha = true; }
      })
    })
  }, 'a.png', 'dados');
} catch { lancou = true; }
ok(lancou === true, 'falha no write é propagada (quem chama cai no download)');
ok(fechouFalha === true, 'fluxo é fechado MESMO quando o write falha');
let criouComCreate = null;
await pasta.escreverArquivo({
  getFileHandle: async (nome, opts) => {
    criouComCreate = { nome, create: opts && opts.create };
    return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
  }
}, 'sheet.png', 'x');
ok(criouComCreate && criouComCreate.nome === 'sheet.png' && criouComCreate.create === true,
  'o arquivo é pedido com create:true (regenerar sobrescreve, não cria "sheet (1).png")');
// Sem IndexedDB as três funções devolvem fallback em vez de lançar.
ok(await pasta.lerPasta() === null, 'sem IndexedDB lerPasta devolve null');
ok(await pasta.guardarPasta({}) === false, 'sem IndexedDB guardarPasta devolve false');
ok(await pasta.esquecerPasta() === false, 'sem IndexedDB esquecerPasta devolve false');

/* ---------------- censo de alpha (folha vazia) ----------------
 * "A sombra saiu vazia" é impossível de diagnosticar de longe. O censo existe
 * para a geração dizer na hora se a folha não tem nada. */
const buf4 = new Uint8ClampedArray(4 * 4 * 4);   // 4×4, tudo transparente
buf4[3] = 255;                                    // pixel (0,0)
buf4[(2 * 4 + 3) * 4 + 3] = 89;                   // pixel (3,2) — alpha real da sombra
const censo = core.alphaCensus(buf4, 4);
ok(censo.visiveis === 2, 'conta os dois pixels com alpha');
ok(censo.total === 16, 'total é o número de pixels, não de bytes');
ok(censo.vazio === false, 'folha com pixel não é vazia');
ok(Math.abs(censo.fracao - 2 / 16) < 1e-9, 'fração é visíveis/total');
ok(censo.caixa.x === 0 && censo.caixa.y === 0 && censo.caixa.w === 4 && censo.caixa.h === 3,
  'caixa ocupada cobre de (0,0) a (3,2)');
const vazio = core.alphaCensus(new Uint8ClampedArray(4 * 4 * 4), 4);
ok(vazio.vazio === true && vazio.visiveis === 0, 'folha toda transparente é detectada como vazia');
ok(vazio.caixa === null, 'folha vazia não tem caixa');
ok(vazio.fracao === 0, 'fração zero na folha vazia');
// O alpha da sombra é 89 (ShadowMaterial 0.35): precisa contar no censo, senão o
// diagnóstico diria "vazia" para uma sombra perfeitamente boa.
const umPixel = new Uint8ClampedArray(4);
umPixel[3] = 89;
ok(core.alphaCensus(umPixel, 1).visiveis === 1, 'alpha 89 da sombra conta como visível');
ok(core.alphaCensus(umPixel, 1, 128).visiveis === 0, 'com corte 128 ele some — é por isso que o GIF precisa ditherizar');
const corte = new Uint8ClampedArray(2 * 4);
corte[3] = 10;
corte[4 + 3] = 200;
ok(core.alphaCensus(corte, 2, 128).visiveis === 1, 'corte de alpha ignora o pixel fraco');
ok(core.alphaCensus(corte, 2, 1).visiveis === 2, 'corte 1 conta qualquer alpha não nulo');
const zero = core.alphaCensus(new Uint8ClampedArray(0), 1);
ok(zero.total === 0 && zero.fracao === 0, 'buffer vazio não divide por zero (não dá NaN)');
ok(Number.isNaN(zero.fracao) === false, 'fração é um número mesmo sem pixels');
// linha inteira: a caixa precisa acompanhar a largura certa
const linha = new Uint8ClampedArray(5 * 1 * 4);
linha[3] = 255;
linha[(4) * 4 + 3] = 255;
const cLinha = core.alphaCensus(linha, 5);
ok(cLinha.caixa.w === 5 && cLinha.caixa.h === 1, 'caixa de uma linha de 5px é 5×1');
// coluna: a aritmética de y precisa estar certa
const coluna = new Uint8ClampedArray(2 * 4 * 4);   // 2 de largura, 4 de altura
coluna[3] = 255;                                    // (0,0)
coluna[(3 * 2 + 0) * 4 + 3] = 255;                  // (0,3)
const cCol = core.alphaCensus(coluna, 2);
ok(cCol.caixa.x === 0 && cCol.caixa.y === 0 && cCol.caixa.w === 1 && cCol.caixa.h === 4,
  'caixa de uma coluna é 1×4 (o y é derivado do índice pela largura)');

console.log(`\n${pass} passou, ${fail} falhou`);
process.exit(fail === 0 ? 0 : 1);
