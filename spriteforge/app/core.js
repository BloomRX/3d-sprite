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
export function buildPoses({ directionCount, frameCount, times, model, turntable = false }) {
  const poses = [];
  for (let dir = 0; dir < directionCount; dir++) {
    const a = directionAzimuth(dir, directionCount);
    for (let frame = 0; frame < frameCount; frame++) {
      poses.push({
        dir,
        frame,
        time: times[frame],
        model,
        modelAzimuth: turntable ? 0 : a,
        camAzimuth: turntable ? turntableAzimuth(dir, directionCount) : 0
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

/** Azimute (rad) da direção `index`: 0 = frente, sentido anti-horário. */
export function directionAzimuth(index, directionCount) {
  return (2 * Math.PI * index) / directionCount;
}

/**
 * Azimute efetivo da câmera para uma direção, quando o turntable está ligado.
 * A câmera orbita no sentido oposto ao do modelo para manter a convenção
 * "0 = frente, anti-horário" igual nos dois modos.
 */
export function turntableAzimuth(index, directionCount) {
  return -directionAzimuth(index, directionCount);
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
    }
  }

  const maxAbs = Math.max(maxAbsX, maxAbsY);
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return null;
  return { center, half: maxAbs / scaleFix, maxAbsX, maxAbsY, samples: observed.length };
}

/* ------------------------------------------------------------------ *
 * Layout da sheet
 * ------------------------------------------------------------------ */

/**
 * linhas = direções, colunas = frames. Clampa a célula se a sheet passar do limite.
 */
export function computeLayout(directionCount, frameCount, cell, maxSide = MAX_SHEET_SIDE) {
  const cols = Math.max(1, frameCount);
  const rows = Math.max(1, directionCount);
  let c = Math.max(1, Math.floor(cell));
  let warning = null;
  if (cols * c > maxSide || rows * c > maxSide) {
    const before = c;
    c = Math.max(1, Math.floor(Math.min(maxSide / cols, maxSide / rows)));
    warning = `sheet passaria de ${maxSide} px: célula reduzida de ${before} para ${c} px`;
  }
  return { cell: c, cols, rows, w: cols * c, h: rows * c, warning };
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
  background = 'transparent'
}) {
  const cell = layout.cell;
  const perFrameMs = Math.round(1000 / fps);
  const frameCount = times.length;
  const frames = {};
  for (let d = 0; d < directionCount; d++) {
    for (let f = 0; f < frameCount; f++) {
      frames[frameKey(d, f)] = {
        frame: { x: f * cell, y: d * cell, w: cell, h: cell },
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
    cell: { w: cell, h: cell },
    grid: { cols: layout.cols, rows: layout.rows },
    directions: {
      count: directionCount,
      layout: 'row-per-direction',
      angle_step_deg: 360 / directionCount,
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
  const frames = [];
  for (let d = 0; d < rows; d++) {
    for (let f = 0; f < cols; f++) {
      const src = meta.frames[frameKey(d, f)];
      frames.push({
        frame: { x: f * cell, y: d * cell, w: cell, h: cell },
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
