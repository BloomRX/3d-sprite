# SpriteForge Web

App **estático** que transforma um modelo 3D em **spritesheet 8-direcional com
animação**, mais metadados prontos para Godot, Unity e Aseprite.

Roda 100% no navegador (WebGL2). **Sem backend, sem build, sem Blender, sem CDN** —
todas as bibliotecas estão vendidas dentro de `app/`, então funciona offline e dentro
de iframe sem rede.

## Como abrir

> **Não abra o `index.html` com duplo clique.** O app usa módulos ES + importmap, e o
> navegador **bloqueia módulos em `file://`** (CORS): a página abre, mas nenhum botão
> responde. Se isso acontecer, um aviso amarelo aparece no topo explicando.

**Windows** — duplo clique em **`SpriteForge.bat`** (raiz do repositório). Ele acha o
Python, escolhe uma porta livre a partir de 8080, sobe o servidor e abre o navegador.

**Linux / macOS** — `./SpriteForge.sh`

**Manual (qualquer SO):**

```bash
py -m http.server 8080 --directory spriteforge\app     # Windows
python3 spriteforge/serve.py                           # qualquer SO (porta livre + abre o browser)
python3 -m http.server 8080 --bind 0.0.0.0 --directory spriteforge/app
```

Depois acesse <http://localhost:8080/>. `serve.py` aceita `--porta`, `--host` e
`--sem-navegador`.

## Estrutura

```
SpriteForge.bat / SpriteForge.sh   launchers (raiz)
spriteforge/
  serve.py                  servidor local: porta livre, MIME certo, abre o navegador
  README.md                 este arquivo
  app/
    index.html              UI (importmap + <script type="module"> + aviso de file://)
    app.js                  camada DOM + WebGL
    core.js                 lógica pura: auto-fit, layout, metadados, GIF, formatos
    vendor/  three.module.js (r169), GLTFLoader, OBJLoader, FBXLoader, STLLoader,
             PLYLoader, gifenc.esm.js
    utils/   BufferGeometryUtils.js   (GLTFLoader importa ../utils/…)
    libs/    fflate.module.js         (FBXLoader importa ../libs/…)
    curves/  NURBSCurve.js, NURBSUtils.js  (FBXLoader importa ../curves/…)
    samples/ fox.glb                  exemplo com Survey / Walk / Run
```

## Formatos

| Extensão | Loader | Animação | Observações |
|---|---|---|---|
| `.glb` | GLTFLoader | ✅ | **recomendado** — tudo num arquivo só |
| `.gltf` | GLTFLoader | ✅ | arraste **junto** o `.bin` e as texturas; eles são embutidos como `data:` URI na hora |
| `.obj` | OBJLoader | ❌ | vira 1 frame por direção; `.mtl`/texturas externas não são lidas |
| `.fbx` | FBXLoader | ✅ | ASCII e binário; exige `libs/fflate` + `curves/NURBS*` (já vendidas) |
| `.stl` | STLLoader | ❌ | ASCII e binário; sem material, recebe um padrão |
| `.ply` | PLYLoader | ❌ | vertex colors são ligados automaticamente |

Extensão não suportada **não quebra nada**: o app recusa com uma mensagem dizendo o que
aceita. `.dae`, `.3ds`, `.usdz`, `.step` e `.blend` precisam ser exportados como `.glb`
(Blender: *File → Export → glTF 2.0*). glTF com compressão **Draco/Meshopt** ou texturas
**KTX2/Basis** também não é suportado — os decoders são WASM; desative a compressão na
exportação.

## Como usar

1. **Carregue um modelo**: arraste em qualquer lugar da página, use **Abrir**, ou
   **Carregar exemplo (Fox)**.
2. **Escolha o clip** (se houver) e confira no viewport com Play/scrub. Sem animação o
   app gera 1 frame por direção.
3. **Ajuste**: direções (4/8/16), frames, elevação, célula, SSAA 2x, fundo, turntable,
   sombra.
4. **Gerar spritesheet** → preview com grade, player e downloads.
5. **Gerar GIFs** → um GIF animado por direção.

