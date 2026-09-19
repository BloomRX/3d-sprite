/**
 * SpriteForge Web — app.js
 *
 * Camada de DOM + WebGL. Toda a matemática (auto-fit, layout, metadados, GIF)
 * mora em ./core.js, que não conhece DOM e por isso é testável fora do browser.
 *
 * Sem build, sem CDN, sem backend: só módulos ES relativos.
 */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { zipSync, strToU8 } from './libs/fflate.module.js';
import * as core from './core.js';
import { aplicarIdioma, t, idiomaAtual } from './i18n.js';
import { criarGravador } from './log.js';
import * as pasta from './pasta.js';

/* ================================================================== *
 * 0. Referências de DOM e estado
 * ================================================================== */
const $ = (id) => document.getElementById(id);
const el = {
  fileInput: $('fileInput'), btnOpen: $('btnOpen'), btnSample: $('btnSample'), modelInfo: $('modelInfo'),
  btnSampleStatic: $('btnSampleStatic'),
  btnSaveProject: $('btnSaveProject'), btnOpenProject: $('btnOpenProject'), projectInput: $('projectInput'),
  btnLogTxt: $('btnLogTxt'), btnLogJson: $('btnLogJson'), btnLogLimpar: $('btnLogLimpar'), logCount: $('logCount'),
  btnPastaSaida: $('btnPastaSaida'), toast: $('toast'),
  btnDiag: $('btnDiag'), diagPanel: $('diagPanel'), diagBody: $('diagBody'), btnCopyDiag: $('btnCopyDiag'), btnCloseDiag: $('btnCloseDiag'),
  tab3d: $('tab3d'), tabResults: $('tabResults'), viewPane: $('viewPane'), resultPane: $('resultPane'),
  clipSelect: $('clipSelect'), btnPlay: $('btnPlay'), scrub: $('scrub'), scrubVal: $('scrubVal'), chkLoopPerfect: $('chkLoopPerfect'),
  selDirections: $('selDirections'), rngElevation: $('rngElevation'), elevationVal: $('elevationVal'),
  rngAzimuth: $('rngAzimuth'), azimuthVal: $('azimuthVal'), selPivot: $('selPivot'),
  rowPivotCustom: $('rowPivotCustom'), pivotXVal: $('pivotXVal'), pivotYVal: $('pivotYVal'),
  rngPadding: $('rngPadding'), paddingVal: $('paddingVal'),
  chkLockScale: $('chkLockScale'), rowScaleLock: $('rowScaleLock'), rngScaleLock: $('rngScaleLock'), scaleLockVal: $('scaleLockVal'),
  rngFrames: $('rngFrames'), framesVal: $('framesVal'),
  rngCell: $('rngCell'), cellVal: $('cellVal'), chkSsaa: $('chkSsaa'), selBackground: $('selBackground'),
  chkTurntable: $('chkTurntable'), chkShadow: $('chkShadow'),
  chkShadowLayer: $('chkShadowLayer'), chkTrim: $('chkTrim'),
  rowPacked: $('rowPacked'), packedInfo: $('packedInfo'), dlPacked: $('dlPacked'),
  chkLightCamera: $('chkLightCamera'), rngLightAz: $('rngLightAz'), lightAzVal: $('lightAzVal'),
  rngLightInt: $('rngLightInt'), lightIntVal: $('lightIntVal'),
  btnGenerate: $('btnGenerate'), btnCancel: $('btnCancel'),
  progressWrap: $('progressWrap'), progressBar: $('progressBar'), progressLabel: $('progressLabel'),
  viewport: $('viewport'), viewportWrap: $('viewportWrap'), viewBadge: $('viewBadge'), loadError: $('loadError'),
  sheetPreview: $('sheetPreview'), chkGrid: $('chkGrid'), chkPivotMark: $('chkPivotMark'), sheetInfo: $('sheetInfo'),
  btnReframe: $('btnReframe'), selIdioma: $('selIdioma'),
  dlZip: $('dlZip'), dlSheet: $('dlSheet'), dlShadow: $('dlShadow'), dlSheetShadow: $('dlSheetShadow'), dlJson: $('dlJson'), dlAseprite: $('dlAseprite'), jsonInfo: $('jsonInfo'),
  playerFrame: $('playerFrame'), playerCanvas: $('playerCanvas'), playerDir: $('playerDir'), btnPlayerPlay: $('btnPlayerPlay'),
  chkPlayerShadow: $('chkPlayerShadow'),
  rngFps: $('rngFps'), fpsVal: $('fpsVal'), rngZoom: $('rngZoom'), zoomVal: $('zoomVal'),
  btnGif: $('btnGif'), rngGifScale: $('rngGifScale'), selGifBg: $('selGifBg'), selShadowGif: $('selShadowGif'), gifList: $('gifList'), status: $('status')
};
const faltando = Object.entries(el).filter(([, node]) => !node).map(([k]) => k);
if (faltando.length) console.error('ids ausentes no index.html:', faltando.join(', '));

const state = {
  name: 'modelo',
  model: null,
  mixer: null,
  clips: [],
  clipIndex: -1,
  playing: false,
  generating: false,
  clock: new THREE.Clock(),
  modelBox: new THREE.Box3(),
  modelRadius: 1,
  result: null,        // { layout, meta, aseprite, sheet, fps }
  player: { dir: 0, frame: 0, playing: true, last: 0 },
  cancelled: false,
  gifUrls: new Map()
};

/* ---- gravador de sessão ----
 * Fila de tamanho fixo com tudo o que aconteceu. O relatório gerado responde
 * duas coisas: o que foi feito (e quanto levou) e o que NUNCA foi tocado, que é
 * justamente o que continua sem verificação. `setStatus` é ponto único, então
 * anotar aqui captura a linha do tempo inteira sem tocar em cada chamada.
 * `setProgress` fica de fora de propósito: roda por célula e inundaria a fila. */
const LOG_KEY = 'spriteforge.sessao';
window.addEventListener('error', (e) => {
  gravador.registrar('erro', `não capturado: ${e.message}`, {
    origem: `${e.filename || '?'}:${e.lineno || 0}`, stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1200) : null
  });
  gravador.contarErro();
  gravarSessao();
});
window.addEventListener('unhandledrejection', (e) => {
  const motivo = e.reason instanceof Error ? e.reason.message : String(e.reason);
  gravador.registrar('erro', `promessa rejeitada: ${motivo}`);
  gravador.contarErro();
  gravarSessao();
});
const gravador = criarGravador();
try {
  const bruto = localStorage.getItem(LOG_KEY);
  if (bruto && gravador.restaurar(bruto)) gravador.registrar('sessao', 'sessão anterior restaurada');
} catch { /* modo privado: começa do zero */ }
function gravarSessao() {
  try { localStorage.setItem(LOG_KEY, gravador.serializar()); } catch { /* sem storage, ok */ }
}

const setStatus = (msg, kind = '') => {
  el.status.textContent = t(msg);   // mensagens estáticas já saem traduzidas
  el.status.className = kind;
  gravador.registrar(kind === 'err' ? 'erro' : 'status', String(msg ?? ''));
  if (kind === 'err') gravador.contarErro();
  gravarSessao();
};

/* ================================================================== *
 * 1. Renderer, cena e rig de luz fixo no mundo
 * ================================================================== */
const scene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
// Órbita no preview (D3 do spec). Só na câmera de preview: a geração cria a sua
// própria câmera ortográfica, então girar aqui nunca muda o que vai para a sheet.
const controls = new OrbitControls(previewCamera, el.viewport);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.05;
controls.maxDistance = 4000;

/**
 * Criar um WebGLRenderer é o único ponto onde este app morre sem dizer por quê
 * (driver antigo, GPU bloqueada, VM sem aceleração). Então ele é protegido: se
 * falhar, a página continua viva, explica o motivo e abre o diagnóstico.
 */
const glProblems = [];
function makeRenderer(options, purpose) {
  try {
    const r = new THREE.WebGLRenderer(options);
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    return r;
  } catch (err) {
    console.error(err);
    glProblems.push(`${purpose}: ${err && err.message ? err.message : String(err)}`);
    reportGlFailure(purpose, err);
    return null;
  }
}

/** O que a GPU desta máquina aceita — é o que falta quando algo não renderiza. */
function collectDiagnostics() {
  const lines = [];
  const push = (k, v) => lines.push(`${k}: ${v}`);
  push('SpriteForge', 'Web 1.0');
  push('three.js', `r${THREE.REVISION}`);
  push('página', location.protocol === 'file:' ? 'file:// (NÃO funciona — use o launcher)' : location.href);
  push('userAgent', navigator.userAgent);
  push('hardwareConcurrency', navigator.hardwareConcurrency ?? 'n/d');
  push('deviceMemory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'n/d');
  push('devicePixelRatio', window.devicePixelRatio);
  // Com a aba de resultados aberta o painel 3D tem display:none, e clientWidth
  // é 0 — número real, mas enganoso. Reporta o tamanho do drawing buffer (que
  // existe sempre) e avisa quando o painel está escondido.
  const wEl = el.viewportWrap?.clientWidth ?? 0;
  const hEl = el.viewportWrap?.clientHeight ?? 0;
  const buffer = renderer ? renderer.getSize(new THREE.Vector2()) : null;
  push('viewport (CSS)', `${wEl}×${hEl}${wEl === 0 ? ' (painel 3D escondido — abra a aba 3D para medir)' : ''}`);
  push('viewport (buffer)', buffer ? `${buffer.x}×${buffer.y}` : 'sem renderer');
  for (const [label, r] of [['viewport', renderer], ['sheet', sheetRenderer]]) {
    if (!r) { push(`WebGL (${label})`, 'INDISPONÍVEL'); continue; }
    const gl = r.getContext();
    push(`WebGL (${label})`, gl.getParameter(gl.VERSION));
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    push(`GPU (${label})`, dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} — ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : 'driver não informa (WEBGL_debug_renderer_info ausente)');
    push(`maxTextureSize (${label})`, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    push(`maxRenderbufferSize (${label})`, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    if ('MAX_SAMPLES' in gl) push(`maxSamples (${label})`, gl.getParameter(gl.MAX_SAMPLES));
    push(`contexto perdido (${label})`, r.getContext().isContextLost() ? 'SIM' : 'não');
  }
  if (glProblems.length) push('erros de WebGL', glProblems.join(' | '));
  return lines.join('\n');
}

function showDiagnostics() {
  el.diagBody.textContent = collectDiagnostics();
  el.diagPanel.style.display = 'block';
}
function reportGlFailure(purpose, err) {
  showError(
    `Não consegui criar o contexto WebGL (${purpose}): ${err && err.message ? err.message : err}. ` +
    'Sem WebGL não há como renderizar a spritesheet. Abra "Diagnóstico" para ver o que a GPU informa ' +
    '(driver desatualizado e área de trabalho remota sem aceleração são as causas mais comuns).'
  );
  showDiagnostics();
}

// Declarado aqui (e não com const na seção 6) porque collectDiagnostics() lê os
// dois contextos: se a criação do segundo falhar, o diagnóstico é chamado DENTRO
// do inicializador dele, e um const ainda em TDZ lançaria ReferenceError no
// lugar de explicar o problema.
let sheetRenderer = null;

const renderer = makeRenderer({ canvas: el.viewport, alpha: true, preserveDrawingBuffer: true, antialias: true }, 'viewport');
if (renderer) {
  renderer.setClearColor(0x000000, 0);
  // Perder o contexto (troca de driver, suspensão, VRAM esgotada) deixa a tela
  // congelada sem erro nenhum no console. Aqui ela passa a ter explicação.
  el.viewport.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glProblems.push('contexto do viewport perdido');
    showError('A GPU perdeu o contexto do viewport (driver reiniciou, VRAM esgotada ou aba suspensa). Recarregue a página; o diagnóstico diz o que a GPU informou.');
    showDiagnostics();
  });
}

// Rig fixo no MUNDO: quando o modelo gira, a luz não gira junto — é isso que dá
// a leitura de volume nos sprites (e o motivo de o turntable ser uma opção).
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0006;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight, keyLight.target);

const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.8);
fillLight.position.set(-7, 3, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.1);
rimLight.position.set(-3, 5, -8);
scene.add(rimLight);

scene.add(new THREE.HemisphereLight(0xffffff, 0x353b44, 0.45));

