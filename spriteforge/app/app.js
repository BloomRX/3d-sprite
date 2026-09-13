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
  generating: false,
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
  keyLight.target.position.set(
    (state.modelBox.min.x + state.modelBox.max.x) / 2,
    (state.modelBox.min.y + state.modelBox.max.y) / 2,
    (state.modelBox.min.z + state.modelBox.max.z) / 2
  );
  keyLight.target.updateMatrixWorld();
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


/* ================================================================== *
 * 6. Geração da spritesheet (auto-fit + SSAA)
 * ================================================================== */

// Renderer dedicado à geração. O canvas do viewport não pode ser redimensionado
// para o tamanho da célula sem deformar o preview, então a sheet sai de um
// segundo contexto — que reutiliza a MESMA cena (mesmo rig de luz, mesmo chão).
// preserveDrawingBuffer é obrigatório para o drawImage() depois do render.
const sheetRenderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true, antialias: true });
sheetRenderer.setPixelRatio(1);
sheetRenderer.shadowMap.enabled = true;
sheetRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
sheetRenderer.toneMapping = THREE.NoToneMapping;

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));
const showProgress = (on) => el.progressWrap.classList.toggle('on', on);
const setProgress = (ratio, label) => {
  el.progressBar.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  el.progressLabel.textContent = label;
};

function applyBackground(mode) {
  if (mode === 'white') sheetRenderer.setClearColor(0xffffff, 1);
  else if (mode === 'dark') sheetRenderer.setClearColor(0x15181d, 1);
  else sheetRenderer.setClearColor(0x000000, 0);
}

async function generate() {
  if (!state.model) { setStatus('carregue um modelo antes de gerar', 'err'); return; }
  if (state.generating) return;

  const dirCount = Number(el.selDirections.value);
  const elevation = Number(el.rngElevation.value);
  const turntable = el.chkTurntable.checked;
  const ssaa = el.chkSsaa.checked;
  const background = el.selBackground.value;
  const fps = Number(el.rngFps.value) || core.DEFAULT_FPS;
  const clip = state.clips[state.clipIndex] || null;

  state.generating = true;
  el.btnGenerate.disabled = true;
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
    const poses = core.buildPoses({ directionCount: dirCount, frameCount: times.length, times, model: state.model, turntable });

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

    // 3. layout (linhas = direções, colunas = frames) + clamp de 8192 px
    const layout = core.computeLayout(dirCount, times.length, Number(el.rngCell.value));
    if (layout.warning) setStatus(layout.warning, 'err');

    // 4. canvas da sheet e renderer offscreen
    const sheet = document.createElement('canvas');
    sheet.width = layout.w;
    sheet.height = layout.h;
    const sctx = sheet.getContext('2d');
    const renderSize = layout.cell * (ssaa ? 2 : 1);
    sheetRenderer.setSize(renderSize, renderSize, false);
    applyBackground(background);
    ground.visible = el.chkShadow.checked;

    const camera = core.createOrthoCamera({ half: fit.half, center: fit.center, elevationDeg: elevation });
    const distance = camera.position.distanceTo(fit.center);

    // 5. render célula a célula (row = direção, col = frame)
    let done = 0;
    for (const pose of poses) {
      applyPose(pose);
      core.placeCamera(camera, fit.center, pose.camAzimuth, elevation, distance);
      sheetRenderer.render(scene, camera);
      // SSAA 2x: o drawImage reduz de 2× para 1× e já faz o downsample.
      sctx.drawImage(sheetRenderer.domElement, pose.frame * layout.cell, pose.dir * layout.cell, layout.cell, layout.cell);
      done++;
      setProgress(done / poses.length, `renderizando ${done}/${poses.length} — dir ${String(pose.dir).padStart(2, '0')}, frame ${pose.frame + 1}`);
      await yieldToBrowser();
    }

    // 6. metadados
    const meta = core.buildMetadata({
      baseName: `${state.name}_${clip ? clip.name : 'static'}`,
      layout, directionCount: dirCount, elevationDeg: elevation, times, fps,
      loop: el.chkLoopPerfect.checked, ssaa, turntable, background
    });
    const aseprite = core.buildAsepriteJson(meta);

    state.result = { layout, meta, aseprite, sheet, fps, fit, dirCount, turntable };
    state.player.dir = 0;
    state.player.frame = 0;
    el.results.classList.add('on');
    el.sheetInfo.textContent = `${layout.w}×${layout.h} px · ${layout.cols} frames × ${layout.rows} direções · célula ${layout.cell}px${ssaa ? ' · SSAA 2x' : ''} · half=${fit.half.toFixed(2)}`;
    el.jsonInfo.textContent = `${meta.image} · ${Object.keys(meta.frames).length} frames · ${fps} fps · elevação ${elevation}° · ${turntable ? 'turntable' : 'modelo girando'}`;
    drawSheetPreview();
    buildDirectionSelector();
    drawPlayer();
    el.gifList.innerHTML = '';
    setStatus(`sheet pronta: ${layout.w}×${layout.h} (${layout.cols}×${layout.rows} células de ${layout.cell}px)`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus(`falha na geração: ${err.message}`, 'err');
  } finally {
    state.model.rotation.y = prevRotation;
    if (state.mixer && clip) state.mixer.setTime(prevTime);
    state.model.updateMatrixWorld(true);
    renderer.setClearColor(0x000000, 0);
    state.generating = false;
    state.playing = wasPlaying;
    el.btnPlay.textContent = state.playing ? 'Pause' : 'Play';
    el.btnGenerate.disabled = false;
    showProgress(false);
  }
}

el.btnGenerate.addEventListener('click', generate);

/* ================================================================== *
 * 7. Alvos preenchidos no próximo commit (exports + player)
 * ================================================================== */
function drawSheetPreview() {}
function buildDirectionSelector() {}
function drawPlayer() {}

/* ================================================================== *
 * 8. Boot
 * ================================================================== */
resizeViewport();
tick();
setStatus('pronto — arraste um .glb, use "Abrir" ou carregue o exemplo (Fox)');
