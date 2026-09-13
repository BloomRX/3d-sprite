# PROMPT DE IMPLEMENTAÇÃO — SpriteForge Web (app independente de sprites 3D)

Cole este prompt inteiro na nova sessão (a que está linkada no repo Git).

---

Você é um agent de engenharia nesta sessão com repositório Git linkado. Sua tarefa: **construir, testar e commitar** um app web ESTÁTICO e independente (sem Blender, sem backend, sem build) que transforma um modelo 3D em **spritesheet 8-direcional COM animação**, além de metadados prontos para engines.

## Ambiente-alvo do usuário
Windows 11 · Ryzen 5 5500 · RX 580 8GB · 16 GB RAM. O app roda no navegador via WebGL. Durante o desenvolvimento, sirva com `python3 -m http.server 8080 --bind 0.0.0.0 --directory app` para o live preview.

## Restrições duras do preview (não negocie)
- O preview roda em iframe sandbox SEM rede: **todas as libs devem ser vendidas localmente**, nenhum CDN.
- Estrutura de libs: `app/vendor/three.module.js` (three r169, build module min), `app/vendor/GLTFLoader.js` (examples/jsm/loaders), `app/utils/BufferGeometryUtils.js` (examples/jsm/utils — o GLTFLoader importa `../utils/BufferGeometryUtils.js` relativo a ele, por isso fica em `app/utils/`), `app/vendor/gifenc.esm.js`.
- `index.html` usa `<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>` e `<script type="module" src="./app.js">`. Só URLs relativas.
- Se o repo JÁ contiver a pasta `spriteforge/` de uma sessão anterior (CLI do Blender + vendor + `samples/fox.glb`), **reutilize** vendor/samples e NÃO re-baixe; construa o app em `spriteforge/app/`. Se não existir, baixe: three@0.169.0 (build/three.module.min.js, examples/jsm/loaders/GLTFLoader.js, examples/jsm/utils/BufferGeometryUtils.js) do unpkg, gifenc@1.0.3 (dist/gifenc.esm.js), e a amostra `fox.glb` de https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb (tem animações Walk/Run/Survey — use-a como exemplo e como teste).

## Estrutura final no repo
```
spriteforge/
  spriteforge.py              # CLI headless do Blender (se já existir, não quebrar)
  addon/spriteforge_addon/    # add-on Blender (se já existir, não mexer)
  app/
    index.html
    app.js
    vendor/{three.module.js,GLTFLoader.js,gifenc.esm.js}
    utils/BufferGeometryUtils.js
    samples/fox.glb
  README.md
```

