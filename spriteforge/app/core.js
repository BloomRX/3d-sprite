/**
 * SpriteForge Web — núcleo puro.
 *
 * Este módulo NÃO toca em DOM nem em WebGL: contém só matemática de câmera,
 * layout da sheet, metadados e codificação de GIF. Por isso ele roda igual no
 * navegador (importado por app.js) e em Node (testes), sem mudar uma linha.
 *
 * `three` entra pelo importmap no navegador (./vendor/three.module.js) e pelo
 * shim node_modules/three nos testes — é sempre o MESMO build vendido no repo.
 */
import * as THREE from 'three';
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';

/** Folga deixada entre o modelo e a borda da célula (0.86 ≈ 7% de margem por lado). */
export const SCALE_FIX = 0.86;
/** Limite prático de textura/sheet: acima disso a sheet é clampada (e a célula reduzida). */
export const MAX_SHEET_SIDE = 8192;
export const DEFAULT_FPS = 12;
/**
 * Pixels com alpha abaixo disso viram o índice 0 (transparente) no GIF.
 *
 * GIF tem alpha de **1 bit**: não existe "35% opaco". O corte antigo era 8, e o
 * efeito era duplo e visível: a sombra (ShadowMaterial a 0,35 = alpha ~89)
 * sobrevivia como cor e saía **preta sólida**, e os pixels de borda
 * antisserrilhada (alpha parcial com a cor do modelo) saíam opacos, formando um
 * halo em volta do sprite. 128 é o limiar padrão de 1 bit: mais transparente que
 * 50% some, o resto fica opaco. Quem quiser a sombra de verdade usa um GIF com
 * fundo (ela é composta antes de quantizar).
 */
export const GIF_ALPHA_CUT = 128;

/**
 * Máscara de transparência: 1 onde o pixel vira o índice 0.
 * Separada do encodeGif porque é a decisão que define se a sombra e a serrilha
 * somem ou viram mancha — e assim dá para testá-la sem decodificar GIF.
 */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

/**
 * @param {Uint8ClampedArray} rgba
 * @param {number} alphaCut   alpha >= isso fica opaco
 * @param {{dither?:boolean,width?:number}} opts
 *   `dither` trata a faixa 0 < alpha < alphaCut com uma matriz de Bayer 4x4 em
 *   vez de descartá-la: é assim que se finge transparência parcial num formato
 *   de 1 bit. É o que permite ter sombra num GIF transparente — ela sai
 *   pontilhada, com a densidade certa (35% de alpha ≈ 35% dos pontos).
 * @returns {Uint8Array} 1 = pixel vira o índice transparente
 */
export function alphaMask(rgba, alphaCut = GIF_ALPHA_CUT, { dither = false, width = 0 } = {}) {
  const count = rgba.length >> 2;
  const mask = new Uint8Array(count);
  const w = width > 0 ? width : Math.max(1, Math.round(Math.sqrt(count)));
  for (let p = 0; p < count; p++) {
    const a = rgba[p * 4 + 3];
    if (a >= alphaCut) { mask[p] = 0; continue; }   // opaco de verdade
    if (a <= 0) { mask[p] = 1; continue; }          // vazio de verdade
    if (!dither) { mask[p] = 1; continue; }         // corte seco: some
    const x = p % w;
    const y = (p / w) | 0;
    const limiar = ((BAYER4[y & 3][x & 3] + 0.5) / 16) * 255;
    mask[p] = a > limiar ? 0 : 1;
  }
  return mask;
}
/**
 * Folga (normalizada, medida da borda) entre o modelo e a borda da célula nos
 * pivots "base"/"top". É derivada do SCALE_FIX: a âncora encosta em ±SCALE_FIX
 * no NDC, ou seja, em (1 - SCALE_FIX) / 2 = 0.07 da borda na imagem. Mantido
 * como constante para que o `pivot` do metadata bata com o pixel renderizado.
 */
export const PIVOT_MARGIN = (1 - SCALE_FIX) / 2;

/**
 * Estado inicial dos controles — é o que o botão Reset restaura.
 * `lightIntensity` vem do slider como inteiro 0..50 e entra aqui já /10.
 */
export const DEFAULT_SETTINGS = {
  directions: 8, frames: 12, elevation: 18, azimuthOffset: 0, pivot: 'center',
  cell: 128, padding: 0, ssaa: false, lockScale: false, pxPerUnit: 8,
  turntable: false, background: 'transparent', shadow: true,
  lightCamera: false, lightAz: 34, lightIntensity: 2.6,
  pivotX: 0.5, pivotY: 0.5, pivotMark: true,
  loopPerfect: true, fps: 12, zoom: 1, gifScale: 1, gifBg: 'dither',
  shadowLayer: true, playerShadow: true, shadowGif: 'silhueta'
};

/**
 * Atalhos por tipo de projeto. Cada um é um patch sobre DEFAULT_SETTINGS, então
 * adicionar um controle novo não quebra os presets.
 */
export const PRESETS = {
  default: {},
  // Personagem de plataforma: câmera na altura do chão, pé ancorado embaixo.
  char2d: { elevation: 0, pivot: 'base', cell: 128, shadow: true, lightCamera: false },
  // Isométrico: 30° (dimétrico; isométrico verdadeiro seria 35,264°). A escala
  // travada fica DESLIGADA de propósito: ela é absoluta (px por unidade de mundo)
  // e modelos variam de tamanho demais — o Fox tem 79 unidades, um personagem de
  // jogo costuma ter 1. Quem quiser combinar vários objetos liga a trava na mão,
  // e o controle se calibra sozinho no modelo atual ao ser ligado.
  iso: { elevation: 30, pivot: 'center', cell: 128, lockScale: false, shadow: true },
  // Top-down 2.5D (Diablo/Hades): 30° de elevação dá tile do chão em 2:1 EXATO —
  // é a projeção dimétrica do Diablo 2. Medido projetando um tile unitário do
  // plano XZ pela câmera ortográfica: a 30° a caixa na tela sai 2,000:1 e o valor
  // independe do azimute. Isométrico verdadeiro seria 35,264° (1,73:1) e Hades é
  // mais alto: 45–50°.
  // O pivot na BASE é o que diferencia este preset do isométrico. Em top-down a
  // ordenação de profundidade é por Y, então a âncora tem que ficar nos PÉS: com
  // 'center' o sprite ancora no meio da célula (64px acima da base numa célula de
  // 128) e o personagem flutua meio corpo acima da posição lógica — a ordenação
  // erra quando ele passa atrás de um objeto.
  // lockScale fica DESLIGADA de propósito (mesma razão do iso): ela é absoluta em
  // px/unidade e o preset não sabe o tamanho do seu modelo — o Fox tem 79 unidades
  // e um personagem de jogo costuma ter 1. Ligue a caixa no painel e o valor se
  // calibra sozinho no modelo atual; é o caminho para vários assets na mesma escala.
  topdown: { elevation: 30, pivot: 'base', cell: 128, lockScale: false, shadow: true },
  // Itens/ícones: 4 direções, célula pequena, luz frontal sem sombra.
  props: { directions: 4, elevation: 0, pivot: 'center', cell: 64, shadow: false, lightCamera: true }
};