// Direções normalizadas: a distância real é definida por fitRigToModel(), porque
// luz em coordenadas fixa fica dentro de modelos grandes (e mata a sombra).
const LIGHT_RIG = [
  { light: keyLight, dir: new THREE.Vector3(4, 8, 6).normalize() },
  { light: fillLight, dir: new THREE.Vector3(-7, 3, 4).normalize() },
  { light: rimLight, dir: new THREE.Vector3(-3, 5, -8).normalize() }
];
// "Luz presa à câmera": gira o rig inteiro junto com o que está se movendo em
// relação ao observador (o modelo, no modo normal; a câmera, no turntable). Sem
// isso cada direção recebe luz de um lado diferente — ótimo para volume, ruim
// para ícone/prop, que é o que o checkbox oferece.
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const spinDirs = LIGHT_RIG.map((e) => e.dir.clone());
const spinRig = LIGHT_RIG.map((e, i) => ({ light: e.light, dir: spinDirs[i] }));
let lightFollowAz = 0;

function lightCenter() {
  return state.modelBox.isEmpty() ? new THREE.Vector3() : state.modelBox.getCenter(new THREE.Vector3());
}

/** Coloca o rig girado por spinRad (+ o acompanhamento da câmera). */
function placeLights(spinRad, followAz = 0) {
  const spin = spinRad + followAz;
  for (let i = 0; i < LIGHT_RIG.length; i++) spinDirs[i].copy(LIGHT_RIG[i].dir).applyAxisAngle(UP_AXIS, spin);
  const center = lightCenter();
  core.placeLightRig(spinRig, center, state.modelRadius);
  keyLight.target.position.copy(center);
  keyLight.target.updateMatrixWorld();
}

/** Aplica os controles de luz do painel (chamado ao mudar qualquer um deles). */
function applyLightRig() {
  keyLight.intensity = Number(el.rngLightInt.value) || 0;
  placeLights(THREE.MathUtils.degToRad(Number(el.rngLightAz.value) || 0), lightFollowAz);
}

/** Opacidade da sombra QUANDO ELA FICA NO PERSONAGEM (folha comum e composta).
 * A camada separada sai PRETA OPACA de propósito: quem compõe é a engine, e é ela
 * quem decide a força da sombra. Pré-aplicar 35% num sprite que o jogo vai
 * modular dá atenuação dupla — e, pior, a imagem parece vazia em qualquer viewer
 * que mostre transparência sobre fundo escuro. */
const SOMBRA_OPACIDADE = 0.35;

// Chão que só recebe sombra: com ShadowMaterial o fundo continua transparente.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: SOMBRA_OPACIDADE, color: 0x000000 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false;
scene.add(ground);

/** Ajusta luz de sombra + chão ao tamanho do modelo carregado. */
function fitRigToModel() {
  const center = state.modelBox.getCenter(new THREE.Vector3());
  applyLightRig();
  const r = Math.max(state.modelRadius, 1e-3);
  ground.scale.set(r * 6, r * 6, 1);
  ground.position.set(center.x, state.modelBox.min.y, center.z);
}

/* ================================================================== *
 * 2. Viewport (preview)
 * ================================================================== */
function resizeViewport() {
  if (!renderer) return;
  const w = Math.max(1, el.viewportWrap.clientWidth);
  const h = Math.max(1, el.viewportWrap.clientHeight);
  renderer.setSize(w, h, false);
  previewCamera.aspect = w / h;
  previewCamera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeViewport);

/** Enquadra a câmera de preview no modelo, usando a elevação do painel. */
function framePreview() {
  if (!state.model) return;
  const center = state.modelBox.getCenter(new THREE.Vector3());
  const elev = Number(el.rngElevation.value);
  const dist = state.modelRadius / Math.sin(THREE.MathUtils.degToRad(previewCamera.fov / 2)) * 1.35;
  previewCamera.position.copy(core.cameraPositionAzEl(center, THREE.MathUtils.degToRad(25), elev, dist));
  previewCamera.up.set(0, 1, 0);
  previewCamera.lookAt(center);
  previewCamera.near = dist / 1000;
  previewCamera.far = dist * 10;
  previewCamera.updateProjectionMatrix();
  // A órbita passa a girar em torno do centro do modelo, e aceita a posição nova:
  // o OrbitControls recalcula a esférica a partir da câmera a cada update().
  controls.target.copy(center);
  controls.update();
}

function tick() {
  requestAnimationFrame(tick);
  // Durante a geração o gerador é dono do mixer e do modelo: o preview não pode
  // avançar a animação nem mexer na rotação entre dois renders.
  if (state.generating) return;
  const dt = state.clock.getDelta();
  if (state.mixer && state.playing) {
    state.mixer.update(dt);
    const clip = state.clips[state.clipIndex];
    if (clip) {
      // `frac` e não `t`: o `t()` do escopo externo é a função de tradução.
      const frac = (state.mixer.time % clip.duration) / clip.duration;
      el.scrub.value = String(frac);
      el.scrubVal.textContent = `${(frac * clip.duration).toFixed(2)}s`;
    }
  }
  controls.update();      // damping: precisa rodar todo quadro
  if (renderer) renderer.render(scene, previewCamera);
}

/* ================================================================== *
 * 3. Carga de modelo
 * ================================================================== */

/** Libera GPU do modelo anterior antes de carregar outro (VRAM é finita). */
function clearModel() {
  if (!state.model) return;
  const stats = core.disposeHierarchy(state.model);
  scene.remove(state.model);
  if (state.mixer) state.mixer.stopAllAction();
  state.mixer = null;
  state.model = null;
  state.clips = [];
  state.clipIndex = -1;
  setStatus(t('modelo anterior liberado ({g} geometrias, {m} materiais, {tex} texturas)', { g: stats.geometries, m: stats.materials, tex: stats.textures }), 'ok');
}

function buildClipList() {
  el.clipSelect.innerHTML = '';
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = t('— sem animação (1 frame) —');
  el.clipSelect.appendChild(none);
  state.clips.forEach((clip, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${clip.name || 'clip ' + i} (${clip.duration.toFixed(2)}s)`;
    el.clipSelect.appendChild(opt);
  });
  const hasAnim = state.clips.length > 0;
  el.clipSelect.value = hasAnim ? '0' : '-1';
  el.clipSelect.disabled = !hasAnim;
  el.btnPlay.disabled = !hasAnim;
  el.scrub.disabled = !hasAnim;
  el.rngFrames.disabled = !hasAnim;
  state.clipIndex = hasAnim ? 0 : -1;
  selectClip(state.clipIndex);
}

function selectClip(index) {
  state.clipIndex = index;
  if (!state.mixer) return;
  state.mixer.stopAllAction();
  const clip = state.clips[index];
  if (clip) {
    const action = state.mixer.clipAction(clip);
    action.reset().play();
    state.mixer.setTime(0);
  }
  const dur = clip ? clip.duration : 0;
  el.scrubVal.textContent = '0.00s';
  el.scrub.value = '0';
  el.btnGenerate.textContent = clip ? 'Gerar spritesheet' : 'Gerar sheet (1 frame por direção)';
  setStatus(clip ? t('clip "{nome}" — {d}s', { nome: clip.name, d: dur.toFixed(3) }) : 'modelo sem animação — 1 frame por direção');
}

/** Material padrão para formatos que não trazem material (STL, PLY). */
function defaultMaterial(vertexColors = false) {
  return new THREE.MeshStandardMaterial({ color: 0xc3cbd6, roughness: 0.85, metalness: 0, vertexColors });
}

/** STL e PLY devolvem geometria solta: embrulha num Mesh com material próprio. */
function meshFromGeometry(geometry) {
  return new THREE.Mesh(geometry, defaultMaterial(geometry.hasAttribute('color')));
}

/**
 * Devolve { root, animations } para qualquer formato suportado.
 * Os loaders pesados (FBX puxa fflate) entram por import() dinâmico: quem só
 * usa .glb não paga esse parse.
 */
async function parseModel(file, buffer, siblings) {
  const info = core.formatInfo(file.name);
  if (!info) throw new Error(`.${core.formatOf(file.name) || '?'} não é um formato suportado`);
  switch (info.kind) {
    case 'gltf': {
      let payload = buffer;
      if (info.ext === 'gltf') {
        let json;
        try {
          json = JSON.parse(new TextDecoder().decode(buffer));
        } catch {
          throw new Error('este .gltf não é JSON válido — seria um .glb renomeado?');
        }
        const resolved = core.resolveGltfExternal(json, siblings);
        if (resolved.missing.length) {
          throw new Error(`faltam arquivos referenciados pelo .gltf: ${resolved.missing.join(', ')} — arraste todos juntos ou exporte como .glb`);
        }
        payload = resolved.json;
      }
      const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(payload, '', resolve, reject));
      return { root: gltf.scene, animations: gltf.animations || [] };
    }
    case 'obj': {
      const { OBJLoader } = await import('./vendor/OBJLoader.js');
      return { root: new OBJLoader().parse(new TextDecoder().decode(buffer)), animations: [] };
    }
    case 'stl': {
      const { STLLoader } = await import('./vendor/STLLoader.js');
      return { root: meshFromGeometry(new STLLoader().parse(buffer)), animations: [] };
    }
    case 'ply': {
      const { PLYLoader } = await import('./vendor/PLYLoader.js');
      return { root: meshFromGeometry(new PLYLoader().parse(buffer)), animations: [] };
    }
    case 'fbx': {
      const { FBXLoader } = await import('./vendor/FBXLoader.js');
      const group = new FBXLoader().parse(buffer, '');
      return { root: group, animations: group.animations || [] };
    }
    default:
      throw new Error(`.${info.ext} não é um formato suportado`);
  }
}

/** Coloca na cena um modelo já parseado — vale para qualquer formato. */
function applyModel(root, animations, fileName) {
  clearModel();
  const kind = core.formatInfo(fileName)?.kind || '';
  state.name = (fileName || 'modelo').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^\w.-]+/g, '_') || 'modelo';
  state.model = root;
  state.clips = animations || [];
  scene.add(state.model);
  state.model.updateMatrixWorld(true);

  // OBJ/STL/PLY costumam ter faces invertidas ou sem normal; glTF/FBX já trazem
  // isso definido pelo autor.
  const prepared = core.prepareLoaded(state.model, { doubleSide: kind === 'obj' || kind === 'stl' || kind === 'ply' });

  state.modelBox.setFromObject(state.model, true);
  // Modelo sem geometria daria bounding box vazia → raio NaN em tudo.
  if (state.modelBox.isEmpty()) state.modelBox.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
  state.modelRadius = state.modelBox.getSize(new THREE.Vector3()).length() / 2;
  state.mixer = state.clips.length ? new THREE.AnimationMixer(state.model) : null;

  fitRigToModel();
  ground.visible = el.chkShadow.checked;
  framePreview();
  buildClipList();

  let triangles = 0;
  state.model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.getAttribute('position');
    if (pos) triangles += (o.geometry.index ? o.geometry.index.count : pos.count) / 3;
  });

  // Guardado como função: trocar de idioma precisa refazer estes textos.
  state.infoModeloFn = () => {
    el.modelInfo.textContent = t('{nome} · {fmt} · {meshes} mesh · {tris} tris · {clips} clip(s)', {
      nome: state.name, fmt: core.formatOf(fileName).toUpperCase(),
      meshes: prepared.meshes, tris: Math.round(triangles), clips: state.clips.length
    });
    el.viewBadge.textContent = state.clips.length
      ? t('{nome} — {n} animação(ões)', { nome: state.name, n: state.clips.length })
      : t('{nome} — sem animação (1 frame por direção)', { nome: state.name });
  };
  state.infoModeloFn();
  gravador.marcar('modelo');
  gravador.registrar('modelo', `${state.name} (${core.formatOf(fileName) || '?'}) — ${prepared.meshes} mesh, ${Math.round(triangles)} tris, ${state.clips.length} clip(s)`, {
    nome: state.name, formato: core.formatOf(fileName), meshes: prepared.meshes,
    tris: Math.round(triangles), clips: state.clips.map((c) => c.name)
  });
  gravarSessao();
  el.btnGenerate.disabled = false;
  hideError();
  setStatus(
    t('"{nome}" carregado ({fmt})', { nome: state.name, fmt: core.formatInfo(fileName)?.label || fileName }) +
      (state.clips.length ? `: ${state.clips.map((c) => c.name).join(', ')}` : t(' — sem animação')) +
      (prepared.computedNormals ? ` · ${prepared.computedNormals} normal(is) calculada(s)` : ''),
    'ok'
  );
  if (!state.playing) {
    state.playing = true;
    el.btnPlay.textContent = 'Pause';
  }
}

/** Erro visível: a barra de status é estreita demais para não passar batido. */
function showError(message) {
  gravador.registrar('erro', String(message ?? '').slice(0, 300));
  el.loadError.textContent = message;
  el.loadError.style.display = 'block';
  setStatus(message, 'err');
}
function hideError() {
  el.loadError.style.display = 'none';
}

/**
 * Carrega um ou mais arquivos. Se vierem vários, o primeiro suportado é o
 * modelo e os demais viram recursos dele (.bin/.png de um .gltf solto).
 */
async function loadFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const main = files.find((f) => core.isSupported(f.name)) || files[0];
  if (!core.isSupported(main.name)) {
    showError(
      `.${core.formatOf(main.name) || '?'} não é suportado. Formatos aceitos: ` +
        `${core.SUPPORTED_EXTENSIONS.map((e) => '.' + e).join(', ')}. ` +
        'Para .dae, .3ds, .usdz, .step ou .blend, exporte como .glb (Blender: File → Export → glTF 2.0).'
    );
    return;
  }
  hideError();
  try {
    setStatus(t('lendo {nome}…', { nome: main.name }));
    const buffer = await main.arrayBuffer();
    const siblings = new Map();
    for (const f of files) if (f !== main) siblings.set(f.name, new Uint8Array(await f.arrayBuffer()));
    const { root, animations } = await parseModel(main, buffer, siblings);
    applyModel(root, animations, main.name);
  } catch (err) {
    console.error(err);
    showError(`Não consegui carregar ${main.name}: ${err.message}`);
  }
}

/**
 * Carrega uma amostra de samples/. Duas de propósito: o Fox tem animação
 * (exercita clipes e o loop perfeito) e o crate.obj não tem (exercita o caminho
 * de 1 frame por direção, sem depender de o usuário ter um arquivo estático).
 */
async function loadSample(filename = 'fox.glb') {
  try {
    hideError();
    setStatus(t('carregando samples/{arquivo}…', { arquivo: filename }));
    const res = await fetch(`./samples/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { root, animations } = await parseModel({ name: filename }, await res.arrayBuffer(), new Map());
    applyModel(root, animations, filename);
  } catch (err) {
    console.error(err);
    showError(`Não consegui carregar o exemplo: ${err.message}`);
  }
}

/* ================================================================== *
 * 4. Drag-and-drop em qualquer lugar da página
 * ================================================================== */
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
});

