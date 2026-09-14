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
import { zipSync, strToU8 } from './libs/fflate.module.js';
import * as core from './core.js';

/* ================================================================== *
 * 0. Referências de DOM e estado
 * ================================================================== */
const $ = (id) => document.getElementById(id);
const el = {
  fileInput: $('fileInput'), btnOpen: $('btnOpen'), btnSample: $('btnSample'), modelInfo: $('modelInfo'),
  btnSampleStatic: $('btnSampleStatic'),
  btnDiag: $('btnDiag'), diagPanel: $('diagPanel'), diagBody: $('diagBody'), btnCopyDiag: $('btnCopyDiag'), btnCloseDiag: $('btnCloseDiag'),
  tab3d: $('tab3d'), tabResults: $('tabResults'), viewPane: $('viewPane'), resultPane: $('resultPane'),
  clipSelect: $('clipSelect'), btnPlay: $('btnPlay'), scrub: $('scrub'), scrubVal: $('scrubVal'), chkLoopPerfect: $('chkLoopPerfect'),
  selDirections: $('selDirections'), rngElevation: $('rngElevation'), elevationVal: $('elevationVal'),
  rngAzimuth: $('rngAzimuth'), azimuthVal: $('azimuthVal'), selPivot: $('selPivot'),
  rngPadding: $('rngPadding'), paddingVal: $('paddingVal'),
  chkLockScale: $('chkLockScale'), rowScaleLock: $('rowScaleLock'), rngScaleLock: $('rngScaleLock'), scaleLockVal: $('scaleLockVal'),
  rngFrames: $('rngFrames'), framesVal: $('framesVal'),
  rngCell: $('rngCell'), cellVal: $('cellVal'), chkSsaa: $('chkSsaa'), selBackground: $('selBackground'),
  chkTurntable: $('chkTurntable'), chkShadow: $('chkShadow'),
  chkLightCamera: $('chkLightCamera'), rngLightAz: $('rngLightAz'), lightAzVal: $('lightAzVal'),
  rngLightInt: $('rngLightInt'), lightIntVal: $('lightIntVal'),
  btnReset: $('btnReset'),   // os botões de preset vêm de .preset[data-preset]
  btnGenerate: $('btnGenerate'), btnCancel: $('btnCancel'),
  progressWrap: $('progressWrap'), progressBar: $('progressBar'), progressLabel: $('progressLabel'),
  viewport: $('viewport'), viewportWrap: $('viewportWrap'), viewBadge: $('viewBadge'), loadError: $('loadError'),
  sheetPreview: $('sheetPreview'), chkGrid: $('chkGrid'), sheetInfo: $('sheetInfo'),
  dlZip: $('dlZip'), dlSheet: $('dlSheet'), dlJson: $('dlJson'), dlAseprite: $('dlAseprite'), jsonInfo: $('jsonInfo'),
  playerFrame: $('playerFrame'), playerCanvas: $('playerCanvas'), playerDir: $('playerDir'), btnPlayerPlay: $('btnPlayerPlay'),
  rngFps: $('rngFps'), fpsVal: $('fpsVal'), rngZoom: $('rngZoom'), zoomVal: $('zoomVal'),
  btnGif: $('btnGif'), rngGifScale: $('rngGifScale'), selGifBg: $('selGifBg'), gifList: $('gifList'), status: $('status')
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

const setStatus = (msg, kind = '') => {
  el.status.textContent = msg;
  el.status.className = kind;
};

/* ================================================================== *
 * 1. Renderer, cena e rig de luz fixo no mundo
 * ================================================================== */
const scene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);

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
  push('viewport', `${el.viewportWrap?.clientWidth ?? '?'}×${el.viewportWrap?.clientHeight ?? '?'}`);
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

// Chão que só recebe sombra: com ShadowMaterial o fundo continua transparente.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35, color: 0x000000 }));
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
      const t = (state.mixer.time % clip.duration) / clip.duration;
      el.scrub.value = String(t);
      el.scrubVal.textContent = `${(t * clip.duration).toFixed(2)}s`;
    }
  }
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
  setStatus(`modelo anterior liberado (${stats.geometries} geometrias, ${stats.materials} materiais, ${stats.textures} texturas)`, 'ok');
}