export function presetSettings(name) {
  return { ...DEFAULT_SETTINGS, ...(PRESETS[name] || {}) };
}

/**
 * Escala travada: quantas unidades de mundo cabem em meia célula.
 * É o `half` da câmera — numa ortográfica é SÓ isso que define o enquadramento
 * (a distância da câmera não muda o tamanho projetado, só o near/far).
 */
export function lockedHalf(cell, pxPerUnit) {
  const ppu = Number(pxPerUnit) > 0 ? Number(pxPerUnit) : 1;
  return Math.max(1e-6, cell / (2 * ppu));
}

/**
 * px/unidade que faz um modelo de `half` conhecido caber exatamente na célula.
 * É como o controle de escala travada se calibra ao ser ligado: parte do tamanho
 * real do modelo em vez de um chute que corta tudo.
 */
export function pxPerUnitToFit(cell, half) {
  return half > 0 ? cell / (2 * half) : 1;
}

/** Pivot normalizado (0..1) dentro da célula, no formato que as engines usam. */
/** Faixa em que um pivot personalizado pode ficar sem cortar o modelo.
 *  Vem do SCALE_FIX: a âncora encosta em ±0.86 do NDC, ou seja, 7 % da borda. */
export const PIVOT_MIN = PIVOT_MARGIN;
export const PIVOT_MAX = 1 - PIVOT_MARGIN;

/** Prende um pivot personalizado na área útil (fora dela o modelo seria cortado). */
export function clampPivot(p) {
  // Number(null) é 0 e Number('') é 0 — os dois passariam no isFinite e virariam
  // 0.07 em vez do centro. Ausência tem que cair no padrão, não no piso.
  const num = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const c = (v) => Math.min(PIVOT_MAX, Math.max(PIVOT_MIN, v));
  return { x: c(num(p && p.x, 0.5)), y: c(num(p && p.y, 0.5)) };
}

/** Posição do pivot dentro da célula, normalizada (y medido do TOPO).
 *  É o que vai no metadata.json e o que a engine usa para alinhar. */
export function pivotPoint(pivot, custom = null) {
  if (pivot === 'base') return { x: 0.5, y: 1 - PIVOT_MARGIN };
  if (pivot === 'top') return { x: 0.5, y: PIVOT_MARGIN };
  if (pivot === 'custom') return clampPivot(custom);
  return { x: 0.5, y: 0.5 };
}

/* ------------------------------------------------------------------ *
 * Amostragem de poses
 * ------------------------------------------------------------------ */

/**
 * Escolhe `n` índices distribuídos uniformemente em [0, total-1], sem repetição.
 * Usado para o auto-fit amostrar só alguns frames/direções em vez de todos.
 */
export function pickEven(total, n) {
  const count = Math.max(1, Math.min(n, total));
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  // Com uma amostra só o passo é indefinido ((count-1) no denominador = 0/0 → NaN).
  if (count <= 1) return [0];
  const out = new Set();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (total - 1)) / (count - 1)));
  out.add(0);
  out.add(total - 1);
  return [...out].sort((a, b) => a - b);
}

/**
 * Poses de render: uma por célula da sheet (linha = direção, coluna = frame).
 *
 * Cada pose carrega os DOIS ângulos para eliminar ambiguidade entre o modo
 * padrão e o turntable:
 *  - padrão (gira o MODELO, luz e câmera fixas): modelAzimuth = +a, camAzimuth = 0
 *  - turntable (gira a CÂMERA, modelo parado):   modelAzimuth = 0,  camAzimuth = -a
 *
 * Isso NÃO são vistas equivalentes quando o pivô do modelo difere do centro de
 * órbita da câmera (girar o modelo desloca a geometria no mundo; girar a câmera
 * não). Por isso o auto-fit recebe exatamente estas poses e mede do jeito que o
 * render vai desenhar — é o que garante que a medição nunca descole da imagem.
 */
export function buildPoses({ directionCount, frameCount, times, model, turntable = false, azimuthOffsetDeg = 0 }) {
  const poses = [];
  for (let dir = 0; dir < directionCount; dir++) {
    const a = directionAzimuth(dir, directionCount, azimuthOffsetDeg);
    for (let frame = 0; frame < frameCount; frame++) {
      poses.push({
        dir,
        frame,
        time: times[frame],
        model,
        modelAzimuth: turntable ? 0 : a,
        camAzimuth: turntable ? turntableAzimuth(dir, directionCount, azimuthOffsetDeg) : 0
      });
    }
  }
  return poses;
}

/**
 * Subconjunto de poses para o auto-fit (~maxFrames frames × maxDirections
 * direções), espalhado uniformemente em vez de pegar só o começo.
 */
export function fitPoses(poses, { maxFrames = 6, maxDirections = 4 } = {}) {
  const dirCount = poses.reduce((m, p) => Math.max(m, p.dir + 1), 0);
  const frameCount = poses.reduce((m, p) => Math.max(m, p.frame + 1), 0);
  const dirs = new Set(pickEven(dirCount, maxDirections));
  const frames = new Set(pickEven(frameCount, maxFrames));
  return poses.filter((p) => dirs.has(p.dir) && frames.has(p.frame));
}

/**
 * Tempos de frame.
 * - loop perfeito: N amostras uniformes em [0, duration) → sem frame duplicado;
 * - sem loop perfeito: N amostras em [0, duration] → o último repete o primeiro.
 */
export function frameTimes(duration, frameCount, loopPerfect = true) {
  if (!Number.isFinite(duration) || duration <= 0 || frameCount <= 1) return [0];
  const n = frameCount;
  const divisor = loopPerfect ? n : n - 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push((i * duration) / divisor);
  return out;
}