/* ================================================================== *
 * 5. Abas, predefinições e controles
 * ================================================================== */

/* ---- abas: 3D | Sheet + Player ----
 * As duas janelas brigavam por espaço e tudo saía truncado. Agora cada uma tem
 * a página inteira; a barra de progresso mora na própria barra de abas, então
 * gerar a sheet não esconde o que está sendo feito. */
function showTab(which) {
  gravador.marcar('aba');
  const results = which === 'results';
  el.tabResults.setAttribute('aria-selected', String(results));
  el.tab3d.setAttribute('aria-selected', String(!results));
  el.resultPane.classList.toggle('on', results);
  el.viewPane.classList.toggle('on', !results);
  // Voltar ao 3D exige re-medir: com display:none o clientWidth era 0.
  if (!results) resizeViewport();
}
el.tab3d.addEventListener('click', () => showTab('3d'));
el.tabResults.addEventListener('click', () => showTab('results'));

/* ---- predefinições por tipo de projeto + reset + memória ---- */
const STORAGE_KEY = 'spriteforge.settings.v1';
const presetButtons = [...document.querySelectorAll('.preset[data-preset]')];

function markPreset(name) {
  if (name) {
    gravador.marcar('preset');
    gravador.registrar('opcoes', `predefinição ${name}`);
  }
  presetButtons.forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
}

/** Escreve um objeto de configurações em todos os controles do painel. */
function applySettings(s) {
  el.selDirections.value = String(s.directions);
  setPair('rngFrames', 'framesVal', s.frames);
  setPair('rngElevation', 'elevationVal', s.elevation);
  setPair('rngAzimuth', 'azimuthVal', s.azimuthOffset);
  el.selPivot.value = s.pivot;
  el.pivotXVal.value = String(s.pivotX ?? 0.5);
  el.pivotYVal.value = String(s.pivotY ?? 0.5);
  el.rowPivotCustom.hidden = s.pivot !== 'custom';
  el.chkPivotMark.checked = s.pivotMark !== false;
  setPair('rngCell', 'cellVal', s.cell);
  setPair('rngPadding', 'paddingVal', s.padding);
  el.chkSsaa.checked = !!s.ssaa;
  el.chkLockScale.checked = !!s.lockScale;
  setPair('rngScaleLock', 'scaleLockVal', s.pxPerUnit);
  el.rowScaleLock.hidden = !s.lockScale;
  el.chkTurntable.checked = !!s.turntable;
  el.selBackground.value = s.background;
  el.chkShadow.checked = !!s.shadow;
  el.chkLoopPerfect.checked = !!s.loopPerfect;
  setPair('rngFps', 'fpsVal', s.fps);
  setPair('rngZoom', 'zoomVal', s.zoom);
  el.rngGifScale.value = String(s.gifScale);
  el.selGifBg.value = s.gifBg || 'dither';
  el.selShadowGif.value = s.shadowGif || 'silhueta';
  el.chkShadowLayer.checked = !!s.shadowLayer;
  el.chkTrim.checked = !!s.trim;
  el.chkPlayerShadow.checked = !!s.playerShadow;
  el.chkLightCamera.checked = !!s.lightCamera;
  setPair('rngLightAz', 'lightAzVal', s.lightAz);
  setPair('rngLightInt', 'lightIntVal', s.lightIntensity);
  ground.visible = !!s.shadow;
  applyLightRig();
  framePreview();
  drawPlayer();
}

/** Lê o painel de volta — é o que vai para o localStorage. */
function readSettings() {
  return {
    directions: Number(el.selDirections.value),
    frames: Number(el.rngFrames.value),
    elevation: Number(el.rngElevation.value),
    azimuthOffset: Number(el.rngAzimuth.value),
    pivot: el.selPivot.value,
    pivotX: Number(el.pivotXVal.value),
    pivotY: Number(el.pivotYVal.value),
    pivotMark: el.chkPivotMark.checked,
    cell: Number(el.rngCell.value),
    padding: Number(el.rngPadding.value),
    ssaa: el.chkSsaa.checked,
    lockScale: el.chkLockScale.checked,
    pxPerUnit: Number(el.rngScaleLock.value),
    turntable: el.chkTurntable.checked,
    background: el.selBackground.value,
    shadow: el.chkShadow.checked,
    loopPerfect: el.chkLoopPerfect.checked,
    fps: Number(el.rngFps.value),
    zoom: Number(el.rngZoom.value),
    gifScale: Number(el.rngGifScale.value),
    gifBg: el.selGifBg.value,
    shadowGif: el.selShadowGif.value,
    shadowLayer: el.chkShadowLayer.checked,
    trim: el.chkTrim.checked,
    playerShadow: el.chkPlayerShadow.checked,
    lightCamera: el.chkLightCamera.checked,
    lightAz: Number(el.rngLightAz.value),
    lightIntensity: Number(el.rngLightInt.value) || 0
  };
}

function saveSettings(presetName) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: presetName || null, settings: readSettings() }));
  } catch (err) {
    // Modo privado do Firefox e companhia lançam aqui; perder a memória é aceitável.
    console.warn('não consegui salvar as preferências:', err.message);
  }
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.settings) return null;
    // Mescla com os defaults: uma preferência salva por uma versão antiga não
    // pode deixar controles undefined.
    return { preset: data.preset || null, settings: { ...core.DEFAULT_SETTINGS, ...data.settings } };
  } catch (err) {
    console.warn('preferências salvas ilegíveis, usando os padrões:', err.message);
    return null;
  }
}

presetButtons.forEach((btn) => btn.addEventListener('click', () => {
  const name = btn.dataset.preset;
  applySettings(core.presetSettings(name));
  markPreset(name);
  saveSettings(name);
  setStatus(t('predefinição "{nome}" aplicada — ajuste o que quiser e gere', { nome: btn.textContent.trim() }), 'ok');
}));

/** Refaz os textos que o app monta em tempo de execução. */
function redesenharTextosDinamicos() {
  if (state.model) {
    const clipAntes = el.clipSelect.value;
    buildClipList();
    el.clipSelect.value = clipAntes;      // buildClipList reseta para o primeiro
    if (state.infoModeloFn) state.infoModeloFn();
  }
  if (state.result) {
    if (state.result.infoFn) state.result.infoFn();
    const dirAntes = el.playerDir.value;
    buildDirectionSelector();
    el.playerDir.value = dirAntes;
  }
}

/* ---- idioma ----
 * O português é a língua fonte (mora no HTML e aqui); o inglês vem do i18n.js.
 * A escolha fica no localStorage, então cada pessoa mantém a sua no próprio
 * navegador — o Lucas continua em pt-BR e o amigo gringo em inglês. */
const IDIOMA_SALVO = 'spriteforge.idioma';
function trocarIdioma(lang) {
  gravador.marcar('idioma');
  gravador.registrar('idioma', `idioma -> ${lang}`);
  aplicarIdioma(lang);
  try { localStorage.setItem(IDIOMA_SALVO, idiomaAtual()); } catch { /* modo privado */ }
  // Textos que o app monta dinamicamente precisam ser refeitos na hora.
  redesenharTextosDinamicos();
}
el.selIdioma.addEventListener('change', () => trocarIdioma(el.selIdioma.value));
try {
  const salvo = localStorage.getItem(IDIOMA_SALVO);
  if (salvo) { el.selIdioma.value = salvo; aplicarIdioma(salvo); }
} catch { /* sem localStorage: fica em pt-BR */ }

controls.addEventListener('start', () => gravador.marcar('orbital'));
el.btnReframe.addEventListener('click', () => {
  gravador.marcar('reenquadrar');
  framePreview();
  setStatus('câmera reenquadrada no modelo', 'ok');
});

/* ---- projeto (.spriteforge.json) ----
 * Salva só as opções: o modelo não vai junto (um .glb de 40 MB dentro de um
 * .json seria ilegível, e o caminho de quem salvou não existe em outra máquina).
 * Por isso o projeto lembra o NOME do modelo e avisa na hora de abrir. */
async function salvarProjeto() {
  const projeto = core.buildProject(
    readSettings(),
    state.name ? { nome: state.name, formato: core.formatOf(state.name) } : null
  );
  const texto = JSON.stringify(projeto, null, 2);
  const base = state.name ? state.name.replace(/\.[^.]+$/, '') : 'spriteforge';
  const sugerido = `${base}.spriteforge.json`;
  // Com a pasta do app escolhida, salva direto em projetos/ SEM perguntar:
  // é isso que se espera de "salvar projeto".
  const dirProjeto = await pastaPara('projetos');
  if (dirProjeto) {
    try {
      await pasta.escreverArquivo(dirProjeto, pasta.nomeSeguro(sugerido), texto);
      gravador.marcar('projetoSalvar');
      gravador.registrar('saida', `${sugerido} -> ${dirProjeto.name}/`);
      gravarSessao();
      avisar(t('projeto gravado em <b>{pasta}</b>/{nome}', { pasta: dirProjeto.name, nome: sugerido }));
      setStatus(t('projeto salvo em {pasta}/{nome}', { pasta: dirProjeto.name, nome: sugerido }), 'ok');
      return;
    } catch (err) {
      setStatus(t('não consegui gravar na pasta ({msg}) — vou perguntar onde salvar', { msg: err && err.message ? err.message : err }), 'err');
    }
  }

  // Sem pasta do app: File System Access API (Chrome/Edge, incluindo o modo app)
  // pergunta onde salvar. Sem ela (Firefox/Safari) cai no download comum.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: sugerido,
        types: [{ description: 'Projeto do SpriteForge', accept: { 'application/json': ['.spriteforge.json', '.json'] } }]
      });
      const fluxo = await handle.createWritable();
      await fluxo.write(texto);
      await fluxo.close();
      gravador.marcar('projetoSalvar');
      setStatus(t('projeto salvo em {nome}', { nome: handle.name || sugerido }), 'ok');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // o usuário cancelou: não é erro
      // Outro motivo (pasta sem permissão, política do navegador): não perde o
      // trabalho, cai no download.
    }
  }
  gravador.marcar('projetoSalvar');
  downloadBlob(new Blob([texto], { type: 'application/json' }), sugerido);
  setStatus(t('projeto baixado como {nome} — mova para a pasta projetos/ se quiser', { nome: sugerido }), 'ok');
}

async function abrirProjeto(arquivo) {
  let r;
  try {
    r = core.parseProject(await arquivo.text());
  } catch (err) {
    setStatus(t('não consegui ler o arquivo: {msg}', { msg: err.message }), 'err');
    return;
  }
  if (!r.ok) {
    setStatus(t('não é um projeto do SpriteForge: {motivo}', { motivo: r.erro }), 'err');
    return;
  }
  gravador.marcar('projetoAbrir');
  applySettings(r.projeto.settings);
  markPreset(null);          // o painel agora não corresponde a nenhum preset
  saveSettings(null);
  const avisos = [];
  if (r.projeto.modelo) avisos.push(t('projeto feito com {nome} — carregue o modelo de novo', { nome: r.projeto.modelo.nome }));
  if (r.ignoradas.length) avisos.push(t('ignorei {n} valor(es) inválido(s): {lista}', { n: r.ignoradas.length, lista: r.ignoradas.join(', ') }));
  setStatus(avisos.length ? avisos.join(' · ') : t('projeto carregado'), 'ok');
}