## Funcionalidades (cada uma é um critério de aceite)
1. **Carregar modelo**: drag-and-drop em qualquer lugar da página + input de arquivo (.glb/.gltf) + botão "Carregar exemplo (Fox)". `GLTFLoader.parse(arrayBuffer)`.
2. **Viewport 3D**: `WebGLRenderer({alpha:true, preserveDrawingBuffer:true, antialias:true})`. Rig de luz fixo no mundo (key DirectionalLight com castShadow, fill e rim mais fracos, hemisférica baixa) + plano de chão com `ShadowMaterial({opacity:0.35})` receiveShadow para sombra aparecer sobre fundo transparente; checkbox de sombra liga/desliga o plano.
3. **Animação**: se `gltf.animations.length`, dropdown de clips + play/scrub no viewport. Frames gerados = N amostras uniformes de `clip.duration`; toggle "loop perfeito" descarta o último frame (idêntico ao primeiro). Modelo sem animação = 1 frame.
4. **Controles**: direções (4/8/16), elevação da câmera (-10°..89°), tamanho da célula (16..512 px), toggle SSAA 2x (renderiza 2x e reduz com drawImage), fundo (transparente/branco/escuro), toggle turntable (girar a CÂMERA; padrão = girar o MODELO com luz fixa).
5. **Auto-fit obrigatório**: amostrar ~6 frames × 4 direções; para cada canto do Box3 do modelo, transformar por `camera.matrixWorldInverse` e acumular max |x| e |y| (NUNCA use a translação da matrix_world como direção de view — extraia só a rotação). half = maxAbs/scaleFix (scaleFix=0.86); OrthographicCamera com left/right/top/bottom = ±half; lookAt no centro médio das amostras. Isso garante que a animação inteira caiba na célula sem "pular".
6. **Geração**: para cada direção d e frame f: `model.rotation.y = 2π·d/N` (ou azimute da câmera no turntable), `mixer.setTime(t)`, `renderer.render`, `drawImage` no canvas da sheet em (col·cell, row·cell), sendo row=direção e col=frame. Entre renders, `await new Promise(r=>setTimeout(r,0))` + barra de progresso. Limite: avisar e clampar se a sheet passar de 8192 px por lado.
7. **Resultados na página**: (a) preview da sheet com toggle de grade; (b) player: canvas com zoom 1–6x, seletor de direção, play/pause e fps ajustável; (c) downloads: `sheet.png`, `metadata.json`, e um GIF por direção (gifenc; transparência: após `quantize`, force `palette[0]=[255,0,255]`, marque índice 0 nos pixels com alpha<8 e passe `transparent:true, transparentIndex:0` em writeFrame).
8. **metadata.json** — schema EXATO (compatível com o CLI Blender do repo):
```json
{"tool":"SpriteForge Web 1.0","image":"<nome>_sheet.png","size":{"w":W,"h":H},
 "cell":{"w":C,"h":C},"grid":{"cols":CF,"rows":RD},
 "directions":{"count":N,"layout":"row-per-direction","angle_step_deg":360/N,
   "elevation_deg":E,"order":"0 = frente, sentido anti-horário","animation_axis":"columns"},
 "animation":{"frames":[...],"count":F,"fps":FPS,"loop":bool,"duration_ms":ms},
 "render":{"engine":"webgl","ssaa":bool,"turntable":bool,"background":"transparent"},
 "frames":{"dir00_001":{"frame":{"x":0,"y":0,"w":C,"h":C},"rotated":false,"trimmed":false,
   "spriteSourceSize":{"x":0,"y":0,"w":C,"h":C},"sourceSize":{"w":C,"h":C},"duration":ms}}}
```
   Mais sidecar `<nome>.aseprite.json` (array frames + meta.frameTags com uma tag `dirNN` por direção).
9. **Higiene de memória**: ao carregar novo modelo, traverse o antigo fazendo `geometry.dispose()`/`material.dispose()`/`texture.dispose()` (VRAM do usuário é 8 GB).
10. **README.md**: como servir, como usar, o que cada saída significa, receitas Godot 4 (SpriteFrames/AtlasTexture), Unity (Sprite Editor slice grid) e Aseprite (importar sheet + JSON), limitações (sem FBX/OBJ — converter para GLB; para FBX/OBJ/lote/headless usar `spriteforge.py` do Blender, que também exporta MP4 por direção com `--mp4`).

## Fora de escopo (não faça)
Import FBX/OBJ no browser; backend/conta/login; MP4 no browser; i18n; testes unitários formais (o teste é o checklist abaixo).

## Checklist de teste antes do commit final
- [ ] fox.glb + animação Walk + 8 direções + 12 frames + célula 128 → sheet 1024×1024 com transparência e sombra suave;
- [ ] GIF da direção 0 loopa sem "pulo" e com fundo transparente;
- [ ] player reproduz as 8 direções; JSON bate com o layout visual da sheet;
- [ ] modelo sem animação gera sheet de 1 frame por direção sem erro;
- [ ] zero erros no console do navegador nos dois cenários.

## Workflow Git exigido
Commits pequenos e semânticos, nesta ordem: `chore: vendor three/gltfloader/gifenc + sample fox`; `feat: loader, viewport e rig de luz`; `feat: gerador de sheet com auto-fit e SSAA`; `feat: exports png/json/gif + player`; `docs: README com receitas de engines`. Push ao final + tag `v1.0.0`. Se algo do spec for ambíguo, decida pelo espírito dele e registre a decisão no README ("Decisões").

## Resposta final dessa sessão
Tabela funcionalidade × status, lista de commits com hash, e os comandos exatos para o usuário rodar localmente no Windows.
