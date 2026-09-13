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
/** Pixels com alpha abaixo disso viram índice 0 (transparente) no GIF. */
export const GIF_ALPHA_CUT = 8;
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
  loopPerfect: true, fps: 12, zoom: 1, gifScale: 1
};

/**
 * Atalhos por tipo de projeto. Cada um é um patch sobre DEFAULT_SETTINGS, então
 * adicionar um controle novo não quebra os presets.
 */
export const PRESETS = {
  default: {},
  // Personagem de plataforma: câmera na altura do chão, pé ancorado embaixo.
  char2d: { elevation: 0, pivot: 'base', cell: 128, shadow: true, lightCamera: false },
  // Isométrico: 30° (dimétrico) e escala travada para vários objetos combinarem.
  iso: { elevation: 30, pivot: 'center', cell: 128, lockScale: true, pxPerUnit: 8, shadow: true },
  // Itens/ícones: 4 direções, célula pequena, luz frontal sem sombra.
  props: { directions: 4, elevation: 0, pivot: 'center', cell: 64, shadow: false, lightCamera: true }
};

export function presetSettings(name) {
  return { ...DEFAULT_SETTINGS, ...(PRESETS[name] || {}) };
}

/** Pivot normalizado (0..1) dentro da célula, no formato que as engines usam. */
export function pivotPoint(pivot) {
  if (pivot === 'base') return { x: 0.5, y: 1 - PIVOT_MARGIN };
  if (pivot === 'top') return { x: 0.5, y: PIVOT_MARGIN };
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
export function frameForPivot(bounds, pivot = 'center', scaleFix = SCALE_FIX) {
  const { minX, maxX, minY, maxY } = bounds;
  const cx = (minX + maxX) / 2;
  const cyMid = (minY + maxY) / 2;
  // O half é sempre o do enquadramento CENTRADO: é o menor valor que não corta
  // nada. Redimensionar por pivot (a tentação óbvia) jogaria o modelo para fora.
  const half = Math.max(
    Math.abs(minX - cx), Math.abs(maxX - cx),
    Math.abs(minY - cyMid), Math.abs(maxY - cyMid)
  ) / scaleFix;
  // Aí o alvo desliza até encostar a âncora na borda útil (±scaleFix), usando a
  // folga que existir. Quando a altura do modelo é o que limita o half, não há
  // folga vertical e "base" coincide com "center" — é o resultado correto, não
  // uma falha: numa célula quadrada não dá para ancorar no pé e manter o topo.
  let cy = cyMid;
  if (pivot === 'base') cy = minY + scaleFix * half;
  else if (pivot === 'top') cy = maxY - scaleFix * half;
  return { cx, cy, half, pivot };
}

/**
 * Câmera ortográfica enquadrada num alvo deslocado por (cx, cy) no plano da
 * imagem. Os eixos (direita/cima) saem da própria matrixWorld da câmera já
 * orientada, então funciona em qualquer elevação — inclusive perto de 89°,
 * onde o "up" do mundo degenera.
 */
export function createFramedCamera({ half, center, cx = 0, cy = 0, elevationDeg, azimuthRad = 0, distance = half * 6 + 1 }) {
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, distance * 2);
  placeCamera(camera, center, azimuthRad, elevationDeg, distance);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const target = center.clone().addScaledVector(right, cx).addScaledVector(up, cy);
  placeCamera(camera, target, azimuthRad, elevationDeg, distance);
  return { camera, target };
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
  lockScale = false,
  pxPerUnit = null
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
    pivot: pivotPoint(pivot),
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
 * @param {Array<Uint8ClampedArray>} frames RGBA, comprimento w*h*4
 */
export function encodeGif({ width, height, frames, delays = [], repeat = 0 }) {
  const gif = GIFEncoder();
  const count = width * height;
  frames.forEach((rgba, i) => {
    const data = new Uint8ClampedArray(rgba);
    for (let p = 0; p < count; p++) {
      if (data[p * 4 + 3] < GIF_ALPHA_CUT) {
        data[p * 4] = 255;
        data[p * 4 + 1] = 0;
        data[p * 4 + 2] = 255;
      }
    }
    const palette = quantize(data, 255);
    palette[0] = [255, 0, 255];
    const index = applyPalette(data, palette, 'rgb565');
    for (let p = 0; p < count; p++) if (rgba[p * 4 + 3] < GIF_ALPHA_CUT) index[p] = 0;
    gif.writeFrame(index, width, height, {
      palette,
      delay: Math.round(delays[i] ?? 1000 / DEFAULT_FPS),
      transparent: true,
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