el.btnSaveProject.addEventListener('click', () => { salvarProjeto(); });
el.btnOpenProject.addEventListener('click', () => el.projectInput.click());
el.projectInput.addEventListener('change', () => {
  const arquivo = el.projectInput.files?.[0];
  el.projectInput.value = '';       // permite reabrir o mesmo arquivo
  if (arquivo) abrirProjeto(arquivo);
});

el.btnOpen.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => { loadFiles(el.fileInput.files); el.fileInput.value = ''; });
el.btnSample.addEventListener('click', () => { gravador.marcar('amostra'); loadSample('fox.glb'); });
el.btnSampleStatic.addEventListener('click', () => { gravador.marcar('amostra'); loadSample('crate.obj'); });

el.clipSelect.addEventListener('change', () => selectClip(Number(el.clipSelect.value)));
el.btnPlay.addEventListener('click', () => {
  state.playing = !state.playing;
  el.btnPlay.textContent = state.playing ? 'Pause' : 'Play';
});
el.scrub.addEventListener('input', () => {
  const clip = state.clips[state.clipIndex];
  if (!state.mixer || !clip) return;
  state.playing = false;
  el.btnPlay.textContent = 'Play';
  state.mixer.setTime(Number(el.scrub.value) * clip.duration);
  el.scrubVal.textContent = `${(Number(el.scrub.value) * clip.duration).toFixed(2)}s`;
});
el.chkShadow.addEventListener('change', () => { ground.visible = el.chkShadow.checked; });
el.rngElevation.addEventListener('input', () => framePreview());
el.chkLockScale.addEventListener('change', () => {
  el.rowScaleLock.hidden = !el.chkLockScale.checked;
  if (!el.chkLockScale.checked) return;
  const ppu = calibrateScaleLock();
  if (ppu) setStatus(t('escala travada em {v} px/unidade (calibrada neste modelo) — mude para combinar com outros projetos', { v: ppu.toFixed(2) }), 'ok');
});
el.rngLightAz.addEventListener('input', applyLightRig);
el.rngLightInt.addEventListener('input', applyLightRig);
el.chkLightCamera.addEventListener('change', applyLightRig);
el.rngZoom.addEventListener('input', drawPlayer);

/* ---- slider e campo numérico são o mesmo controle ----
 * Cada slider tem um input[type=number] do lado: dá para digitar 512 em vez de
 * arrastar até o fim. O número é clampado nos limites do slider e dispara os
 * MESMOS handlers, então não existe um segundo caminho de efeito colateral. */
const NUMERIC_PAIRS = [
  ['rngElevation', 'elevationVal'], ['rngAzimuth', 'azimuthVal'], ['rngFrames', 'framesVal'],
  ['rngCell', 'cellVal'], ['rngPadding', 'paddingVal'], ['rngScaleLock', 'scaleLockVal'],
  ['rngFps', 'fpsVal'], ['rngZoom', 'zoomVal'], ['rngLightAz', 'lightAzVal'], ['rngLightInt', 'lightIntVal']
];
// Ângulos são periódicos: passar de 359° não significa nada, então esses continuam
// clampados nas duas pontas. As demais grandezas são livres — quem quiser célula
// 1024×1024 digita 1024, e o slider amplia o próprio teto para acompanhar.
const ANGULOS = new Set(['elevationVal', 'azimuthVal', 'lightAzVal']);

// Escreve um par (slider + campo) sem perder valores acima do teto de fábrica.
function setPair(rangeKey, numKey, value) {
  const range = el[rangeKey];
  const num = el[numKey];
  if (!range || !num) return;
  const baseMax = Number(range.dataset.baseMax ?? range.max);
  const baseStep = range.dataset.baseStep ?? range.step ?? '1';
  if (!ANGULOS.has(numKey) && Number(value) > baseMax) {
    range.max = String(value);
    range.step = 'any';          // para o slider não arredondar o valor digitado
  } else {
    range.max = String(baseMax);
    range.step = baseStep;
  }
  range.value = String(value);
  num.value = String(value);
}

for (const [rangeKey, numKey] of NUMERIC_PAIRS) {
  const range = el[rangeKey];
  const num = el[numKey];
  if (!range || !num) continue;
  range.dataset.baseMax = range.max;               // teto "de fábrica" do slider
  range.dataset.baseStep = range.step ?? '1';
  const baseMax = Number(range.max);
  const baseStep = range.dataset.baseStep;
  const livre = !ANGULOS.has(numKey);
  let digitando = false;
  range.addEventListener('input', () => { if (!digitando) num.value = range.value; });
  // soltou o slider: o teto volta ao normal
  range.addEventListener('change', () => { range.max = String(baseMax); range.step = baseStep; });
  const commit = (rewrite) => {
    if (num.value === '') return;
    const raw = Number(num.value);
    if (!Number.isFinite(raw)) return;
    const min = Number(range.min);
    // digitar acima do topo AMPLIA o slider, porque é o slider que o gerador lê:
    // sem isso o 1024 digitado viraria 512 na hora de renderizar
    const acima = livre && raw > baseMax;
    range.max = String(acima ? raw : baseMax);
    range.step = acima ? 'any' : baseStep;
    const max = Number(range.max);
    const v = Math.min(max, Math.max(min, raw));
    digitando = true;                              // senão o listener de cima reescreve o campo
    range.value = String(v);
    range.dispatchEvent(new Event('input'));
    digitando = false;
    if (rewrite) {
      num.value = String(v);                        // ao sair do campo, mostra o que valeu
      gravador.marcar('digitou');
      gravador.registrar('opcoes', `${num.id || numKey} digitado -> ${v}`);
    }
  };
  num.addEventListener('input', () => commit(false));
  num.addEventListener('change', () => commit(true));
}

// Qualquer ajuste manual invalida a predefinição destacada e vai para a memória.
const SETTING_CONTROLS = [
  el.selDirections, el.rngFrames, el.rngElevation, el.rngAzimuth, el.selPivot, el.rngCell,
  el.pivotXVal, el.pivotYVal, el.chkPivotMark,
  el.rngPadding, el.chkSsaa, el.chkLockScale, el.rngScaleLock, el.chkTurntable, el.selBackground,
  el.chkShadow, el.chkLoopPerfect, el.rngFps, el.rngZoom, el.rngGifScale, el.selGifBg,
  el.chkLightCamera, el.rngLightAz, el.rngLightInt, el.chkShadowLayer, el.chkPlayerShadow,
  el.chkTrim,
  el.selShadowGif
];
SETTING_CONTROLS.forEach((node) => node.addEventListener('change', () => {
  markPreset(null);
  saveSettings(null);
  if (node === el.chkShadowLayer) gravador.marcar('camadaSombra');
  if (node === el.chkTrim) gravador.marcar('trim');
  if (node === el.chkLockScale && el.chkLockScale.checked) gravador.marcar('trava');
  if (el.selPivot.value === 'custom') gravador.marcar('pivot');
}));

/* ---- diagnóstico ---- */
/* ---- exportação do relatório de sessão ---- */
function contextoRelatorio() {
  let opcoes = null;
  try {
    opcoes = Object.entries(readSettings()).map(([k, v]) => `${k}=${v}`).join('  ');
  } catch { /* painel indisponível: o relatório sai sem esta seção */ }
  return {
    idioma: idiomaAtual(),
    ambiente: collectDiagnostics(),
    modelo: state.model ? (el.modelInfo.textContent || state.name) : null,
    opcoes
  };
}
function atualizarContagemLog() {
  if (!el.logCount) return;
  const e = gravador.estado;
  const inv = gravador.inventario();
  el.logCount.textContent = t('{n} eventos · {u} recursos usados', { n: e.eventos.length, u: inv.usados.length });
}
function baixarRelatorio(formato) {
  const ctx = contextoRelatorio();
  const data = gravador.json(ctx);
  const nome = `spriteforge-sessao-${data.sessao}.${formato}`;
  if (formato === 'json') {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), nome);
  } else {
    downloadBlob(new Blob([gravador.texto(ctx)], { type: 'text/plain;charset=utf-8' }), nome);
  }
  gravador.registrar('relatorio', `relatório baixado (.${formato})`);
  gravador.contarDownload();
  gravarSessao();
  setStatus(t('relatório da sessão baixado ({n} eventos)', { n: data.contagem.eventos }), 'ok');
}
el.btnLogTxt.addEventListener('click', () => baixarRelatorio('txt'));
el.btnLogJson.addEventListener('click', () => baixarRelatorio('json'));
el.btnLogLimpar.addEventListener('click', () => {
  try { localStorage.removeItem(LOG_KEY); } catch { /* sem storage, ok */ }
  const novo = criarGravador();
  // Substitui o estado no lugar: os ganchos já instalados continuam apontando
  // para `gravador`, então não é preciso religar nada.
  Object.assign(gravador.estado, novo.estado);
  gravador.estado.recursos = Object.create(null);
  gravador.estado.eventos = [];
  gravador.registrar('sessao', 'sessão limpa manualmente');
  atualizarContagemLog();
  setStatus(t('sessão limpa'), 'ok');
});

el.btnPastaSaida.addEventListener('click', () => { escolherPastaSaida(); });
el.btnPastaSaida.addEventListener('contextmenu', (e) => {
  if (!saida.pasta) return;          // sem pasta ativa, deixa o menu normal
  e.preventDefault();
  esquecerPastaSaida();
});

el.btnDiag.addEventListener('click', () => {
  gravador.marcar('diagnostico');
  atualizarContagemLog();
  const aberto = el.diagPanel.style.display === 'block';
  if (aberto) el.diagPanel.style.display = 'none';
  else showDiagnostics();
});
el.btnCloseDiag.addEventListener('click', () => { el.diagPanel.style.display = 'none'; });
el.btnCopyDiag.addEventListener('click', async () => {
  const texto = collectDiagnostics();
  try {
    await navigator.clipboard.writeText(texto);
    setStatus('diagnóstico copiado — cole onde for pedir ajuda', 'ok');
  } catch {
    // Clipboard API exige contexto seguro/https; o fallback funciona em http local.
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    const foi = document.execCommand('copy');
    ta.remove();
    setStatus(foi ? 'diagnóstico copiado' : 'não consegui copiar — selecione o texto do painel', foi ? 'ok' : 'err');
  }
});

/**
 * Mede o `half` do modelo com os ajustes atuais. É síncrono (measureFit não
 * renderiza) e devolve o modelo como estava — serve para calibrar a escala
 * travada sem precisar gerar a sheet antes.
 */
function measureHalfNow() {
  if (!state.model) return null;
  const clip = state.clips[state.clipIndex] || null;
  const times = core.frameTimes(clip ? clip.duration : 0, clip ? Number(el.rngFrames.value) : 1, el.chkLoopPerfect.checked);
  const poses = core.buildPoses({
    directionCount: Number(el.selDirections.value), frameCount: times.length, times,
    model: state.model, turntable: el.chkTurntable.checked,
    azimuthOffsetDeg: Number(el.rngAzimuth.value) || 0
  });
  const applyPose = (p) => {
    state.model.rotation.y = p.modelAzimuth;
    if (state.mixer && clip) state.mixer.setTime(p.time);
    state.model.updateMatrixWorld(true);
  };
  const prevRotation = state.model.rotation.y;
  const prevTime = state.mixer ? state.mixer.time : 0;
  const fit = core.measureFit(core.fitPoses(poses, { maxFrames: 4, maxDirections: 4 }), applyPose, {
    elevationDeg: Number(el.rngElevation.value)
  });
  state.model.rotation.y = prevRotation;
  if (state.mixer && clip) state.mixer.setTime(prevTime);
  state.model.updateMatrixWorld(true);
  return fit ? fit.half : null;
}

/**
 * Calibra a escala travada no modelo atual: o valor que faz ele caber inteiro na
 * célula. Sem isso o usuário parte de um chute (8 px/un serve para modelos de
 * ~16 unidades; o Fox tem 79) e recebe um recorte do meio do personagem.
 */
function calibrateScaleLock() {
  const half = measureHalfNow();
  if (!half) { setStatus('carregue um modelo para calibrar a escala travada', 'err'); return null; }
  const ppu = core.pxPerUnitToFit(Number(el.rngCell.value), half);
  const snapped = Math.min(64, Math.max(0.05, Math.round(ppu * 20) / 20));
  el.rngScaleLock.value = String(snapped);
  el.scaleLockVal.value = String(snapped);   // é um input: textContent não apareceria
  markPreset(null);
  saveSettings(null);
  return snapped;
}