function buildClipList() {
  el.clipSelect.innerHTML = '';
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = '— sem animação (1 frame) —';
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
  setStatus(clip ? `clip "${clip.name}" — ${dur.toFixed(3)}s` : 'modelo sem animação — 1 frame por direção');
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

  el.modelInfo.textContent = `${state.name} · ${core.formatOf(fileName).toUpperCase()} · ${prepared.meshes} mesh · ${Math.round(triangles)} tris · ${state.clips.length} clip(s)`;
  el.viewBadge.textContent = `${state.name} — ${state.clips.length ? `${state.clips.length} animação(ões)` : 'sem animação (1 frame por direção)'}`;
  el.btnGenerate.disabled = false;
  hideError();
  setStatus(
    `"${state.name}" carregado (${core.formatInfo(fileName)?.label || fileName})` +
      (state.clips.length ? `: ${state.clips.map((c) => c.name).join(', ')}` : ' — sem animação') +
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
    setStatus(`lendo ${main.name}…`);
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
    setStatus(`carregando samples/${filename}…`);
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
  presetButtons.forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
}

/** Escreve um objeto de configurações em todos os controles do painel. */
function applySettings(s) {
  el.selDirections.value = String(s.directions);
  el.rngFrames.value = String(s.frames);
  el.framesVal.value = String(s.frames);
  el.rngElevation.value = String(s.elevation);
  el.elevationVal.value = String(s.elevation);
  el.rngAzimuth.value = String(s.azimuthOffset);
  el.azimuthVal.value = String(s.azimuthOffset);
  el.selPivot.value = s.pivot;
  el.rngCell.value = String(s.cell);
  el.cellVal.value = String(s.cell);
  el.rngPadding.value = String(s.padding);
  el.paddingVal.value = String(s.padding);
  el.chkSsaa.checked = !!s.ssaa;
  el.chkLockScale.checked = !!s.lockScale;
  el.rngScaleLock.value = String(s.pxPerUnit);
  el.scaleLockVal.value = String(s.pxPerUnit);
  el.rowScaleLock.hidden = !s.lockScale;
  el.chkTurntable.checked = !!s.turntable;
  el.selBackground.value = s.background;
  el.chkShadow.checked = !!s.shadow;
  el.chkLoopPerfect.checked = !!s.loopPerfect;
  el.rngFps.value = String(s.fps);
  el.fpsVal.value = String(s.fps);
  el.rngZoom.value = String(s.zoom);
  el.zoomVal.value = String(s.zoom);
  el.rngGifScale.value = String(s.gifScale);
  el.selGifBg.value = s.gifBg;
  el.chkLightCamera.checked = !!s.lightCamera;
  el.rngLightAz.value = String(s.lightAz);
  el.lightAzVal.value = String(s.lightAz);
  el.rngLightInt.value = String(s.lightIntensity);
  el.lightIntVal.value = String(s.lightIntensity);
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
  setStatus(`predefinição "${btn.textContent.trim()}" aplicada — ajuste o que quiser e gere`, 'ok');
}));

el.btnReset.addEventListener('click', () => {
  applySettings(core.DEFAULT_SETTINGS);
  markPreset('default');
  saveSettings('default');
  setStatus('configurações de volta ao padrão do site', 'ok');
});

el.btnOpen.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => { loadFiles(el.fileInput.files); el.fileInput.value = ''; });
el.btnSample.addEventListener('click', () => loadSample('fox.glb'));
el.btnSampleStatic.addEventListener('click', () => loadSample('crate.obj'));

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
  if (ppu) setStatus(`escala travada em ${ppu.toFixed(2)} px/unidade (calibrada neste modelo) — mude para combinar com outros projetos`, 'ok');
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
for (const [rangeKey, numKey] of NUMERIC_PAIRS) {
  const range = el[rangeKey];
  const num = el[numKey];
  if (!range || !num) continue;
  range.addEventListener('input', () => { num.value = range.value; });
  const commit = (rewrite) => {
    if (num.value === '') return;
    const min = Number(range.min);
    const max = Number(range.max);
    const v = Math.min(max, Math.max(min, Number(num.value)));
    if (!Number.isFinite(v)) return;
    range.value = String(v);
    if (rewrite) num.value = String(v);   // devolve o valor clampado ao sair do campo
    range.dispatchEvent(new Event('input'));
  };
  num.addEventListener('input', () => commit(false));
  num.addEventListener('change', () => commit(true));
}

// Qualquer ajuste manual invalida a predefinição destacada e vai para a memória.
const SETTING_CONTROLS = [
  el.selDirections, el.rngFrames, el.rngElevation, el.rngAzimuth, el.selPivot, el.rngCell,
  el.rngPadding, el.chkSsaa, el.chkLockScale, el.rngScaleLock, el.chkTurntable, el.selBackground,
  el.chkShadow, el.chkLoopPerfect, el.rngFps, el.rngZoom, el.rngGifScale,
  el.chkLightCamera, el.rngLightAz, el.rngLightInt
];
SETTING_CONTROLS.forEach((node) => node.addEventListener('change', () => { markPreset(null); saveSettings(null); }));

