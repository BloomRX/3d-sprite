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
ok(Object.keys(core.PRESETS).length === 4, '4 presets: default, char2d, iso, props');

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

console.log(`\n${pass} passou, ${fail} falhou`);
process.exit(fail === 0 ? 0 : 1);