/* ---- cancelar geração ---- */
el.btnCancel.addEventListener('click', () => {
  if (!state.generating) return;
  state.cancelled = true;
  gravador.marcar('cancelou');
  el.btnCancel.disabled = true;
  setStatus('cancelando após a célula atual…', 'err');
});


/* ================================================================== *
 * 6. Geração da spritesheet (auto-fit + SSAA)
 * ================================================================== */

// Renderer dedicado à geração. O canvas do viewport não pode ser redimensionado
// para o tamanho da célula sem deformar o preview, então a sheet sai de um
// segundo contexto — que reutiliza a MESMA cena (mesmo rig de luz, mesmo chão).
// preserveDrawingBuffer é obrigatório para o drawImage() depois do render.
// Também protegido: este é o contexto que faz o trabalho pesado (uma célula de
// 512px com SSAA vira um framebuffer de 1024px), e é nele que a VRAM acaba.
sheetRenderer = makeRenderer({ alpha: true, preserveDrawingBuffer: true, antialias: true }, 'sheet');
if (sheetRenderer) {
  sheetRenderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glProblems.push('contexto da sheet perdido');
    showError('A GPU perdeu o contexto usado para gerar a sheet (VRAM esgotada é a causa mais comum). Reduza a célula ou desligue o SSAA e tente de novo.');
    showDiagnostics();
  });
}

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));
const showProgress = (on) => el.progressWrap.classList.toggle('on', on);
const setProgress = (ratio, label) => {
  el.progressBar.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  el.progressLabel.textContent = t(label);
};

function applyBackground(mode) {
  if (!sheetRenderer) return;
  if (mode === 'white') sheetRenderer.setClearColor(0xffffff, 1);
  else if (mode === 'dark') sheetRenderer.setClearColor(0x15181d, 1);
  else sheetRenderer.setClearColor(0x000000, 0);
}

/** Cancelamento pedido pelo usuário: não é falha, tem mensagem própria. */
class CancelledError extends Error {
  constructor() { super('geração cancelada'); this.name = 'AbortError'; }
}

async function generate() {
  if (!state.model) { setStatus('carregue um modelo antes de gerar', 'err'); return; }
  if (state.generating) return;
  if (!sheetRenderer) {
    setStatus('sem contexto WebGL não há como gerar — abra "Diagnóstico" para ver o que a GPU informou', 'err');
    showDiagnostics();
    return;
  }

  const dirCount = Number(el.selDirections.value);
  const elevation = Number(el.rngElevation.value);
  const azimuthOffset = Number(el.rngAzimuth.value) || 0;
  const pivot = el.selPivot.value;
  // O pivot personalizado é clampado no core: fora de 0.07–0.93 o modelo cortaria.
  const pivotCustom = { x: Number(el.pivotXVal.value), y: Number(el.pivotYVal.value) };
  const padding = Number(el.rngPadding.value) || 0;
  const lockScale = el.chkLockScale.checked;
  const pxPerUnit = Number(el.rngScaleLock.value) || 8;
  const turntable = el.chkTurntable.checked;
  const background = el.selBackground.value;
  const wantShadowLayer = el.chkShadowLayer.checked && el.chkShadow.checked;
  const fps = Number(el.rngFps.value) || core.DEFAULT_FPS;
  const lightAz = THREE.MathUtils.degToRad(Number(el.rngLightAz.value) || 0);
  const lightFollow = el.chkLightCamera.checked;
  const clip = state.clips[state.clipIndex] || null;
  const warnings = [];

  state.generating = true;
  state.cancelled = false;
  const geracaoInicio = performance.now();
  gravador.marcar('gerou');
  gravador.contarGeracao('iniciadas');
  const logFrames = clip ? Number(el.rngFrames.value) : 1;
  const logCell = Number(el.rngCell.value);
  gravador.registrar('geracao', `geração iniciada — ${dirCount} dir × ${logFrames}f, célula ${logCell}px, pivô ${pivot}`, {
    dirCount, frames: logFrames, cell: logCell, elevation, azimuthOffset, pivot,
    pivotCustom: pivot === 'custom' ? pivotCustom : null,
    padding, turntable, lockScale, pxPerUnit: lockScale ? pxPerUnit : null,
    ssaa: el.chkSsaa.checked, background, fps,
    sombra: el.chkShadow.checked, camadaSombra: wantShadowLayer,
    luzPresa: lightFollow, clip: clip ? clip.name : null
  });
  el.btnGenerate.disabled = true;
  el.btnCancel.disabled = false;
  showProgress(true);
  setProgress(0, 'preparando…');
  const wasPlaying = state.playing;
  state.playing = false;

  // Posição do modelo/preview é restaurada no fim para o usuário não perder o ponto.
  const prevRotation = state.model.rotation.y;
  const prevTime = state.mixer ? state.mixer.time : 0;

  try {
    // 1. poses (uma por célula) e tempos de frame
    const frameCount = clip ? Number(el.rngFrames.value) : 1;
    const times = core.frameTimes(clip ? clip.duration : 0, frameCount, el.chkLoopPerfect.checked);
    const poses = core.buildPoses({
      directionCount: dirCount, frameCount: times.length, times,
      model: state.model, turntable, azimuthOffsetDeg: azimuthOffset
    });

    const applyPose = (pose) => {
      state.model.rotation.y = pose.modelAzimuth;
      if (state.mixer && clip) state.mixer.setTime(pose.time);
      state.model.updateMatrixWorld(true);
    };

    // 2. auto-fit: mede ~6 frames × 4 direções e garante que TUDO caiba na célula
    setProgress(0.02, 'medindo enquadramento (auto-fit)…');
    await yieldToBrowser();
    const fit = core.measureFit(core.fitPoses(poses, { maxFrames: 6, maxDirections: 4 }), applyPose, { elevationDeg: elevation });
    if (!fit) throw new Error('não consegui medir o modelo (geometria vazia?)');
    const frame = core.frameForPivot(fit.bounds, pivot, core.SCALE_FIX, pivotCustom);

    // 3. layout (linhas = direções, colunas = frames) + padding + clamp de 8192 px
    const layout = core.computeLayout(dirCount, times.length, Number(el.rngCell.value), core.MAX_SHEET_SIDE, padding);
    if (layout.warning) warnings.push(layout.warning);

    // 3b. Escala travada: o half deixa de vir da medição e passa a vir de
    // "quantos pixels vale uma unidade de mundo", para que modelos diferentes
    // saiam do mesmo tamanho. Se o modelo não couber, avisa em vez de cortar mudo.
    let half = frame.half;
    if (lockScale) {
      const travado = core.lockedHalf(layout.cell, pxPerUnit);
      if (travado < frame.half) {
        // A trava nunca entrega um sprite cortado: se o valor pedido não cabe,
        // usa o menor que cabe e diz qual é. Cortar em silêncio foi o bug do
        // preset isométrico (8 px/un sobre o Fox = 7% do modelo na janela).
        const minimo = core.pxPerUnitToFit(layout.cell, frame.half);
        warnings.push(
          `escala travada em ${pxPerUnit} px/unidade não cabe neste modelo (precisaria de half ${frame.half.toFixed(2)}, a trava dava ${travado.toFixed(2)}): ` +
          `usei ${minimo.toFixed(3)} px/unidade, que é o mínimo para caber inteiro.`
        );
        half = frame.half;
      } else {
        half = travado;
      }
    }

    // 3c. SSAA limitado ao que ESTA GPU aceita: célula 512 com SSAA 2x = 1024px
    // de framebuffer, e maxTextureSize é 4096 em muita placa — acima disso o
    // render falha em silêncio ou estoura o contexto.
    const maxTex = sheetRenderer.capabilities.maxTextureSize || 4096;
    let ssaa = el.chkSsaa.checked;
    let renderSize = layout.cell * (ssaa ? 2 : 1);
    if (renderSize > maxTex) {
      warnings.push(`SSAA desligado: ${renderSize}px de framebuffer passa do maxTextureSize desta GPU (${maxTex}px)`);
      ssaa = false;
      renderSize = layout.cell;
    }

    // 4. canvas da sheet e renderer offscreen
    const sheet = document.createElement('canvas');
    sheet.width = layout.w;
    sheet.height = layout.h;
    const sctx = sheet.getContext('2d', { willReadFrequently: true });
    sheetRenderer.setSize(renderSize, renderSize, false);
    applyBackground(background);
    // Com a camada separada ligada, o chão sai deste passe: a sombra vive SÓ na
    // folha da sombra. Senão ela ficava gravada nas duas — o toggle do player só
    // a escurecia e o sprite do personagem continuava com a sombra cinza.
    ground.visible = wantShadowLayer ? false : el.chkShadow.checked;

    const camera = core.createOrthoCamera({ half, center: fit.center, elevationDeg: elevation });
    core.applyPivotOffset(camera, { cx: frame.cx, cy: frame.cy, half });
    const distance = camera.position.distanceTo(fit.center);

    // 5. render célula a célula (row = direção, col = frame)
    let done = 0;
    for (const pose of poses) {
      if (state.cancelled) throw new CancelledError();
      applyPose(pose);
      // Luz presa à câmera gira junto com o que se move em relação ao
      // observador: o modelo, no modo normal; a câmera, no turntable.
      lightFollowAz = lightFollow ? (turntable ? pose.camAzimuth : pose.modelAzimuth) : 0;
      placeLights(lightAz, lightFollowAz);
      core.placeCamera(camera, fit.center, pose.camAzimuth, elevation, distance);
      sheetRenderer.render(scene, camera);
      // SSAA 2x: o drawImage reduz de 2× para 1× e já faz o downsample.
      const rect = core.cellRect(layout, pose.dir, pose.frame);
      sctx.drawImage(sheetRenderer.domElement, rect.x, rect.y, rect.w, rect.h);
      done++;
      setProgress(0.02 + 0.68 * (done / poses.length), t('renderizando {i}/{n} — dir {d}, frame {f}', { i: done, n: poses.length, d: String(pose.dir).padStart(2, '0'), f: pose.frame + 1 }));
      await yieldToBrowser();
    }

    // 5b. Camada de sombra: segundo passe com o modelo sem escrever cor.
    // `colorWrite = false` mantém o modelo no passe de sombras (ele continua
    // projetando) mas o tira da imagem — o que sobra é só a sombra no chão, na
    // MESMA grade da sheet. É isso que permite ligar/desligar a sombra no jogo.
    let shadowSheet = null;
    if (wantShadowLayer) {
      setProgress(0.72, 'renderizando a camada de sombra…');
      await yieldToBrowser();
      shadowSheet = document.createElement('canvas');
      shadowSheet.width = layout.w;
      shadowSheet.height = layout.h;
      const shctx = shadowSheet.getContext('2d', { willReadFrequently: true });
      const materiais = [];
      state.model.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (!materiais.includes(m)) materiais.push(m);
      });
      const colorWriteAntes = materiais.map((m) => m.colorWrite);
      materiais.forEach((m) => { m.colorWrite = false; });
      const groundAntes = ground.visible;
      const opacidadeAntes = ground.material.opacity;
      ground.visible = true;
      // Opaca: a camada separada é um sprite que a engine compõe e modula.
      ground.material.opacity = 1;
      sheetRenderer.setClearColor(0x000000, 0);   // a camada é sempre transparente
      let doneShadow = 0;
      for (const pose of poses) {
        if (state.cancelled) break;
        applyPose(pose);
        lightFollowAz = lightFollow ? (turntable ? pose.camAzimuth : pose.modelAzimuth) : 0;
        placeLights(lightAz, lightFollowAz);
        core.placeCamera(camera, fit.center, pose.camAzimuth, elevation, distance);
        sheetRenderer.render(scene, camera);
        const rect = core.cellRect(layout, pose.dir, pose.frame);
        shctx.drawImage(sheetRenderer.domElement, rect.x, rect.y, rect.w, rect.h);
        doneShadow++;
        setProgress(0.72 + 0.25 * (doneShadow / poses.length), t('sombra {i}/{n}', { i: doneShadow, n: poses.length }));
        await yieldToBrowser();
      }
      materiais.forEach((m, i) => { m.colorWrite = colorWriteAntes[i]; });
      ground.material.opacity = opacidadeAntes;
      ground.visible = groundAntes;
      applyBackground(background);
      if (state.cancelled) throw new CancelledError();

      // Censo: "a sombra saiu vazia" não dá para diagnosticar de longe — pode ser
      // a luz, o chão fora do enquadramento, a opacidade ou o export. Contar os
      // pixels aqui transforma a suposição em número, na hora.
      const dadosSombra = shctx.getImageData(0, 0, shadowSheet.width, shadowSheet.height).data;
      const censo = core.alphaCensus(dadosSombra, shadowSheet.width, 1);
      state.result = state.result || {};
      gravador.registrar('sombra', censo.vazio
        ? `camada de sombra VAZIA (0 de ${censo.total} pixels com alpha) — elevação ${elevation}°, pivô ${pivot}, luz azimute ${Number(el.rngLightAz.value) || 0}°, intensidade ${Number(el.rngLightInt.value) || 0}, chão visível=${ground.visible}`
        : `camada de sombra com ${censo.visiveis}/${censo.total} pixels (${(censo.fracao * 100).toFixed(1)}%), caixa ${censo.caixa.w}×${censo.caixa.h} em (${censo.caixa.x},${censo.caixa.y})`,
        { ...censo, elevacao: elevation, pivot, luzAz: Number(el.rngLightAz.value) || 0,
          luzInt: Number(el.rngLightInt.value) || 0, tamanho: shadowSheet.width });
      if (censo.vazio) {
        warnings.push(t('a camada de sombra saiu VAZIA — veja o Diagnóstico e me mande o relatório da sessão'));
        gravador.contarErro();
      }
      gravarSessao();
    }

    // 6. metadados
    const meta = core.buildMetadata({
      baseName: `${state.name}_${clip ? clip.name : 'static'}`,
      layout, directionCount: dirCount, elevationDeg: elevation, times, fps,
      loop: el.chkLoopPerfect.checked, ssaa, turntable, background,
      azimuthOffsetDeg: azimuthOffset, pivot, custom: pivotCustom, lockScale, pxPerUnit: lockScale ? pxPerUnit : null,
      shadow: shadowSheet
        ? {
            file: `${state.name}_${clip ? clip.name : 'static'}_shadow.png`,
            layout: 'row-per-direction',
            note: 'mesma grade da sheet; desenhe antes do sprite e some quando quiser'
          }
        : null
    });
    const aseprite = core.buildAsepriteJson(meta);

    // 6b. Compactação (trim): corta cada frame no que tem tinta e reempacota.
    // A folha em grade continua intacta — o player, o preview e a receita de
    // "grid slice" do Unity dependem dela. Isto é um arquivo EXTRA.
    let packed = null;
    if (el.chkTrim.checked) {
      const dadosSheet = sctx.getImageData(0, 0, sheet.width, sheet.height).data;
      const boxes = core.trimBoxes(dadosSheet, sheet.width, layout, 1);
      const pacote = core.packRects(boxes.map((b) => b.caixa), {
        maxSide: core.MAX_SHEET_SIDE, padding: layout.padding
      });
      if (pacote.overflow) {
        warnings.push(t('a folha compactada passou de {n}px — não deu para compactar', { n: String(core.MAX_SHEET_SIDE) }));
      } else if (pacote.w > 0) {
        const tela = document.createElement('canvas');
        tela.width = pacote.w;
        tela.height = pacote.h;
        const tctx = tela.getContext('2d', { willReadFrequently: true });
        // A matemática dos offsets mora em core.trimCopies (testada em Node);
        // aqui só se desenha.
        for (const c of core.trimCopies(layout, boxes, pacote.placements)) {
          tctx.drawImage(sheet, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
        }
        const metaPacked = core.applyTrimToMetadata(meta, {
          boxes, placements: pacote.placements, size: { w: pacote.w, h: pacote.h }
        });
        const areaGrade = layout.w * layout.h;
        const economia = areaGrade ? 1 - pacote.area / areaGrade : 0;
        packed = { canvas: tela, meta: metaPacked, economia };
        gravador.registrar('trim',
          `folha compactada ${pacote.w}×${pacote.h} a partir de ${layout.w}×${layout.h} ` +
          `(${(economia * 100).toFixed(1)}% menor, ${boxes.filter((b) => !b.vazio).length}/${boxes.length} frames com tinta)`,
          { w: pacote.w, h: pacote.h, gradeW: layout.w, gradeH: layout.h, economia });
      }
    }

    state.result = { layout, meta, aseprite, sheet, shadowSheet, packed, fps, fit, frame, dirCount, turntable, half };
    state.player.dir = 0;
    state.player.frame = 0;
    showTab('results');
    state.result.infoFn = () => {
      el.sheetInfo.textContent =
        t('{w}×{h} px · {cols} frames × {rows} direções · célula {cell}px', {
          w: layout.w, h: layout.h, cols: layout.cols, rows: layout.rows, cell: layout.cell
        }) +
        (layout.padding ? t(' + {p}px de vão', { p: layout.padding }) : '') +
        (ssaa ? ' · SSAA 2x' : '') +
        ` · half=${half.toFixed(2)} · pivot ${pivot}`;
      el.jsonInfo.textContent =
        t('{arquivo} · {n} frames · {fps} fps · elevação {elev}°', {
          arquivo: meta.image, n: Object.keys(meta.frames).length, fps, elev: elevation
        }) +
        (azimuthOffset ? t(' · frente {az}°', { az: azimuthOffset }) : '') +
        ` · ${turntable ? 'turntable' : t('modelo girando')}` +
        (lockScale ? t(' · {ppu} px/unidade', { ppu: pxPerUnit }) : '');
      // O botão da compactada só existe quando o trim estava ligado: deixar ele
      // sempre visível e morto convidaria a um clique sem efeito.
      el.rowPacked.hidden = !packed;
      el.packedInfo.hidden = !packed;
      if (packed) {
        el.packedInfo.textContent = t(
          'folha compactada: {w}×{h} a partir de {gw}×{gh} — {p}% menor. Importe pelo metadata compactado, não por grid slice.',
          { w: packed.canvas.width, h: packed.canvas.height, gw: layout.w, gh: layout.h,
            p: (packed.economia * 100).toFixed(0) }
        );
      }
    };
    state.result.infoFn();
    drawSheetPreview();
    buildDirectionSelector();
    drawPlayer();
    el.gifList.innerHTML = '';
    if (warnings.length) setStatus(warnings.join(' · '), 'err');
    else setStatus(t('sheet pronta: {w}×{h} ({cols}×{rows} células de {cell}px)', { w: layout.w, h: layout.h, cols: layout.cols, rows: layout.rows, cell: layout.cell }) + (shadowSheet ? t(' · camada de sombra pronta no botão shadow.png') : '') + (packed ? t(' · compactada {w}×{h} ({p}% menor)', { w: packed.canvas.width, h: packed.canvas.height, p: (packed.economia * 100).toFixed(0) }) : ''), 'ok');
    gravador.contarGeracao('concluidas', performance.now() - geracaoInicio);
    gravador.registrar('geracao', `sheet concluída em ${Math.round(performance.now() - geracaoInicio)}ms — ${layout.w}×${layout.h}`, {
      w: layout.w, h: layout.h, ms: Math.round(performance.now() - geracaoInicio)
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      gravador.contarGeracao('canceladas', performance.now() - geracaoInicio);
      gravador.registrar('geracao', `geração cancelada após ${Math.round(performance.now() - geracaoInicio)}ms`);
      setStatus('geração cancelada — a sheet anterior continua válida', 'err');
    } else {
      console.error(err);
      gravador.contarGeracao('falhas', performance.now() - geracaoInicio);
      gravador.registrar('erro', `geração falhou: ${err && err.message ? err.message : err}`, {
        stack: err && err.stack ? String(err.stack).slice(0, 1200) : null
      });
      setStatus(t('falha na geração: {msg}', { msg: err.message }), 'err');
    }
  } finally {
    state.model.rotation.y = prevRotation;
    if (state.mixer && clip) state.mixer.setTime(prevTime);
    state.model.updateMatrixWorld(true);
    lightFollowAz = 0;
    applyLightRig();
    if (renderer) renderer.setClearColor(0x000000, 0);
    state.generating = false;
    state.cancelled = false;
    state.playing = wasPlaying;
    el.btnPlay.textContent = state.playing ? 'Pause' : 'Play';
    el.btnGenerate.disabled = false;
    el.btnCancel.disabled = true;
    showProgress(false);
  }
}