/* ---- diagnóstico ---- */
el.btnDiag.addEventListener('click', () => {
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
  el.progressLabel.textContent = label;
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
  const padding = Number(el.rngPadding.value) || 0;
  const lockScale = el.chkLockScale.checked;
  const pxPerUnit = Number(el.rngScaleLock.value) || 8;
  const turntable = el.chkTurntable.checked;
  const background = el.selBackground.value;
  const fps = Number(el.rngFps.value) || core.DEFAULT_FPS;
  const lightAz = THREE.MathUtils.degToRad(Number(el.rngLightAz.value) || 0);
  const lightFollow = el.chkLightCamera.checked;
  const clip = state.clips[state.clipIndex] || null;
  const warnings = [];

  state.generating = true;
  state.cancelled = false;
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
    const frame = core.frameForPivot(fit.bounds, pivot);

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
    ground.visible = el.chkShadow.checked;

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
      setProgress(done / poses.length, `renderizando ${done}/${poses.length} — dir ${String(pose.dir).padStart(2, '0')}, frame ${pose.frame + 1}`);
      await yieldToBrowser();
    }

    // 6. metadados
    const meta = core.buildMetadata({
      baseName: `${state.name}_${clip ? clip.name : 'static'}`,
      layout, directionCount: dirCount, elevationDeg: elevation, times, fps,
      loop: el.chkLoopPerfect.checked, ssaa, turntable, background,
      azimuthOffsetDeg: azimuthOffset, pivot, lockScale, pxPerUnit: lockScale ? pxPerUnit : null
    });
    const aseprite = core.buildAsepriteJson(meta);

    state.result = { layout, meta, aseprite, sheet, fps, fit, frame, dirCount, turntable, half };
    state.player.dir = 0;
    state.player.frame = 0;
    showTab('results');
    el.sheetInfo.textContent =
      `${layout.w}×${layout.h} px · ${layout.cols} frames × ${layout.rows} direções · célula ${layout.cell}px` +
      (layout.padding ? ` + ${layout.padding}px de vão` : '') +
      (ssaa ? ' · SSAA 2x' : '') +
      ` · half=${half.toFixed(2)} · pivot ${pivot}`;
    el.jsonInfo.textContent =
      `${meta.image} · ${Object.keys(meta.frames).length} frames · ${fps} fps · elevação ${elevation}°` +
      (azimuthOffset ? ` · frente ${azimuthOffset}°` : '') +
      ` · ${turntable ? 'turntable' : 'modelo girando'}` +
      (lockScale ? ` · ${pxPerUnit} px/unidade` : '');
    drawSheetPreview();
    buildDirectionSelector();
    drawPlayer();
    el.gifList.innerHTML = '';
    if (warnings.length) setStatus(warnings.join(' · '), 'err');
    else setStatus(`sheet pronta: ${layout.w}×${layout.h} (${layout.cols}×${layout.rows} células de ${layout.cell}px)`, 'ok');
  } catch (err) {
    if (err && err.name === 'AbortError') setStatus('geração cancelada — a sheet anterior continua válida', 'err');
    else {
      console.error(err);
      setStatus(`falha na geração: ${err.message}`, 'err');
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
}
el.chkGrid.addEventListener('change', drawSheetPreview);

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
    opt.textContent = `dir${String(d).padStart(2, '0')} · ${Math.round(d * step)}°`;
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
  state.player.playing = !state.player.playing;
  el.btnPlayerPlay.textContent = state.player.playing ? 'Pause' : 'Play';
});

/* ================================================================== *
 * 9. Downloads: PNG, metadata.json, sidecar Aseprite e GIF por direção
 * ================================================================== */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const jsonBlob = (obj) => new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });

el.dlSheet.addEventListener('click', () => {
  const r = state.result;
  if (!r) return;
  r.sheet.toBlob((blob) => blob && downloadBlob(blob, r.meta.image), 'image/png');
});
el.dlJson.addEventListener('click', () => {
  const r = state.result;
  if (r) downloadBlob(jsonBlob(r.meta), `${r.meta.image.replace(/_sheet\.png$/, '')}_metadata.json`);
});
el.dlAseprite.addEventListener('click', () => {
  const r = state.result;
  if (r) downloadBlob(jsonBlob(r.aseprite), r.meta.image.replace(/_sheet\.png$/, '.aseprite.json'));
});