/**
 * Azimute (rad) da direção `index`: 0 = frente, sentido anti-horário.
 * `offsetDeg` gira a convenção de "frente": muitos modelos olham para +X ou -Z,
 * e sem isso a direção 0 sai de lado.
 */
export function directionAzimuth(index, directionCount, offsetDeg = 0) {
  return (2 * Math.PI * index) / directionCount + THREE.MathUtils.degToRad(offsetDeg);
}

/**
 * Azimute efetivo da câmera para uma direção, quando o turntable está ligado.
 * A câmera orbita no sentido oposto ao do modelo para manter a convenção
 * "0 = frente, anti-horário" igual nos dois modos.
 */
export function turntableAzimuth(index, directionCount, offsetDeg = 0) {
  return -directionAzimuth(index, directionCount, offsetDeg);
}

/** Posição da câmera a partir de centro + azimute + elevação + distância. */
export function cameraPositionAzEl(center, azimuthRad, elevationDeg, distance) {
  const e = THREE.MathUtils.degToRad(elevationDeg);
  const ce = Math.cos(e);
  return new THREE.Vector3(
    center.x + Math.sin(azimuthRad) * ce * distance,
    center.y + Math.sin(e) * distance,
    center.z + Math.cos(azimuthRad) * ce * distance
  );
}

/* ------------------------------------------------------------------ *
 * Auto-fit (câmera ortográfica que enquadra a animação inteira)
 * ------------------------------------------------------------------ */

function lookAtSafe(camera, target) {
  // Perto de 89° a câmera fica quase no eixo Y e o up (0,1,0) degenera.
  camera.up.set(0, 1, 0);
  if (camera.position.y - target.y > 0.999 * camera.position.distanceTo(target)) camera.up.set(0, 0, -1);
  camera.lookAt(target);
}

/** Posiciona e orienta uma câmera que orbita `center`. Usado no fit e no render. */
export function placeCamera(camera, center, azimuthRad, elevationDeg, distance) {
  camera.position.copy(cameraPositionAzEl(center, azimuthRad, elevationDeg, distance));
  lookAtSafe(camera, center);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Cria a câmera ortográfica de render com ±half nas 4 bordas. */
export function createOrthoCamera({ half, center, elevationDeg, azimuthRad = 0, distance = half * 6 + 1 }) {
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, distance * 2);
  return placeCamera(camera, center, azimuthRad, elevationDeg, distance);
}

/**
 * Enquadramento a partir dos extremos medidos por measureFit, para um dado pivot.
 * Devolve o deslocamento do ALVO da câmera (cx, cy) no plano da imagem e o
 * `half` que faz tudo caber. O modelo nunca é movido: quem desloca é a câmera,
 * o que mantém o pivot coerente em qualquer elevação/azimute.
 *
 *  center → o centro do modelo fica no meio da célula;
 *  base   → a base encosta na borda de baixo (pés de personagem no chão);
 *  top    → o topo encosta na borda de cima (itens pendurados, HUD).
 */
/** Enquadramento para um pivot — centro, base, topo OU um ponto personalizado.
 *
 *  Os três presets são casos particulares de UMA fórmula. Dado o pivot na célula
 *  (px, py com y medido do topo), a âncora do modelo cai no NDC
 *      ndcX = 2·px − 1        ndcY = 1 − 2·py
 *  e o ponto do modelo que vira âncora é a fração do bounding box
 *      u = (ndcX/scaleFix + 1)/2      t = (ndcY/scaleFix + 1)/2
 *  (0 = borda esquerda/inferior, 1 = direita/superior). Daí
 *      cx = minX + u·(maxX−minX) − half·ndcX
 *      cy = minY + t·(maxY−minY) − half·ndcY
 *  Conferindo os presets: centro (0.5, 0.5) → u=t=0.5 → centro do box;
 *  base (0.5, 0.93) → t=0 → cy = minY + scaleFix·half; topo → t=1 →
 *  cy = maxY − scaleFix·half. Idêntico ao que estava hardcoded.
 *
 *  Como a âncora é sempre uma fração do próprio bounding box, ela encosta em
 *  ±scaleFix no extremo e o modelo continua inteiro dentro da célula — é por
 *  isso que o pivot personalizado é limitado a [0.07, 0.93]: além disso a
 *  âncora sairia da área útil e o modelo seria cortado.
 */
export function frameForPivot(bounds, pivot = 'center', scaleFix = SCALE_FIX, custom = null) {
  const { minX, maxX, minY, maxY } = bounds;
  const cxCentro = (minX + maxX) / 2;
  const cyMid = (minY + maxY) / 2;
  // O half é sempre o do enquadramento CENTRADO: é o menor valor que não corta
  // nada. Redimensionar por pivot (a tentação óbvia) jogaria o modelo para fora.
  const half = Math.max(
    Math.abs(minX - cxCentro), Math.abs(maxX - cxCentro),
    Math.abs(minY - cyMid), Math.abs(maxY - cyMid)
  ) / scaleFix;
  const p = pivotPoint(pivot, custom);
  const ndcX = 2 * p.x - 1;
  const ndcY = 1 - 2 * p.y;
  const u = (ndcX / scaleFix + 1) / 2;
  const t = (ndcY / scaleFix + 1) / 2;
  const cx = minX + u * (maxX - minX) - half * ndcX;
  const cy = minY + t * (maxY - minY) - half * ndcY;
  return { cx, cy, half, pivot, pivotPoint: p };
}

/**
 * Aplica o deslocamento do pivot deslocando o FRUSTUM da câmera ortográfica em
 * vez de mover o alvo. Medido nas duas formas, o resultado é o mesmo — mas só
 * enquanto o alvo for recalculado a cada azimute, porque o eixo "cima" da
 * câmera muda com ele. No laço de render a câmera é reposicionada por pose e o
 * pivot é aplicado uma única vez, então deslocar o frustum (que vive no espaço
 * da imagem) é o que dispensa esse recálculo por pose. Vale para qualquer
 * azimute e qualquer elevação, inclusive 89°.
 *
 * Com left = cx - half e right = cx + half, o que estava em x = cx no plano da
 * imagem passa a cair em NDC 0 (centro da célula).
 */
export function applyPivotOffset(camera, { cx = 0, cy = 0, half }) {
  camera.left = cx - half;
  camera.right = cx + half;
  camera.bottom = cy - half;
  camera.top = cy + half;
  camera.updateProjectionMatrix();
  return camera;
}