el.btnGenerate.addEventListener('click', generate);

/* ================================================================== *
 * 7. Preview da sheet (com grade opcional)
 * ================================================================== */
function drawSheetPreview() {
  const r = state.result;
  if (!r) return;
  const canvas = el.sheetPreview;
  canvas.width = r.sheet.width;
  canvas.height = r.sheet.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(r.sheet, 0, 0);
  if (el.chkGrid.checked) {
    // Retângulo por célula (e não linhas a cada N px): com padding as linhas
    // saíriam do lugar.
    ctx.strokeStyle = 'rgba(77,163,255,0.6)';
    ctx.lineWidth = Math.max(1, r.layout.cell / 128);
    for (let d = 0; d < r.layout.rows; d++) {
      for (let f = 0; f < r.layout.cols; f++) {
        const rect = core.cellRect(r.layout, d, f);
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      }
    }
  }
  // O "alvo": o ponto que a engine vai usar como âncora, em cada célula.
  if (el.chkPivotMark.checked) {
    const p = r.meta.pivot;
    const raio = Math.max(3, r.layout.cell / 14);
    ctx.strokeStyle = 'rgba(255,90,160,0.95)';
    ctx.lineWidth = Math.max(1, r.layout.cell / 96);
    for (let d = 0; d < r.layout.rows; d++) {
      for (let f = 0; f < r.layout.cols; f++) {
        const rect = core.cellRect(r.layout, d, f);
        const x = rect.x + p.x * rect.w;
        const y = rect.y + p.y * rect.h;
        ctx.beginPath();
        ctx.arc(x, y, raio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - raio * 1.9, y); ctx.lineTo(x - raio * 0.5, y);
        ctx.moveTo(x + raio * 0.5, y); ctx.lineTo(x + raio * 1.9, y);
        ctx.moveTo(x, y - raio * 1.9); ctx.lineTo(x, y - raio * 0.5);
        ctx.moveTo(x, y + raio * 0.5); ctx.lineTo(x, y + raio * 1.9);
        ctx.stroke();
      }
    }
  }
}
el.chkGrid.addEventListener('change', drawSheetPreview);
el.chkPivotMark.addEventListener('change', drawSheetPreview);
el.selPivot.addEventListener('change', () => { el.rowPivotCustom.hidden = el.selPivot.value !== 'custom'; });

/* ================================================================== *
 * 8. Player (zoom 1–6x, direção, play/pause, fps)
 * ================================================================== */
function buildDirectionSelector() {
  const r = state.result;
  if (!r) return;
  el.playerDir.innerHTML = '';
  const step = 360 / r.dirCount;
  for (let d = 0; d < r.dirCount; d++) {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = `dir${String(d).padStart(2, '0')} · ${Math.round(d * step)}°`;   // só números
    el.playerDir.appendChild(opt);
  }
  el.playerDir.value = String(state.player.dir);
}

/** Caixa fixa do player: o tamanho vem do CSS, não do zoom. */
const PLAYER_BOX = 256;

/**
 * Desenha o quadro atual no player.
 *
 * O zoom é uma LUPA dentro da caixa fixa: o que muda é o pedaço da célula
 * recortado (cell/zoom), não o tamanho do canvas. Antes o canvas crescia junto
 * com o zoom e empurrava o layout inteiro — por isso "quebrava a formatação".
 */
