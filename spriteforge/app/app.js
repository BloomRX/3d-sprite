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
import * as core from './core.js';

/* ================================================================== *
 * 0. Referências de DOM e estado
 * ================================================================== */
const $ = (id) => document.getElementById(id);
const el = {
  fileInput: $('fileInput'), btnOpen: $('btnOpen'), btnSample: $('btnSample'), modelInfo: $('modelInfo'),
  clipSelect: $('clipSelect'), btnPlay: $('btnPlay'), scrub: $('scrub'), scrubVal: $('scrubVal'), chkLoopPerfect: $('chkLoopPerfect'),
  selDirections: $('selDirections'), rngElevation: $('rngElevation'), elevationVal: $('elevationVal'),
  rngFrames: $('rngFrames'), framesVal: $('framesVal'),
  rngCell: $('rngCell'), cellVal: $('cellVal'), chkSsaa: $('chkSsaa'), selBackground: $('selBackground'),
  chkTurntable: $('chkTurntable'), chkShadow: $('chkShadow'),
  btnGenerate: $('btnGenerate'), progressWrap: $('progressWrap'), progressBar: $('progressBar'), progressLabel: $('progressLabel'),
  viewport: $('viewport'), viewportWrap: $('viewportWrap'), viewBadge: $('viewBadge'),
  results: $('results'), sheetPreview: $('sheetPreview'), chkGrid: $('chkGrid'), sheetInfo: $('sheetInfo'),
  dlSheet: $('dlSheet'), dlJson: $('dlJson'), dlAseprite: $('dlAseprite'), jsonInfo: $('jsonInfo'),
  playerCanvas: $('playerCanvas'), playerDir: $('playerDir'), btnPlayerPlay: $('btnPlayerPlay'),
  rngFps: $('rngFps'), fpsVal: $('fpsVal'), rngZoom: $('rngZoom'), zoomVal: $('zoomVal'),
  btnGif: $('btnGif'), gifList: $('gifList'), status: $('status')
};

const state = {
  name: 'modelo',
  gltf: null,
  model: null,
  mixer: null,
  clips: [],
  clipIndex: -1,
  playing: false,
  clock: new THREE.Clock(),
  modelBox: new THREE.Box3(),
  modelRadius: 1,
  result: null,        // { layout, meta, aseprite, sheet, fps }
  player: { dir: 0, frame: 0, playing: true, last: 0 }
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
const renderer = new THREE.WebGLRenderer({ canvas: el.viewport, alpha: true, preserveDrawingBuffer: true, antialias: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

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

// Chão que só recebe sombra: com ShadowMaterial o fundo continua transparente.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35, color: 0x000000 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false;
scene.add(ground);

/** Ajusta luz de sombra + chão ao tamanho do modelo carregado. */
function fitRigToModel() {
  const r = Math.max(state.modelRadius, 1e-3);
  const span = r * 1.6;
  keyLight.shadow.camera.left = -span;
  keyLight.shadow.camera.right = span;
  keyLight.shadow.camera.top = span;
  keyLight.shadow.camera.bottom = -span;
  keyLight.shadow.camera.near = r * 0.05;
  keyLight.shadow.camera.far = r * 12;
  keyLight.shadow.camera.updateProjectionMatrix();
  ground.scale.set(r * 6, r * 6, 1);
  ground.position.set(
    (state.modelBox.min.x + state.modelBox.max.x) / 2,
    state.modelBox.min.y,
    (state.modelBox.min.z + state.modelBox.max.z) / 2
  );
}

/* ================================================================== *
 * 2. Viewport (preview)
 * ================================================================== */
function resizeViewport() {
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

let rafId = 0;
function tick() {
  rafId = requestAnimationFrame(tick);
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
  renderer.render(scene, previewCamera);
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
  state.gltf = null;
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

async function loadFromArrayBuffer(buffer, name) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
  clearModel();

  state.name = (name || 'modelo').replace(/\.(glb|gltf)$/i, '').replace(/[^\w.-]+/g, '_') || 'modelo';
  state.gltf = gltf;
  state.model = gltf.scene;
  state.clips = gltf.animations || [];
  scene.add(state.model);
  state.model.updateMatrixWorld(true);

  state.modelBox.setFromObject(state.model, true);
  state.modelRadius = state.modelBox.getSize(new THREE.Vector3()).length() / 2;
  state.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

  state.mixer = state.clips.length ? new THREE.AnimationMixer(state.model) : null;
  fitRigToModel();
  ground.visible = el.chkShadow.checked;
  framePreview();
  buildClipList();

  const tris = (() => { let n = 0; state.model.traverse((o) => { if (o.isMesh && o.geometry?.index) n += o.geometry.index.count / 3; }); return Math.round(n); })();
  el.modelInfo.textContent = `${state.name} · ${state.clips.length} clip(s) · ${tris} tris`;
  el.viewBadge.textContent = `${state.name} — ${state.clips.length} animação(ões)`;
  el.btnGenerate.disabled = false;
  setStatus(`"${state.name}" carregado${state.clips.length ? ` (${state.clips.map((c) => c.name).join(', ')})` : ' — sem animação'}`, 'ok');
  if (!state.playing) { state.playing = true; el.btnPlay.textContent = 'Pause'; }
}

async function loadFile(file) {
  try {
    setStatus(`lendo ${file.name}…`);
    const buffer = await file.arrayBuffer();
    await loadFromArrayBuffer(buffer, file.name);
  } catch (err) {
    console.error(err);
    setStatus(`falha ao carregar ${file.name}: ${err.message} — se for .gltf com arquivos externos, exporte como .glb`, 'err');
  }
}

async function loadSample() {
  try {
    setStatus('carregando samples/fox.glb…');
    const res = await fetch('./samples/fox.glb');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadFromArrayBuffer(await res.arrayBuffer(), 'fox.glb');
  } catch (err) {
    console.error(err);
    setStatus(`não consegui carregar o exemplo: ${err.message}`, 'err');
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
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

/* ================================================================== *
 * 5. Controles
 * ================================================================== */
el.btnOpen.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => { const f = el.fileInput.files?.[0]; if (f) loadFile(f); el.fileInput.value = ''; });
el.btnSample.addEventListener('click', loadSample);

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
el.rngElevation.addEventListener('input', () => { el.elevationVal.textContent = `${el.rngElevation.value}°`; framePreview(); });
el.rngFrames.addEventListener('input', () => { el.framesVal.textContent = el.rngFrames.value; });
el.rngCell.addEventListener('input', () => { el.cellVal.textContent = `${el.rngCell.value} px`; });
el.rngFps.addEventListener('input', () => { el.fpsVal.textContent = el.rngFps.value; });
el.rngZoom.addEventListener('input', () => { el.zoomVal.textContent = `${el.rngZoom.value}x`; drawPlayer(); });

resizeViewport();
tick();
setStatus('pronto — arraste um .glb, use "Abrir" ou carregue o exemplo (Fox)');