/** Câmera ortográfica já enquadrada e com o pivot aplicado. */
export function createFramedCamera({ half, center, cx = 0, cy = 0, elevationDeg, azimuthRad = 0, distance = half * 6 + 1 }) {
  const camera = createOrthoCamera({ half, center, elevationDeg, azimuthRad, distance });
  applyPivotOffset(camera, { cx, cy, half });
  return { camera, target: center.clone() };
}

/**
 * Mede o enquadramento necessário para TODAS as poses caberem numa célula quadrada.
 *
 * Como faz (e por quê):
 *  1. percorre as poses e guarda o centro do Box3 de cada uma (precise=true, que
 *     no three r169 usa Mesh#getVertexPosition → respeita skinning/morph do Fox);
 *  2. calcula o centro médio das amostras — é para onde a câmera vai olhar;
 *  3. com a câmera já no centro médio (e no azimute que o render vai usar para
 *     aquela pose), transforma os 8 cantos de cada Box3 por
 *     `camera.matrixWorldInverse` (mundo → espaço da câmera) e acumula o maior
 *     |x| e |y| vistos. Só a ROTAÇÃO da câmera define o plano de projeção; a
 *     translação entra apenas porque matrixWorldInverse é a transformação
 *     completa mundo→view, nunca como "direção de view" improvisada.
 *  4. half = max(|x|,|y|) / SCALE_FIX.
 *
 * Medir relativo ao centro FINAL (e não ao centro de cada amostra) é o que evita
 * o sprite "pular" entre frames: todas as poses são medidas no mesmo referencial.
 *
 * @param {Array} poses        poses de buildPoses() (com model, modelAzimuth, camAzimuth, time)
 * @param {Function} applyPose (pose) => void — posiciona o modelo na pose
 * @returns {{center:THREE.Vector3, half:number, maxAbsX:number, maxAbsY:number, samples:number}|null}
 */
export function measureFit(poses, applyPose, { elevationDeg, scaleFix = SCALE_FIX } = {}) {
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  const observed = [];

  for (const pose of poses) {
    applyPose(pose);
    box.setFromObject(pose.model, true);
    if (box.isEmpty()) continue;
    observed.push({ pose, center: box.getCenter(new THREE.Vector3()) });
  }
  if (!observed.length) return null;

  const center = new THREE.Vector3();
  for (const o of observed) center.add(o.center);
  center.divideScalar(observed.length);

  const probe = createOrthoCamera({ half: 1, center, elevationDeg });
  let maxAbsX = 0;
  let maxAbsY = 0;
  // Extremos ASSINADOS no plano da imagem: sem eles não há como saber onde fica
  // a base ou o topo do modelo, e o pivot "base" seria impossível.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const o of observed) {
    applyPose(o.pose);
    box.setFromObject(o.pose.model, true);
    placeCamera(probe, center, o.pose.camAzimuth || 0, elevationDeg, probe.position.distanceTo(center));
    const view = probe.matrixWorldInverse;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      corner.applyMatrix4(view);
      maxAbsX = Math.max(maxAbsX, Math.abs(corner.x));
      maxAbsY = Math.max(maxAbsY, Math.abs(corner.y));
      if (corner.x < minX) minX = corner.x;
      if (corner.x > maxX) maxX = corner.x;
      if (corner.y < minY) minY = corner.y;
      if (corner.y > maxY) maxY = corner.y;
    }
  }

  const maxAbs = Math.max(maxAbsX, maxAbsY);
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return null;
  const bounds = { minX, maxX, minY, maxY };
  return {
    center, half: maxAbs / scaleFix, maxAbsX, maxAbsY, samples: observed.length,
    bounds, frame: frameForPivot(bounds, 'center', scaleFix)
  };
}

/* ------------------------------------------------------------------ *
 * Layout da sheet
 * ------------------------------------------------------------------ */

/**
 * linhas = direções, colunas = frames. Clampa a célula se a sheet passar do limite.
 */
export function computeLayout(directionCount, frameCount, cell, maxSide = MAX_SHEET_SIDE, padding = 0) {
  const cols = Math.max(1, frameCount);
  const rows = Math.max(1, directionCount);
  let c = Math.max(1, Math.floor(cell));
  const pad = Math.max(0, Math.floor(padding));
  let warning = null;
  const sizeFor = (cc) => ({
    w: cols * cc + (cols + 1) * pad,
    h: rows * cc + (rows + 1) * pad
  });
  let size = sizeFor(c);
  if (size.w > maxSide || size.h > maxSide) {
    const before = c;
    c = Math.max(1, Math.floor(Math.min(
      (maxSide - (cols + 1) * pad) / cols,
      (maxSide - (rows + 1) * pad) / rows
    )));
    size = sizeFor(c);
    warning = `sheet passaria de ${maxSide} px: célula reduzida de ${before} para ${c} px`;
  }
  return { cell: c, padding: pad, cols, rows, w: size.w, h: size.h, warning };
}

/** Retângulo (em px) de uma célula dentro da sheet — única fonte da verdade. */
export function cellRect(layout, dir, frame) {
  const step = layout.cell + (layout.padding || 0);
  const pad = layout.padding || 0;
  return { x: pad + frame * step, y: pad + dir * step, w: layout.cell, h: layout.cell };
}