function drawPlayer() {
  const r = state.result;
  if (!r) return;
  const zoom = Math.max(1, Number(el.rngZoom.value) || 1);
  const cell = r.layout.cell;
  const canvas = el.playerCanvas;
  if (canvas.width !== PLAYER_BOX || canvas.height !== PLAYER_BOX) {
    canvas.width = PLAYER_BOX;
    canvas.height = PLAYER_BOX;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;   // pixel art: ampliar tem de continuar quadrado
  ctx.clearRect(0, 0, PLAYER_BOX, PLAYER_BOX);
  const rect = core.cellRect(r.layout, state.player.dir, state.player.frame);
  const lado = cell / zoom;
  const sx = rect.x + (cell - lado) / 2;
  const sy = rect.y + (cell - lado) / 2;
  // A sombra é uma camada: desenhada antes, e some quando o checkbox desliga.
  if (r.shadowSheet && el.chkPlayerShadow.checked) {
    ctx.drawImage(r.shadowSheet, sx, sy, lado, lado, 0, 0, PLAYER_BOX, PLAYER_BOX);
  }
  ctx.drawImage(r.sheet, sx, sy, lado, lado, 0, 0, PLAYER_BOX, PLAYER_BOX);
}

function playerTick(ts) {
  requestAnimationFrame(playerTick);
  const r = state.result;
  if (!r || !state.player.playing) { state.player.last = ts; return; }
  const fps = Number(el.rngFps.value) || core.DEFAULT_FPS;
  if (ts - state.player.last >= 1000 / fps) {
    state.player.last = ts;
    state.player.frame = (state.player.frame + 1) % r.layout.cols;
    drawPlayer();
  }
}

el.playerDir.addEventListener('change', () => { state.player.dir = Number(el.playerDir.value); drawPlayer(); });
el.btnPlayerPlay.addEventListener('click', () => {
  gravador.marcar('player');
  state.player.playing = !state.player.playing;
  el.btnPlayerPlay.textContent = state.player.playing ? 'Pause' : 'Play';
});

/* ================================================================== *
 * 9. Downloads: PNG, metadata.json, sidecar Aseprite e GIF por direção
 * ================================================================== */
/* ---- pasta de saída ----
 * Sem isto todo arquivo cai na pasta de downloads do navegador. O usuário
 * escolhe a pasta UMA vez; o handle fica no IndexedDB (localStorage não guarda
 * FileSystemDirectoryHandle). Sem a API — Firefox, Safari — segue o download. */
const saida = { pasta: null, permissao: false, escolhendo: false };
async function restaurarPastaSaida() {
  saida.pasta = await pasta.lerPasta();
  // Sem gesto do usuário o navegador não deixa PEDIR permissão, só consultar.
  saida.permissao = await pasta.permissaoOk(saida.pasta, false);
  atualizarRotuloPasta();
}
function atualizarRotuloPasta() {
  if (!el.btnPastaSaida) return;
  if (!saida.pasta) {
    el.btnPastaSaida.textContent = t('Pasta do app: não escolhida');
    el.btnPastaSaida.title = t('Sem pasta escolhida: os arquivos vão para a pasta de downloads e salvar projeto abre um diálogo. Clique e escolha a pasta do app — as exportações passam a sair em saida/ e os projetos em projetos/, sem perguntar.');
    return;
  }
  const falta = saida.permissao ? '' : t(' — clique para autorizar');
  el.btnPastaSaida.textContent = t('Pasta do app: {nome}', { nome: saida.pasta.name }) + falta;
  el.btnPastaSaida.title = t('Exportações saem em "{nome}/saida/" e projetos em "{nome}/projetos/". Clique para trocar; botão direito para esquecer.', { nome: saida.pasta.name });
}
async function escolherPastaSaida() {
  if (!pasta.apiDisponivel()) {
    setStatus(t('este navegador não deixa escolher pasta de saída (Firefox/Safari) — os arquivos continuam indo para downloads'), 'err');
    return;
  }
  // O Chrome rejeita um segundo seletor enquanto um está aberto
  // ("File picker already active"), e a rejeição virava erro no relatório.
  // Clicar de novo porque "nada aconteceu" é justamente o que dispara isso.
  if (saida.escolhendo) {
    setStatus(t('o seletor de pasta já está aberto — termine ou cancele ele primeiro'), 'err');
    return;
  }
  saida.escolhendo = true;
  let dir = null;
  try {
    dir = await pasta.escolherPasta();
  } catch (err) {
    setStatus(t('não consegui abrir o seletor de pasta ({msg})', { msg: err && err.message ? err.message : err }), 'err');
    return;
  } finally {
    saida.escolhendo = false;
  }
  if (!dir) return;                                  // cancelou
  saida.pasta = dir;
  saida.permissao = await pasta.permissaoOk(dir, true);
  await pasta.guardarPasta(dir);
  gravador.registrar('saida', `pasta de saída -> ${dir.name}${saida.permissao ? '' : ' (sem permissão)'}`);
  gravarSessao();
  atualizarRotuloPasta();
  setStatus(saida.permissao
    ? t('arquivos agora saem na pasta "{nome}"', { nome: dir.name })
    : t('pasta "{nome}" escolhida, mas a permissão de escrita foi negada — vai continuar baixando', { nome: dir.name }),
    saida.permissao ? 'ok' : 'err');
}
async function esquecerPastaSaida() {
  saida.pasta = null;
  saida.permissao = false;
  await pasta.esquecerPasta();
  gravador.registrar('saida', 'pasta de saída esquecida — voltou para downloads');
  atualizarRotuloPasta();
  setStatus(t('pasta de saída esquecida — voltou para a pasta de downloads'), 'ok');
}

/* ---- aviso visível de que algo saiu ----
 * Sem isto o usuário clica e nada acontece na tela: o download do navegador
 * aparece lá embaixo na barra dele, e gravar na pasta não mostra NADA.
 */
let toastTimer = 0;
function avisar(msgHtml, { erro = false, ms = 3200 } = {}) {
  if (!el.toast) return;
  el.toast.innerHTML = msgHtml;
  el.toast.className = erro ? 'on err' : 'on';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = ''; }, ms);
}

/**
 * Devolve a subpasta de um tipo dentro da pasta escolhida, criando se preciso.
 *
 * A pasta escolhida é a do APP: dentro dela as exportações vão para `saida/` e
 * os projetos para `projetos/`. É o que o usuário espera — escolher uma vez e
 * cada coisa cair no lugar certo, sem diálogo a cada salvamento. Se o usuário
 * apontou direto para uma pasta que já tem o nome do tipo, não aninha.
 */
async function pastaPara(tipo) {
  if (!saida.pasta) return null;
  // Depois de reabrir o navegador a permissão volta a `prompt`. Quem chama está
  // num clique, que é gesto válido, então dá para PEDIR aqui — sem isso o
  // arquivo caía em downloads sem avisar e o usuário achava que não funcionou.
  if (!saida.permissao) {
    saida.permissao = await pasta.permissaoOk(saida.pasta, true);
    atualizarRotuloPasta();
    if (!saida.permissao) return null;
  }
  if (saida.pasta.name === tipo) return saida.pasta;
  try {
    return await saida.pasta.getDirectoryHandle(tipo, { create: true });
  } catch {
    return saida.pasta;      // sem permissão de criar subpasta: usa a raiz
  }
}

/**
 * Roteia TODO download: pasta escolhida com permissão -> grava lá; senão, baixa.
 * Fazer isso aqui, e não em cada botão, é o que garante que sheet, JSON,
 * Aseprite, sombra, GIFs, ZIP, projeto e relatório se comportem iguais.
 */