/**
 * Codifica os GIFs de todas as direções.
 * `rngGifScale` reduz a célula antes de quantizar: GIF é 256 cores por quadro,
 * então um sprite de 512px desperdiça paleta — e o arquivo fica enorme.
 */
const GIF_BG = { white: '#ffffff', dark: '#15181d' };

async function buildGifs(r, sctx, delay) {
  const scale = Number(el.rngGifScale.value) || 1;
  const bg = el.selGifBg.value;
  const transparente = bg === 'transparent';
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
      if (!transparente) {
        tctx.fillStyle = GIF_BG[bg] || '#ffffff';
        tctx.fillRect(0, 0, size, size);
      }
      tctx.drawImage(r.sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
      frames.push(tctx.getImageData(0, 0, size, size).data);
    }
    out.push({
      dir: d,
      size,
      bytes: core.encodeGif({ width: size, height: size, frames, delays: frames.map(() => delay), transparent: transparente })
    });
    setProgress((d + 1) / r.dirCount, `GIF dir${String(d).padStart(2, '0')} (${d + 1}/${r.dirCount})`);
    await yieldToBrowser();
  }
  return out;
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
    setProgress(0.35, 'codificando os GIFs…');
    const delay = Math.round(1000 / (Number(el.rngFps.value) || r.fps));
    const gifs = await buildGifs(r, r.sheet.getContext('2d', { willReadFrequently: true }), delay);
    for (const g of gifs) files[`gif/${base}_dir${String(g.dir).padStart(2, '0')}.gif`] = g.bytes;
    setProgress(0.9, 'zipando…');
    await yieldToBrowser();
    const zip = zipSync(files, { level: 6 });
    downloadBlob(new Blob([zip], { type: 'application/zip' }), `${base}_spriteforge.zip`);
    setStatus(`zip pronto: ${(zip.length / 1024).toFixed(0)} KB, ${Object.keys(files).length} arquivos`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus(`falha no zip: ${err.message}`, 'err');
  } finally {
    el.dlZip.disabled = false;
    showProgress(false);
  }
}
el.dlZip.addEventListener('click', downloadZip);

async function generateGifs() {
  const r = state.result;
  if (!r) { setStatus('gere a sheet antes dos GIFs', 'err'); return; }
  const base = r.meta.image.replace(/_sheet\.png$/, '');
  const delay = Math.round(1000 / (Number(el.rngFps.value) || r.fps));
  const sctx = r.sheet.getContext('2d', { willReadFrequently: true });
  el.btnGif.disabled = true;
  el.gifList.innerHTML = '';
  for (const url of state.gifUrls.values()) URL.revokeObjectURL(url);
  state.gifUrls.clear();
  showProgress(true);
  try {
    const gifs = await buildGifs(r, sctx, delay);
    for (const { dir, bytes, size } of gifs) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
      state.gifUrls.set(dir, url);
      const fig = document.createElement('figure');
      fig.className = 'gifItem';
      const img = document.createElement('img');
      img.src = url;
      img.width = size;
      img.height = size;
      const cap = document.createElement('figcaption');
      cap.textContent = `dir${String(dir).padStart(2, '0')} · ${size}px`;
      const link = document.createElement('a');
      link.href = url;
      link.download = `${base}_dir${String(dir).padStart(2, '0')}.gif`;
      link.textContent = 'baixar';
      fig.append(img, cap, link);
      el.gifList.appendChild(fig);
    }
    setStatus(
      `${r.dirCount} GIFs prontos (${gifs[0].size}px) — ` +
      (el.selGifBg.value === 'transparent'
        ? 'fundo transparente, recorte em 50% (a sombra some: GIF não tem alpha parcial)'
        : `composto sobre fundo ${el.selGifBg.value === 'white' ? 'branco' : 'escuro'} (a sombra aparece como no preview)`),
      'ok'
    );
  } catch (err) {
    console.error(err);
    setStatus(`falha no GIF: ${err.message}`, 'err');
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
if (glProblems.length) setStatus(`WebGL com problema — ${glProblems.join(' | ')}`, 'err');
else {
  setStatus(
    'pronto — arraste um modelo (.glb, .gltf, .obj, .fbx, .stl, .ply), use "Abrir" ou carregue o exemplo (Fox)' +
      (salvo ? ' · suas preferências foram restauradas' : '')
  );
}