/** Chave de frame no formato do metadata: dir00_001 (direção 2 dígitos, frame 3 dígitos, 1-based). */
export function frameKey(dirIndex, frameIndex) {
  return `dir${String(dirIndex).padStart(2, '0')}_${String(frameIndex + 1).padStart(3, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Metadados
 * ------------------------------------------------------------------ */

/**
 * metadata.json — schema exato pedido no spec (compatível com o CLI do Blender).
 */
export function buildMetadata({
  baseName,
  layout,
  directionCount,
  elevationDeg,
  times,
  fps = DEFAULT_FPS,
  loop = true,
  ssaa = false,
  turntable = false,
  background = 'transparent',
  azimuthOffsetDeg = 0,
  pivot = 'center',
  custom = null,
  lockScale = false,
  pxPerUnit = null,
  shadow = null
}) {
  const cell = layout.cell;
  const perFrameMs = Math.round(1000 / fps);
  const frameCount = times.length;
  const frames = {};
  for (let d = 0; d < directionCount; d++) {
    for (let f = 0; f < frameCount; f++) {
      frames[frameKey(d, f)] = {
        frame: cellRect(layout, d, f),
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell, h: cell },
        sourceSize: { w: cell, h: cell },
        duration: perFrameMs
      };
    }
  }
  return {
    tool: 'SpriteForge Web 1.0',
    image: `${baseName}_sheet.png`,
    size: { w: layout.w, h: layout.h },
    cell: { w: cell, h: cell, padding: layout.padding || 0 },
    grid: { cols: layout.cols, rows: layout.rows },
    // Pivot normalizado (0..1) dentro da célula: é o que as engines usam para
    // posicionar o sprite (Godot: offset; Unity: pivot do Sprite).
    pivot: pivotPoint(pivot, custom),
    directions: {
      count: directionCount,
      layout: 'row-per-direction',
      angle_step_deg: 360 / directionCount,
      angle_offset_deg: azimuthOffsetDeg,
      elevation_deg: elevationDeg,
      order: '0 = frente, sentido anti-horário',
      animation_axis: 'columns'
    },
    animation: {
      // Decisão registrada: tempos de cada frame em MILISSEGUNDOS (casa com duration_ms).
      frames: times.map((t) => Math.round(t * 1000)),
      count: frameCount,
      fps,
      loop,
      duration_ms: Math.round(frameCount * perFrameMs)
    },
    // Escala travada: quando ligada, modelos diferentes saem no mesmo tamanho
    // em px por unidade de mundo, então dá para misturá-los na mesma cena.
    scale: { locked: !!lockScale, px_per_unit: lockScale ? pxPerUnit : null },
    render: { engine: 'webgl', ssaa: !!ssaa, turntable: !!turntable, background },
    // Camada de sombra separada: mesma grade, para o jogo ligar/desligar.
    // null quando a opção estava desligada.
    shadow,
    frames
  };
}

/**
 * Sidecar Aseprite: frames como ARRAY (ordem de leitura da sheet) + uma
 * frameTag `dirNN` por direção.
 */
export function buildAsepriteJson(meta) {
  const cell = meta.cell.w;
  const { rows, cols } = meta.grid;
  const rectLayout = { cell, padding: meta.cell.padding || 0 };
  const frames = [];
  for (let d = 0; d < rows; d++) {
    for (let f = 0; f < cols; f++) {
      const src = meta.frames[frameKey(d, f)];
      frames.push({
        frame: cellRect(rectLayout, d, f),
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell, h: cell },
        sourceSize: { w: cell, h: cell },
        duration: src ? src.duration : meta.animation.duration_ms / cols
      });
    }
  }
  const frameTags = [];
  for (let d = 0; d < rows; d++) {
    frameTags.push({
      name: `dir${String(d).padStart(2, '0')}`,
      from: d * cols,
      to: d * cols + cols - 1,
      direction: 'forward'
    });
  }
  return {
    frames,
    meta: {
      app: meta.tool,
      version: '1.0',
      image: meta.image,
      format: 'RGBA8888',
      size: { w: meta.size.w, h: meta.size.h },
      scale: '1',
      // Slice "pivot": abre o Aseprite com o anchor já no lugar certo.
      slices: meta.pivot ? [{
        name: 'pivot',
        color: '#0000ff',
        keys: [{
          frame: 0,
          bounds: { x: 0, y: 0, w: cell, h: cell },
          center: { x: 0, y: 0, w: 0, h: 0 },
          pivot: { x: Math.round(meta.pivot.x * cell), y: Math.round(meta.pivot.y * cell) }
        }]
      }] : [],
      frameTags
    }
  };
}

/* ------------------------------------------------------------------ *
 * GIF
 * ------------------------------------------------------------------ */

/**
 * Codifica um GIF animado com fundo transparente.
 *
 * Transparência em GIF é por ÍNDICE, então: quantiza, força palette[0] =
 * magenta (255,0,255), marca índice 0 em todo pixel com alpha < GIF_ALPHA_CUT e
 * passa transparent/transparentIndex no writeFrame. Os pixels transparentes
 * recebem RGB magenta ANTES de quantizar para que o magenta exista de fato na
 * paleta e nenhum pixel opaco escuro caia por engano no índice 0.
 *
 * `transparent: false` é para o GIF com fundo: aí ninguém vira índice 0 e a
 * paleta não precisa reservar o magenta (e nenhum pixel escuro corre o risco de
 * cair no índice 0 e virar buraco).
 *
 * @param {Array<Uint8ClampedArray>} frames RGBA, comprimento w*h*4
 */
/** Garante a cor transparente no índice 0 SEM apagar uma cor de verdade.
 *
 *  O que se fazia antes era `palette[0] = [255,0,255]`, e isso rouba um slot:
 *  se o índice 0 já tinha uma cor da imagem, todos os pixels daquela cor viravam
 *  transparentes. Num quadro só de sombra a paleta tem UMA cor (o preto), então a
 *  sombra inteira sumia — o GIF saía byte a byte igual ao de um quadro vazio. */
export function reservarTransparente(palette) {
  const alvo = [255, 0, 255];
  const mesmo = (c) => c[0] === 255 && c[1] === 0 && c[2] === 255;
  const achou = palette.findIndex(mesmo);
  if (achou === 0) return palette;
  if (achou > 0) {                       // troca: o magenta assume o índice 0
    palette[achou] = palette[0];
    palette[0] = alvo;
    return palette;
  }
  palette.push(alvo.slice());            // não havia magenta: acrescenta uma cor
  palette.unshift(palette.pop());        // quantize(data, 255) deixa vaga para ela
  return palette;
}

export function encodeGif({ width, height, frames, delays = [], repeat = 0, alphaCut = GIF_ALPHA_CUT, transparent = true, dither = false }) {
  const gif = GIFEncoder();
  const count = width * height;
  frames.forEach((rgba, i) => {
    const data = new Uint8ClampedArray(rgba);
    const mask = alphaMask(rgba, alphaCut, { dither, width });
    let palette;
    if (transparent) {
      for (let p = 0; p < count; p++) {
        if (mask[p]) {
          data[p * 4] = 255;
          data[p * 4 + 1] = 0;
          data[p * 4 + 2] = 255;
        }
      }
      palette = reservarTransparente(quantize(data, 255));
    } else {
      palette = quantize(data, 256);
    }
    const index = applyPalette(data, palette, 'rgb565');
    if (transparent) for (let p = 0; p < count; p++) if (mask[p]) index[p] = 0;
    gif.writeFrame(index, width, height, {
      palette,
      delay: Math.round(delays[i] ?? 1000 / DEFAULT_FPS),
      transparent,
      transparentIndex: 0,
      repeat,
      first: i === 0
    });
  });
  gif.finish();
  return gif.bytes();
}

/* ------------------------------------------------------------------ *
 * Formatos de entrada
 * ------------------------------------------------------------------ */

/** O que este app sabe abrir. `kind` decide qual loader usar. */
export const SUPPORTED_FORMATS = [
  { ext: 'glb', kind: 'gltf', label: 'glTF binário' },
  { ext: 'gltf', kind: 'gltf', label: 'glTF JSON' },
  { ext: 'obj', kind: 'obj', label: 'Wavefront OBJ' },
  { ext: 'fbx', kind: 'fbx', label: 'Autodesk FBX' },
  { ext: 'stl', kind: 'stl', label: 'STL' },
  { ext: 'ply', kind: 'ply', label: 'PLY' }
];
export const SUPPORTED_EXTENSIONS = SUPPORTED_FORMATS.map((f) => f.ext);
/** Valor pronto para o atributo `accept` do <input type="file">. */
export const ACCEPT_ATTR = `${SUPPORTED_EXTENSIONS.map((e) => '.' + e).join(',')},model/gltf-binary,model/gltf+json`;

/** Extensão em minúsculas, sem ponto ('' se não houver). */
export function formatOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}
export function formatInfo(name) {
  return SUPPORTED_FORMATS.find((f) => f.ext === formatOf(name)) || null;
}
export function isSupported(name) {
  return !!formatInfo(name);
}
/** Só glTF e FBX trazem animação; os demais viram 1 frame por direção. */
export function supportsAnimation(name) {
  const info = formatInfo(name);
  return !!info && (info.kind === 'gltf' || info.kind === 'fbx');
}

const MIME_BY_EXT = {
  bin: 'application/octet-stream',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', ktx2: 'image/ktx2', basis: 'image/basis'
};

function toBase64(bytes) {
  // btoa é global no navegador e também no Node 16+ (usado nos testes).
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Um `.gltf` solto referencia `.bin` e texturas por URI relativa — e um arquivo
 * arrastado do disco não tem URL. Quando o usuário arrasta vários arquivos
 * juntos, trocamos cada URI por um `data:` URI embutido, e o GLTFLoader resolve
 * tudo sozinho.
 *
 * @param {object} json   conteúdo já parseado do .gltf
 * @param {Map<string, Uint8Array>} siblings  demais arquivos arrastados, por nome
 * @returns {{json:object, missing:string[]}}
 */
export function resolveGltfExternal(json, siblings) {
  const byName = new Map();
  for (const [name, bytes] of siblings || []) byName.set(String(name).toLowerCase(), bytes);
  const missing = [];
  const patched = JSON.parse(JSON.stringify(json));
  const swap = (owner) => {
    const uri = owner.uri;
    if (typeof uri !== 'string' || uri.startsWith('data:')) return;
    let clean;
    try {
      clean = decodeURIComponent(uri.split('/').pop().split('?')[0]).toLowerCase();
    } catch {
      clean = uri.split('/').pop().toLowerCase();
    }
    const bytes = byName.get(clean);
    if (!bytes) { missing.push(uri); return; }
    owner.uri = `data:${MIME_BY_EXT[formatOf(clean)] || 'application/octet-stream'};base64,${toBase64(bytes)}`;
  };
  for (const buffer of patched.buffers || []) swap(buffer);
  for (const image of patched.images || []) swap(image);
  return { json: patched, missing };
}

/**
 * Uma normal pode existir e ainda assim ser inútil: há exportador que grava
 * (0,0,0) em vez de omitir o atributo, e o modelo renderiza preto. O OBJLoader
 * do three NÃO faz isso (ele deriva a normal da faceta), mas PLY/OBJ de outras
 * origens podem. Amostramos alguns vértices para manter o custo limitado.
 */
function normalsAreDegenerate(normal) {
  const count = normal.count;
  const steps = Math.min(count, 256);
  for (let i = 0; i < steps; i++) {
    const idx = Math.floor((i * count) / steps);
    if (normal.getX(idx) !== 0 || normal.getY(idx) !== 0 || normal.getZ(idx) !== 0) return false;
  }
  return true;
}

/**
 * Prepara qualquer modelo recém-carregado para o render: projeta sombra, sem
 * frustum culling (skin se move), normal válida e vertex colors ligados quando
 * a geometria traz cor.
 */
export function prepareLoaded(root, { doubleSide = false } = {}) {
  const stats = { meshes: 0, computedNormals: 0, vertexColors: 0 };
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    stats.meshes++;
    obj.castShadow = true;
    obj.frustumCulled = false;
    const geometry = obj.geometry;
    if (geometry) {
      const normal = geometry.getAttribute('normal');
      if (!normal || normalsAreDegenerate(normal)) {
        geometry.computeVertexNormals();
        stats.computedNormals++;
      }
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material) continue;
      if (doubleSide) material.side = THREE.DoubleSide;
      if (geometry && geometry.hasAttribute('color') && 'vertexColors' in material) {
        material.vertexColors = true;
        stats.vertexColors++;
      }
      material.needsUpdate = true;
    }
  });
  return stats;
}

/* ------------------------------------------------------------------ *
 * Rig de luz
 * ------------------------------------------------------------------ */

/**
 * Posiciona as luzes do rig em torno do modelo.
 *
 * A posição de uma DirectionalLight define a DIREÇÃO, mas também a origem da
 * câmera de sombra. Deixar as luzes em coordenadas fixas (4,8,6) coloca a luz
 * DENTRO de qualquer modelo maior que ~10 unidades — o Fox do exemplo tem raio
 * ~88, então a sombra simplesmente não aparecia. Daí escalar pela bounding sphere.
 *
 * @param {Array<{light:THREE.Light, dir:THREE.Vector3, distance?:number}>} rig
 */
export function placeLightRig(rig, center, radius, { near = 0.05, far = 12, shadowSpan = 1.6 } = {}) {
  const r = Math.max(radius, 1e-3);
  for (const entry of rig) {
    entry.light.position.copy(center).addScaledVector(entry.dir, r * (entry.distance || 4));
    const shadow = entry.light.shadow;
    if (!shadow || !shadow.camera) continue;
    const span = r * shadowSpan;
    shadow.camera.left = -span;
    shadow.camera.right = span;
    shadow.camera.top = span;
    shadow.camera.bottom = -span;
    shadow.camera.near = r * near;
    shadow.camera.far = r * far;
    shadow.camera.updateProjectionMatrix();
  }
  return r;
}

/* ------------------------------------------------------------------ *
 * Higiene de memória
 * ------------------------------------------------------------------ */

/**
 * Libera geometrias/materiais/texturas de uma hierarquia inteira.
 * Chamado antes de trocar de modelo (a GPU do usuário tem 8 GB, mas sheet +
 * viewport + previews somam rápido).
 * @returns {{geometries:number, materials:number, textures:number}}
 */
export function disposeHierarchy(root) {
  const seen = new Set();
  const stats = { geometries: 0, materials: 0, textures: 0 };
  const dropMaterial = (material) => {
    if (!material || seen.has(material)) return;
    seen.add(material);
    for (const key of Object.keys(material)) {
      const value = material[key];
      if (value && value.isTexture && !seen.has(value)) {
        seen.add(value);
        value.dispose();
        stats.textures++;
      }
    }
    material.dispose();
    stats.materials++;
  };
  root.traverse((obj) => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
      stats.geometries++;
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(dropMaterial);
      else dropMaterial(obj.material);
    }
  });
  return stats;
}

/* ================================================================== *
 * Projeto salvo (.spriteforge.json)
 * ================================================================== *
 * Guarda só o que é reprodução: as opções do painel e a identidade do modelo.
 * NÃO guarda o modelo em si — um .glb de 40 MB dentro de um .json seria
 * ilegível e inútil, e o caminho absoluto de quem salvou não existe na máquina
 * de quem abre. Por isso o projeto lembra o NOME do modelo e avisa.
 */

export const PROJECT_KIND = 'spriteforge.project';
export const PROJECT_VERSION = 1;

/** Chaves que o projeto pode carregar — qualquer outra é descartada na leitura. */
const CHAVES_SETTINGS = Object.keys(DEFAULT_SETTINGS);

/**
 * Monta o objeto de projeto.
 * @param {object} settings - o painel atual (mesma forma de DEFAULT_SETTINGS)
 * @param {{nome?:string, formato?:string}} [modelo] - identidade do modelo carregado
 */
export function buildProject(settings, modelo = null) {
  const limpo = {};
  for (const chave of CHAVES_SETTINGS) {
    if (settings && chave in settings) limpo[chave] = settings[chave];
  }
  return {
    kind: PROJECT_KIND,
    version: PROJECT_VERSION,
    tool: 'SpriteForge Web',
    criadoEm: new Date().toISOString(),
    modelo: modelo && modelo.nome
      ? { nome: String(modelo.nome), formato: modelo.formato ? String(modelo.formato) : null }
      : null,
    settings: limpo
  };
}

/**
 * Valida e normaliza um projeto lido do disco.
 * Nunca lança: devolve `{ ok, projeto?, erro? }` para a UI mostrar a mensagem.
 * Um projeto de versão futura é aceito — as chaves que esta versão não conhece
 * são simplesmente ignoradas, e as que faltam vêm de DEFAULT_SETTINGS.
 */
export function parseProject(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'não é um JSON válido' };
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, erro: 'o arquivo não contém um objeto de projeto' };
  }
  // Tolera também o formato das preferências do localStorage, que já guarda
  // { preset, settings }: quem exportou aquilo consegue importar aqui.
  if (dados.kind !== PROJECT_KIND && !dados.settings) {
    return { ok: false, erro: 'não parece um projeto do SpriteForge (falta "kind" e "settings")' };
  }
  if (typeof dados.settings !== 'object' || dados.settings === null || Array.isArray(dados.settings)) {
    return { ok: false, erro: 'o campo "settings" não é um objeto' };
  }
  const settings = { ...DEFAULT_SETTINGS };
  const ignoradas = [];
  for (const chave of CHAVES_SETTINGS) {
    if (!(chave in dados.settings)) continue;
    const valor = dados.settings[chave];
    if (valor === null || valor === undefined) continue;
    const padrao = DEFAULT_SETTINGS[chave];
    if (typeof padrao === 'number' && !Number.isFinite(Number(valor))) {
      ignoradas.push(chave);
      continue;
    }
    if (typeof padrao === 'boolean' && typeof valor !== 'boolean') {
      ignoradas.push(chave);
      continue;
    }
    if (typeof padrao === 'string' && typeof valor !== 'string') {
      ignoradas.push(chave);
      continue;
    }
    settings[chave] = typeof padrao === 'number' ? Number(valor) : valor;
  }
  const modelo = dados.modelo && typeof dados.modelo === 'object' && dados.modelo.nome
    ? { nome: String(dados.modelo.nome), formato: dados.modelo.formato ? String(dados.modelo.formato) : null }
    : null;
  return {
    ok: true,
    projeto: {
      version: Number.isFinite(Number(dados.version)) ? Number(dados.version) : 0,
      criadoEm: typeof dados.criadoEm === 'string' ? dados.criadoEm : null,
      modelo,
      settings
    },
    ignoradas
  };
}

/* ================================================================== *
 * Censo de alpha — para saber se uma folha saiu vazia
 * ================================================================== *
 * "A sombra saiu vazia" é impossível de diagnosticar de longe: pode ser a
 * luz, o chão fora do enquadramento, a opacidade, ou o export. Contar os
 * pixels na hora da geração transforma a suposição em número.
 */

/**
 * Conta pixels e acha a caixa ocupada de um buffer RGBA.
 * @param {Uint8ClampedArray|Uint8Array} data - RGBA, 4 bytes por pixel
 * @param {number} largura
 * @param {number} [corteAlpha=1] - alpha mínimo para contar como visível
 * @returns {{visiveis:number, total:number, fracao:number, vazio:boolean,
 *            caixa:{x:number,y:number,w:number,h:number}|null}}
 */
/** Varre o alpha de uma região retangular: contagem + caixa, em coordenadas da
 *  região. Base comum de `alphaCensus` (folha inteira) e `trimBoxes` (célula a
 *  célula) — os dois precisam exatamente da mesma varredura. */
function scanAlphaRegion(data, largura, corteAlpha, ox, oy, w, h) {
  let visiveis = 0;
  let minX = Infinity; let minY = Infinity;
  let maxX = -Infinity; let maxY = -Infinity;
  for (let y = 0; y < h; y += 1) {
    const base = ((oy + y) * largura + ox) * 4 + 3;
    for (let x = 0; x < w; x += 1) {
      if (data[base + x * 4] < corteAlpha) continue;
      visiveis += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { visiveis, minX, minY, maxX, maxY };
}

const caixaDe = (r) => (r.visiveis
  ? { x: r.minX, y: r.minY, w: r.maxX - r.minX + 1, h: r.maxY - r.minY + 1 }
  : null);

export function alphaCensus(data, largura, corteAlpha = 1) {
  const total = Math.floor(data.length / 4);
  const altura = largura > 0 ? Math.floor(total / largura) : 0;
  const r = largura > 0 && altura > 0
    ? scanAlphaRegion(data, largura, corteAlpha, 0, 0, largura, altura)
    : { visiveis: 0 };
  return {
    visiveis: r.visiveis,
    total,
    fracao: total ? r.visiveis / total : 0,
    vazio: r.visiveis === 0,
    caixa: caixaDe(r)
  };
}

/* ------------------------------------------------------------------ *
 * Trim / compactação (pacote B5)
 * ------------------------------------------------------------------ */

/** Reescreve um metadata de grade para descrever uma folha COMPACTADA.
 *  Não inventa campo nenhum: `trimmed`, `spriteSourceSize` e `sourceSize` já
 *  existiam no schema e estavam sempre em "não cortado". É a convenção
 *  TexturePacker/Aseprite — `sourceSize` é a célula lógica, `frame` é o retângulo
 *  físico na folha compactada — então Godot, Unity e Aseprite já entendem.
 *  `cell` e `grid` passam a descrever a célula de ORIGEM (o que cada frame era
 *  antes do corte), não a folha; quem lê usa `frames[*].frame`. */
export function applyTrimToMetadata(meta, { boxes, placements, size }) {
  const cell = meta.cell.w;
  const frames = {};
  const cols = meta.grid.cols;
  const rows = meta.grid.rows;
  // Itera por (direção, frame) e deriva a chave com frameKey, em vez de fatiar a
  // string de volta. Fatiar é frágil: 'dir00_001' tem 9 caracteres, e um slice
  // errado dá NaN silenciosamente — todo frame sairia "vazio".
  for (let d = 0; d < rows; d += 1) {
    for (let f = 0; f < cols; f += 1) {
      const chave = frameKey(d, f);
      const origem = meta.frames[chave];
      if (!origem) continue;
      const i = d * cols + f;
      const caixa = boxes ? boxes[i] && boxes[i].caixa : null;
      const pl = placements ? placements[i] : null;
      if (!caixa || !pl) {
        // Frame vazio: retângulo 0x0 é o que o formato espera, não um pixel solto.
        frames[chave] = {
          ...origem,
          frame: { x: 0, y: 0, w: 0, h: 0 },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
          sourceSize: { w: cell, h: cell }
        };
        continue;
      }
      frames[chave] = {
        ...origem,
        frame: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: caixa.x, y: caixa.y, w: caixa.w, h: caixa.h },
        sourceSize: { w: cell, h: cell }
      };
    }
  }
  return {
    ...meta,
    image: meta.image.replace(/_sheet\.png$/, '_sheet_packed.png'),
    size: { w: size.w, h: size.h },
    frames
  };
}

/** Caixa de alpha de cada célula da grade, em coordenadas DA CÉLULA.
 *  É o que o trim precisa: o retângulo que realmente tem tinta. Frames vazios
 *  vêm com `caixa: null` — num sprite sheet animado isso é normal (quadros em
 *  que o efeito ainda não apareceu) e não pode virar retângulo 0×0 no pacote. */
export function trimBoxes(data, largura, layout, corteAlpha = 1) {
  const cell = layout.cell;
  const pad = layout.padding || 0;
  const step = cell + pad;
  const out = [];
  for (let dir = 0; dir < layout.rows; dir += 1) {
    for (let frame = 0; frame < layout.cols; frame += 1) {
      const r = scanAlphaRegion(
        data, largura, corteAlpha, pad + frame * step, pad + dir * step, cell, cell
      );
      out.push({ dir, frame, vazio: r.visiveis === 0, caixa: caixaDe(r) });
    }
  }
  return out;
}

/** Empacota retângulos por prateleiras e escolhe a largura de MENOR área.
 *  Não gira nada, então `rotated` continua false no metadata — é o formato
 *  TexturePacker/Aseprite que Godot e Unity já entendem.
 *  Retorna `placements` alinhado por índice com `boxes` (null para vazio). */
export function packRects(boxes, { maxSide = MAX_SHEET_SIDE, padding = 0 } = {}) {
  const pad = Math.max(0, Math.floor(padding));
  const itens = [];
  boxes.forEach((b, index) => {
    if (b && b.w > 0 && b.h > 0) itens.push({ index, w: b.w, h: b.h });
  });
  const vazio = { w: 0, h: 0, area: 0, placements: new Array(boxes.length).fill(null), overflow: false };
  if (!itens.length) return vazio;

  const empacotar = (largura) => {
    const ord = itens.slice().sort((p, q) => (q.h - p.h) || (q.w - p.w));
    const placed = new Array(boxes.length).fill(null);
    let x = pad; let y = pad; let shelfH = 0; let maxX = pad;
    for (const it of ord) {
      if (x + it.w + pad > largura) {          // não cabe: próxima prateleira
        x = pad; y += shelfH + pad; shelfH = 0;
      }
      placed[it.index] = { x, y, w: it.w, h: it.h };
      x += it.w + pad;
      if (x > maxX) maxX = x;
      if (it.h > shelfH) shelfH = it.h;
    }
    return { w: maxX, h: y + shelfH + pad, placed };
  };

  // Candidatas: larguras que acomodam exatamente as k caixas mais largas numa
  // fila, mais uma estimativa por área total. Testar só uma largura fixa
  // desperdiça muito — a melhor depende da distribuição dos tamanhos.
  const porLargura = itens.slice().sort((p, q) => q.w - p.w);
  const candidatas = new Set();
  let acc = pad;
  for (const it of porLargura) { acc += it.w + pad; candidatas.add(acc); }
  const areaTotal = itens.reduce((soma, it) => soma + (it.w + pad) * (it.h + pad), 0);
  candidatas.add(Math.max(Math.ceil(Math.sqrt(areaTotal)) + pad, porLargura[0].w + 2 * pad));

  let melhor = null;
  for (const L of candidatas) {
    if (L > maxSide) continue;
    const r = empacotar(L);
    if (r.h > maxSide) continue;
    if (!melhor || r.w * r.h < melhor.w * melhor.h) melhor = r;
  }
  if (!melhor) {                                // nada coube: quem chama avisa
    melhor = empacotar(maxSide);
  }
  return {
    w: melhor.w,
    h: melhor.h,
    area: melhor.w * melhor.h,
    placements: melhor.placed,
    overflow: melhor.w > maxSide || melhor.h > maxSide
  };
}