async function downloadBlob(blob, filename) {
  const nome = pasta.nomeSeguro(filename);
  const destino = await pastaPara('saida');
  if (destino) {
    try {
      await pasta.escreverArquivo(destino, nome, blob);
      gravador.registrar('saida', `${nome} -> ${destino.name}/`);
      gravarSessao();
      avisar(t('gravado em <b>{pasta}</b>/{nome}', { pasta: destino.name, nome }));
      return;
    } catch (err) {
      // Não perde o arquivo: cai no download e avisa.
      gravador.registrar('erro', `não consegui gravar ${nome} na pasta (${err && err.message ? err.message : err}) — baixando`);
      setStatus(t('não consegui gravar na pasta ({msg}) — baixei em vez disso', { msg: err && err.message ? err.message : err }), 'err');
      avisar(t('não consegui gravar na pasta ({msg}) — baixei em vez disso', { msg: err && err.message ? err.message : err }), { erro: true });
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  avisar(t('baixando <b>{nome}</b> — veja a pasta de downloads do navegador', { nome }));
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const jsonBlob = (obj) => new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });

el.dlSheet.addEventListener('click', () => {
  const r = state.result;
  if (!r) return;
  gravador.marcar('dlSheet');
  gravador.contarDownload();
  r.sheet.toBlob((blob) => blob && downloadBlob(blob, r.meta.image), 'image/png');
});
el.dlPacked.addEventListener('click', () => {
  const r = state.result;
  if (!r || !r.packed) {
    setStatus(t('gere a sheet com "Compactar (trim)" marcada para ter a folha compactada'), 'err');
    return;
  }
  gravador.marcar('dlPacked');
  gravador.contarDownload();
  // O PNG sem o metadata compactado é inútil: os frames não estão mais numa
  // grade, então só o JSON diz onde cada um parou.
  r.packed.canvas.toBlob((blob) => blob && downloadBlob(blob, r.packed.meta.image), 'image/png');
  const base = r.packed.meta.image.replace(/_sheet_packed\.png$/, '');
  downloadBlob(jsonBlob(r.packed.meta), `${base}_packed_metadata.json`);
});
el.dlShadow.addEventListener('click', () => {
  const r = state.result;
  if (!r || !r.shadowSheet) { setStatus('gere a sheet com "Camada de sombra separada" marcada', 'err'); return; }
  gravador.marcar('dlSombra');
  gravador.contarDownload();
  r.shadowSheet.toBlob((blob) => blob && downloadBlob(blob, r.meta.shadow.file), 'image/png');
});
/** Personagem + sombra numa imagem só, com alpha de 8 bits.
 *  É a resposta para "sprite com sombra real e fundo transparente": em PNG dá,
 *  em GIF não — o alpha do GIF é de 1 bit, então lá a sombra só sai pontilhada
 *  ou sólida. As duas folhas têm a mesma grade, então basta desenhar uma sobre a outra. */
function composeSheetWithShadow(r) {
  const c = document.createElement('canvas');
  c.width = r.layout.w;
  c.height = r.layout.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // A camada separada é preta opaca; aqui ela volta a 35% para a composta ficar
  // igual ao que o preview e a folha comum mostram.
  ctx.globalAlpha = SOMBRA_OPACIDADE;
  ctx.drawImage(r.shadowSheet, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(r.sheet, 0, 0);
  return c;
}

/** Nome do arquivo composto: <base>_sheet.png -> <base>_com_sombra.png */
function nomeSheetComSombra(r) {
  return r.meta.image.replace(/_sheet\.png$/, '_com_sombra.png');
}

el.dlSheetShadow.addEventListener('click', () => {
  const r = state.result;
  if (!r || !r.shadowSheet) { setStatus('gere a sheet com "Camada de sombra separada" marcada', 'err'); return; }
  composeSheetWithShadow(r).toBlob((blob) => blob && downloadBlob(blob, nomeSheetComSombra(r)), 'image/png');
});

el.chkPlayerShadow.addEventListener('change', drawPlayer);

el.dlJson.addEventListener('click', () => {
  gravador.marcar('dlJson');
  gravador.contarDownload();
  const r = state.result;
  if (r) downloadBlob(jsonBlob(r.meta), `${r.meta.image.replace(/_sheet\.png$/, '')}_metadata.json`);
});
el.dlAseprite.addEventListener('click', () => {
  gravador.marcar('dlAseprite');
  gravador.contarDownload();
  const r = state.result;
  if (r) downloadBlob(jsonBlob(r.aseprite), r.meta.image.replace(/_sheet\.png$/, '.aseprite.json'));
});

/**
 * Codifica os GIFs de todas as direções.
 * `rngGifScale` reduz a célula antes de quantizar: GIF é 256 cores por quadro,
 * então um sprite de 512px desperdiça paleta — e o arquivo fica enorme.
 */
const GIF_BG = { white: '#ffffff', dark: '#15181d' };

/** Como o GIF sai. A folha do personagem segue o fundo escolhido; a da sombra é
 *  sempre transparente — um sprite de sombra com fundo sólido não serve para nada. */
function opcoesGif() {
  const bg = el.selGifBg.value;
  const modo = el.selShadowGif.value || 'silhueta';
  return {
    personagem: {
      transparente: bg === 'transparent' || bg === 'dither',
      pontilhado: bg === 'dither',
      alphaCut: core.GIF_ALPHA_CUT,
      comSombra: true,
      fundo: GIF_BG[bg] || '#ffffff',
      rotulo: `GIFs do personagem — dir00…dir${String(state.result ? state.result.dirCount - 1 : 7).padStart(2, '0')}`
    },
    sombra: {
      transparente: true,
      pontilhado: modo === 'pontilhado',
      // silhueta: corte baixo para os 35% de alpha virarem preto sólido. É o que
      // dá para usar em jogo — no motor você escolhe a transparência (modulate /
      // self_modulate), coisa que o GIF, com alpha de 1 bit, não consegue guardar.
      alphaCut: modo === 'pontilhado' ? core.GIF_ALPHA_CUT : 8,
      comSombra: false,
      fundo: null,
      rotulo: 'GIFs da sombra — sprite à parte, desenhe antes do personagem'
    }
  };
}

/** Codifica um GIF por direção a partir de qualquer folha na mesma grade
 *  (a do personagem ou a da sombra — as duas têm célula, linhas e colunas iguais).
 *  `sombraSource` recompõe a sombra por baixo do personagem: com a camada separada
 *  a folha do personagem vem limpa, e o GIF ainda pode sair com sombra. */
async function buildGifs(r, source, delay, opcao, sombraSource = null) {
  const scale = Number(el.rngGifScale.value) || 1;
  const cell = r.layout.cell;
  const size = Math.max(1, Math.round(cell * scale));
  const tmp = document.createElement('canvas');
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  tctx.imageSmoothingEnabled = scale > 1;   // reduzir suaviza; ampliar fica vizinho mais próximo
  const out = [];
  for (let d = 0; d < r.dirCount; d++) {
    const frames = [];
    for (let f = 0; f < r.layout.cols; f++) {
      const rect = core.cellRect(r.layout, d, f);
      tctx.clearRect(0, 0, size, size);
      // GIF tem alpha de 1 bit. Com fundo, a sombra (preta a 35%) é composta de
      // verdade e o GIF fica igual ao preview. Sem fundo ela não tem como
      // existir: o corte em 50% a remove — o que NÃO se pode fazer é deixá-la
      // semitransparente, porque aí ela sai preta sólida (era o bug).
      if (!opcao.transparente) {
        tctx.fillStyle = opcao.fundo || '#ffffff';
        tctx.fillRect(0, 0, size, size);
      }
      if (sombraSource && opcao.comSombra) {
        tctx.drawImage(sombraSource, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
      }
      tctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
      frames.push(tctx.getImageData(0, 0, size, size).data);
    }
    out.push({
      dir: d,
      size,
      bytes: core.encodeGif({
        width: size, height: size, frames, delays: frames.map(() => delay),
        transparent: opcao.transparente, dither: opcao.pontilhado, alphaCut: opcao.alphaCut
      })
    });
    setProgress((d + 1) / r.dirCount, t('GIF dir{d} ({i}/{n})', { d: String(d).padStart(2, '0'), i: d + 1, n: r.dirCount }));
    await yieldToBrowser();
  }
  return out;
}

/** Coloca um conjunto de GIFs na lista, com legenda e link de download. */
function montarGifs(gifs, sufixo, rotulo) {
  const base = state.result.meta.image.replace(/_sheet\.png$/, '');
  const titulo = document.createElement('div');
  titulo.className = 'gifGroup';
  titulo.textContent = rotulo;
  el.gifList.appendChild(titulo);
  for (const { dir, bytes, size } of gifs) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    state.gifUrls.set(sufixo + dir, url);
    const fig = document.createElement('figure');
    fig.className = 'gifItem';
    const img = document.createElement('img');
    img.src = url;
    img.width = size;
    img.height = size;
    const cap = document.createElement('figcaption');
    cap.textContent = `dir${String(dir).padStart(2, '0')} · ${size}px`;   // só números: nada a traduzir
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}_dir${String(dir).padStart(2, '0')}${sufixo}.gif`;
    link.textContent = 'baixar';
    // O download é um <a download>, que não sabe escrever em pasta: com a pasta
    // de saída ativa o clique é interceptado e o arquivo é gravado lá. Sem pasta,
    // o comportamento padrão do link continua valendo.
    const nomeGif = link.download;
    const blobGif = new Blob([bytes], { type: 'image/gif' });
    link.addEventListener('click', (e) => {
      gravador.marcar('dlGif');
      gravador.contarDownload();
      gravarSessao();
      if (!(saida.pasta && saida.permissao)) return;
      e.preventDefault();
      downloadBlob(blobGif, nomeGif);
    });
    fig.append(img, cap, link);
    el.gifList.appendChild(fig);
  }
}

/** Tudo o que o ZIP leva, com a receita de uso dentro. */
function readmeDoZip(r) {
  const m = r.meta;
  return [
    'SpriteForge Web — conteúdo deste pacote',
    '======================================',
    '',
    `${m.image}: ${m.size.w}x${m.size.h} px, ${m.grid.cols} colunas (frames) x ${m.grid.rows} linhas (direcoes), celula ${m.cell.w}px` +
      (m.cell.padding ? ` com ${m.cell.padding}px de vao` : ''),
    `pivot: x=${m.pivot.x} y=${m.pivot.y} (normalizado dentro da celula, y medido do topo)`,
    `direcoes: ${m.directions.count}, passo ${m.directions.angle_step_deg} graus, frente em ${m.directions.angle_offset_deg} graus`,
    `animacao: ${m.animation.count} frames a ${m.animation.fps} fps, loop=${m.animation.loop}`,
    '',
    'Godot 4: AnimatedSprite2D + SpriteFrames -> "Add frames from Sprite Sheet",',
    `  cols=${m.grid.cols}, rows=${m.grid.rows}; em Offset use (0.5 - pivot.x, 0.5 - pivot.y) * tamanho da celula.`,
    '',
    'Unity: Sprite Mode = Multiple, Sprite Editor -> Grid By Cell Count',
    `  (${m.grid.cols}x${m.grid.rows}); Pivot = Custom, em pixels: (pivot.x * ${m.cell.w}, (1 - pivot.y) * ${m.cell.h}).`,
    '',
    'Aseprite: File > Import Sprite Sheet, usando o .aseprite.json (ja traz as tags dirNN e o anchor).',
    '',
    m.shadow
      ? `Tres formas de usar a sombra, escolha uma:`
        + `\n  1. ${nomeSheetComSombra(r)} — personagem e sombra num sprite so, com alpha de`
        + ` verdade (a sombra a 35% como no preview). O mais simples de usar.`
        + `\n  2. ${m.shadow.file} — so a sombra, mesma grade da sheet. No motor: desenhe ANTES`
        + ` do personagem e esconda o no para tirar a sombra quando quiser.`
        + `\n  3. gif_sombra/ — um GIF animado por direcao, para quem usa GIF em vez de sheet.`
        + `\n  gif/ tem os GIFs do personagem (sem sombra: ela ficou nas opcoes acima).`
      : 'gif/ tem um GIF animado por direcao.',
    '',
    'Os GIFs em gif/ sao so para conferencia visual: GIF tem 256 cores por quadro e',
    'nao guarda alpha de verdade (usa o indice 0). Para o jogo use o PNG + metadata.'
  ].join('\n');
}

/** Baixa tudo de uma vez: sheet + metadata + sidecar + GIFs + LEIA-ME. */
async function downloadZip() {
  const r = state.result;
  if (!r) { setStatus('gere a sheet antes de baixar o .zip', 'err'); return; }
  const base = r.meta.image.replace(/_sheet\.png$/, '');
  el.dlZip.disabled = true;
  showProgress(true);
  try {
    setProgress(0.1, 'empacotando a sheet…');
    await yieldToBrowser();
    const pngBlob = await new Promise((resolve) => r.sheet.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('o canvas não virou PNG (canvas grande demais?)');
    const files = {
      [r.meta.image]: new Uint8Array(await pngBlob.arrayBuffer()),
      [`${base}_metadata.json`]: strToU8(JSON.stringify(r.meta, null, 2)),
      [`${base}.aseprite.json`]: strToU8(JSON.stringify(r.aseprite, null, 2)),
      'LEIA-ME.txt': strToU8(readmeDoZip(r))
    };
    if (r.shadowSheet && r.meta.shadow) {
      setProgress(0.2, 'empacotando a camada de sombra…');
      const shadowBlob = await new Promise((resolve) => r.shadowSheet.toBlob(resolve, 'image/png'));
      if (shadowBlob) files[r.meta.shadow.file] = new Uint8Array(await shadowBlob.arrayBuffer());
      setProgress(0.28, 'compondo personagem + sombra…');
      const compostoBlob = await new Promise((resolve) => composeSheetWithShadow(r).toBlob(resolve, 'image/png'));
      if (compostoBlob) files[nomeSheetComSombra(r)] = new Uint8Array(await compostoBlob.arrayBuffer());
    }
    if (r.packed) {
      // A compactada vai junto, mas com o metadata PRÓPRIO: o metadata da grade
      // descreve retângulos que não existem mais na folha compactada.
      setProgress(0.32, 'empacotando a folha compactada…');
      const packedBlob = await new Promise((resolve) => r.packed.canvas.toBlob(resolve, 'image/png'));
      if (packedBlob) {
        files[r.packed.meta.image] = new Uint8Array(await packedBlob.arrayBuffer());
        files[`${base}_packed_metadata.json`] = strToU8(JSON.stringify(r.packed.meta, null, 2));
      }
    }
    setProgress(0.35, 'codificando os GIFs…');
    const delay = Math.round(1000 / (Number(el.rngFps.value) || r.fps));
    const opcoes = opcoesGif();
    const gifs = await buildGifs(r, r.sheet, delay, opcoes.personagem, r.shadowSheet);
    for (const g of gifs) files[`gif/${base}_dir${String(g.dir).padStart(2, '0')}.gif`] = g.bytes;
    if (r.shadowSheet) {
      setProgress(0.6, 'codificando os GIFs da sombra…');
      const gifsSombra = await buildGifs(r, r.shadowSheet, delay, opcoes.sombra);
      for (const g of gifsSombra) files[`gif_sombra/${base}_dir${String(g.dir).padStart(2, '0')}_shadow.gif`] = g.bytes;
    }
    setProgress(0.9, 'zipando…');
    await yieldToBrowser();
    const zip = zipSync(files, { level: 6 });
    downloadBlob(new Blob([zip], { type: 'application/zip' }), `${base}_spriteforge.zip`);
    setStatus(t('zip pronto: {kb} KB, {n} arquivos', { kb: (zip.length / 1024).toFixed(0), n: Object.keys(files).length }), 'ok');
  } catch (err) {
    console.error(err);
    setStatus(t('falha no zip: {msg}', { msg: err.message }), 'err');
  } finally {
    el.dlZip.disabled = false;
    showProgress(false);
  }
}
el.dlZip.addEventListener('click', () => {
  gravador.marcar('dlZip');
  gravador.contarDownload();
  downloadZip();
});

async function generateGifs() {
  const r = state.result;
  if (!r) { setStatus('gere a sheet antes dos GIFs', 'err'); return; }
  gravador.marcar('gifs');
  const gifInicio = performance.now();
  gravador.registrar('gif', `gerando GIFs de ${r.dirCount} direções`);
  const delay = Math.round(1000 / (Number(el.rngFps.value) || r.fps));
  const opcoes = opcoesGif();
  el.btnGif.disabled = true;
  el.gifList.innerHTML = '';
  for (const url of state.gifUrls.values()) URL.revokeObjectURL(url);
  state.gifUrls.clear();
  showProgress(true);
  try {
    const gifs = await buildGifs(r, r.sheet, delay, opcoes.personagem, r.shadowSheet);
    montarGifs(gifs, '', opcoes.personagem.rotulo);
    let extra = '';
    if (r.shadowSheet) {
      setProgress(0.5, 'codificando os GIFs da sombra…');
      const gifsSombra = await buildGifs(r, r.shadowSheet, delay, opcoes.sombra);
      montarGifs(gifsSombra, '_shadow', opcoes.sombra.rotulo);
      extra = ` + ${r.dirCount} da sombra (${el.selShadowGif.value === 'pontilhado' ? 'pontilhada a 35%' : 'silhueta preta'})`;
    } else {
      extra = ' — sem a camada de sombra: marque "Camada de sombra separada" e gere de novo';
    }
    setStatus(
      `${r.dirCount} GIFs prontos (${gifs[0].size}px)${extra} — ` +
      (el.selGifBg.value === 'dither'
        ? 'transparente com sombra pontilhada (Bayer 4x4: alpha de 1 bit fingindo 35%)'
        : el.selGifBg.value === 'transparent'
          ? 'transparente, recorte em 50% (a sombra some: GIF não tem alpha parcial)'
          : `composto sobre fundo ${el.selGifBg.value === 'white' ? 'branco' : 'escuro'} (a sombra aparece como no preview)`),
      'ok'
    );
    gravador.registrar('gif', `${r.dirCount} GIFs prontos em ${Math.round(performance.now() - gifInicio)}ms (${gifs[0].size}px)`, {
      dirCount: r.dirCount, size: gifs[0].size, ms: Math.round(performance.now() - gifInicio)
    });
  } catch (err) {
    console.error(err);
    gravador.registrar('erro', `GIF falhou: ${err && err.message ? err.message : err}`);
    setStatus(t('falha no GIF: {msg}', { msg: err.message }), 'err');
  } finally {
    el.btnGif.disabled = false;
    showProgress(false);
  }
}
el.btnGif.addEventListener('click', generateGifs);

/* ================================================================== *
 * 10. Boot
 * ================================================================== */
el.fileInput.accept = core.ACCEPT_ATTR;
el.btnCancel.disabled = true;
const salvo = loadSavedSettings();
applySettings(salvo ? salvo.settings : core.DEFAULT_SETTINGS);
markPreset(salvo && salvo.preset ? salvo.preset : 'default');
showTab('3d');
resizeViewport();
tick();
requestAnimationFrame(playerTick);
if (glProblems.length) setStatus(t('WebGL com problema — {detalhe}', { detalhe: glProblems.join(' | ') }), 'err');
else {
  setStatus(
    'pronto — arraste um modelo (.glb, .gltf, .obj, .fbx, .stl, .ply), use "Abrir" ou carregue o exemplo (Fox)' +
      (salvo ? ' · suas preferências foram restauradas' : '')
  );
}

gravador.registrar('sessao', `sessão iniciada — ${location.protocol === 'file:' ? 'file:// (não funciona)' : location.origin}`);
gravarSessao();
atualizarContagemLog();
restaurarPastaSaida();