| Controle | Faixa | Efeito |
|---|---|---|
| Direções | 4 / 8 / 16 | linhas da sheet; passo angular = `360/N` |
| Frames | 1–32 | colunas da sheet; amostras uniformes do clip |
| Elevação | −10° a 89° | ângulo da câmera acima do horizonte |
| Célula | 16–512 px | lado de cada sprite (a sheet é clampada em 8192 px) |
| SSAA 2x | on/off | renderiza em 2× e reduz no `drawImage` |
| Fundo | transparente / branco / escuro | fundo da sheet |
| Turntable | on/off | gira a **câmera** em vez do **modelo** |
| Sombra | on/off | plano com `ShadowMaterial` (aparece sobre fundo transparente) |
| Loop perfeito | on/off | descarta o último frame (idêntico ao primeiro) |

## O que sai

| Arquivo | Conteúdo |
|---|---|
| `<nome>_sheet.png` | a sheet. **Linhas = direções, colunas = frames.** |
| `<nome>_metadata.json` | schema completo, compatível com o CLI do Blender |
| `<nome>.aseprite.json` | sidecar Aseprite: `frames` em array + `meta.frameTags` |
| `<nome>_dirNN.gif` | um GIF animado por direção, com transparência |

Convenções (gravadas no JSON): `directions.layout = "row-per-direction"`,
`order = "0 = frente, sentido anti-horário"`, `animation_axis = "columns"`, chaves
`dirDD_FFF` (ex. `dir00_001`) e `animation.frames` com os tempos **em milissegundos**.

## Receitas de engine

### Godot 4 — `SpriteFrames` + `AtlasTexture`

```gdscript
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

func _ready() -> void:
    var sheet: Texture2D = load("res://fox_Walk_sheet.png")
    var meta: Dictionary = JSON.parse_string(
        FileAccess.get_file_as_string("res://fox_Walk_metadata.json"))
    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")

    for d in meta.directions.count:
        var tag := "dir%02d" % d
        frames.add_animation(tag)
        frames.set_animation_speed(tag, meta.animation.fps)
        frames.set_animation_loop(tag, meta.animation.loop)
        for f in meta.animation.count:
            var at := AtlasTexture.new()
            at.atlas = sheet
            at.region = Rect2(f * meta.cell.w, d * meta.cell.h, meta.cell.w, meta.cell.h)
            frames.add_frame(tag, at)

    sprite.sprite_frames = frames
    sprite.play("dir00")
```

### Unity — Sprite Editor (grid slice)

1. Arraste `<nome>_sheet.png` para `Assets/`.
2. **Texture Type = Sprite (2D and UI)**, **Sprite Mode = Multiple**, **Apply**.
3. **Sprite Editor → Slice → Grid By Cell Size**, `Pixel Size X/Y` = o `cell` do JSON
   (padrão 128), **Pivot: Center**, **Slice**.
4. As linhas 0…N−1 são as direções `dir00…dirNN`; o tempo corre nas colunas.
5. `duration` de cada frame é `1000/fps` ms. O PNG já sai com alpha.

### Aseprite

- **Automático**: renomeie o sidecar para `<nome>_sheet.json` (mesmo nome base do PNG) e
  deixe os dois na mesma pasta — abrir o PNG importa as tags junto.
- As `frameTags` (`dir00`, `dir01`, …) viram tags de animação: você toca uma direção
  inteira sem recortar nada.

## Limitações

- Sem MP4 no navegador e sem processamento em lote: para isso (e para `.dae`/`.3ds`/
  `.usdz`/`.step`), use o CLI do Blender — ver “Decisões”, ele não está neste repositório.
- Sheets acima de 8192 px por lado são clampadas (a célula é reduzida e o app avisa).
- GIF é limitado a 256 cores (limitação do formato); o PNG é a saída fiel.
- `.obj` não carrega `.mtl`/texturas externas — o modelo entra com material padrão.

## Decisões

1. **Launcher no repo.** O spec não previa, mas abrir por `file://` é a forma mais
   óbvia de usar e não funciona. `spriteforge/serve.py` + `SpriteForge.bat`/`.sh`
   resolvem, e o `index.html` mostra um aviso (script clássico, que roda mesmo sem os
   módulos) quando é aberto por `file://`.
2. **Formatos além do spec.** O spec colocava FBX/OBJ fora de escopo; a pedido do
   usuário entram **OBJ, FBX, STL e PLY** (loaders do three vendidos localmente). O que
   continua de fora precisa de conversão para `.glb`.
3. **`spriteforge.py` e `addon/` não existem neste repositório.** O prompt previa
   reaproveitar uma pasta de sessão anterior; o clone tinha só o `DevKit`. O
   `metadata.json` daqui usa o mesmo schema, então o encaixe continua possível.
4. **`app/core.js` além do `app.js` previsto.** Matemática sem DOM nem WebGL, o que
   permite exercitá-la em Node contra os arquivos reais.
5. **A conta do checklist não fecha, e o schema venceu.** “8 direções + 12 frames +
   célula 128 → 1024×1024” não bate com `grid = {cols: frames, rows: direções}`, que dá
   **1536×1024**. Ficou com o schema.
6. **Controle de *frames* adicionado à UI** (o spec fala em “N amostras” mas não dava
   onde escolher N).
7. **Turntable não é o mesmo referencial.** Girar o modelo desloca a geometria no mundo;
   girar a câmera não. Cada pose carrega `modelAzimuth` e `camAzimuth` e o auto-fit mede
   do jeito que o render desenha.
8. **Auto-fit em duas passadas**: primeiro o centro médio (alvo do `lookAt`), depois as
   extensões relativas a esse centro final — é o que impede o sprite de “pular”.
9. **Luzes escaladas pelo modelo.** Posição fixa `(4,8,6)` = distância 10,8, e o Fox tem
   raio ~88: a luz ficava *dentro* do modelo e a sombra não aparecia. `placeLightRig()`
   posiciona a 4× o raio e ajusta a câmera de sombra.
10. **Normais são garantidas.** O `fox.glb` do Khronos **não tem atributo `NORMAL`**;
    sem `computeVertexNormals` o atributo ausente vira `(0,0,0)` no shader e o modelo
    renderiza **preto**. `prepareLoaded()` calcula a normal quando ela falta **ou** está
    zerada (há exportador que grava zeros em vez de omitir).
11. **Dois `WebGLRenderer`** (viewport + sheet), reusando a **mesma cena**; ambos com
    `alpha`, `antialias` e `preserveDrawingBuffer`.
12. **`fps` é um slider só** (player, `metadata.json` e delay dos GIFs).
13. **Nomes de download**: `<nome>_sheet.png`, `<nome>_metadata.json`,
    `<nome>.aseprite.json`, `<nome>_dirNN.gif`, com `<nome> = <modelo>_<clip>`.

## Testes

O spec define o teste como o checklist de navegador:

- [ ] `fox.glb` + `Walk` + 8 direções + 12 frames + célula 128 → sheet **1536×1024**
      (Decisão 5) com transparência e sombra suave;
- [ ] o GIF da direção 0 loopa sem “pulo” e com fundo transparente;
- [ ] o player reproduz as 8 direções e o JSON bate com o layout visual;
- [ ] modelo sem animação gera 1 frame por direção sem erro;
- [ ] zero erros no console nos dois cenários.

A lógica pura (`core.js`) foi verificada à parte, em Node, contra os loaders e o
`three.module.js` **vendidos no repo** e contra o `fox.glb` real: carga de GLB, tempos de
frame, auto-fit nos dois modos (nenhum dos 96 frames estoura a célula), elevações de
−10° a 89°, rig de luz fora do modelo, layout e clamp de 8192 px, schema exato do
`metadata.json`, sidecar Aseprite, blocos do GIF (`GIF89a`, `NETSCAPE2.0`,
`transparentIndex=0`, delays), `disposeHierarchy`, OBJ/STL/PLY reais, importação do FBX
com `fflate`/`NURBS`, e o `.gltf` com `.bin` externo embutido como `data:` URI. O harness
não está no repo porque o spec exclui testes unitários formais; para reproduzir, crie
fora do repo um shim `node_modules/three` apontando para `app/vendor/three.module.js` e
importe `app/core.js` + `app/vendor/*Loader.js`.
