# SpriteForge Web

App **estático** que transforma um modelo 3D (`.glb`) em **spritesheet 8-direcional com
animação**, mais metadados prontos para Godot, Unity e Aseprite.

Roda 100% no navegador (WebGL2). **Sem backend, sem build, sem Blender, sem CDN** —
todas as bibliotecas estão vendidas em `app/vendor/`, então funciona offline e dentro
de iframe sem rede.

```
spriteforge/app/
  index.html                  UI (importmap + <script type="module">)
  app.js                      camada DOM + WebGL
  core.js                     lógica pura: auto-fit, layout, metadados, GIF
  vendor/three.module.js      three r169 (build module min)
  vendor/GLTFLoader.js        three r169 examples/jsm/loaders
  vendor/gifenc.esm.js        gifenc 1.0.3
  utils/BufferGeometryUtils.js  importado por GLTFLoader como ../utils/…
  samples/fox.glb             exemplo com animações Survey / Walk / Run
```

## Como servir

O app usa módulos ES, então precisa de HTTP (abrir o `index.html` com duplo clique
falha por CORS em `file://`).

```bash
# Linux / macOS
python3 -m http.server 8080 --bind 0.0.0.0 --directory spriteforge/app

# Windows (a partir da raiz do repositório)
py -m http.server 8080 --directory spriteforge\app
```

Depois abra <http://localhost:8080/>.

## Como usar

1. **Carregue um modelo**: arraste um `.glb` em qualquer lugar da página, use
   **Abrir .glb/.gltf**, ou clique em **Carregar exemplo (Fox)**.
2. **Escolha o clip** (dropdown de animação) e confira no viewport com Play/scrub.
   Modelo sem animação gera 1 frame por direção — funciona igual.
3. **Ajuste**: direções (4/8/16), frames, elevação da câmera, tamanho da célula,
   SSAA 2x, fundo, turntable e sombra.
4. **Gerar spritesheet** → a sheet aparece com preview (toggle de grade), player e
   downloads.
5. **Gerar GIFs** para um GIF animado por direção.

| Controle | Faixa | Efeito |
|---|---|---|
| Direções | 4 / 8 / 16 | linhas da sheet; passo angular = `360/N` |
| Frames | 1–32 | colunas da sheet; amostras uniformes do clip |
| Elevação | −10° a 89° | ângulo da câmera acima do horizonte |
| Célula | 16–512 px | lado de cada sprite (a sheet é clampada em 8192 px) |
| SSAA 2x | on/off | renderiza em 2× e reduz no `drawImage` (borda mais limpa) |
| Fundo | transparente / branco / escuro | fundo da sheet |
| Turntable | on/off | gira a **câmera** em vez do **modelo** |
| Sombra | on/off | plano de chão com `ShadowMaterial` (aparece sobre fundo transparente) |
| Loop perfeito | on/off | descarta o último frame (idêntico ao primeiro) |

## O que sai

| Arquivo | Conteúdo |
|---|---|
| `<nome>_sheet.png` | a sheet. **Linhas = direções, colunas = frames.** |
| `<nome>_metadata.json` | schema completo (ver abaixo), compatível com o CLI do Blender |
| `<nome>.aseprite.json` | sidecar Aseprite: `frames` em array + `meta.frameTags` (`dir00`, `dir01`, …) |
| `<nome>_dirNN.gif` | um GIF animado por direção, com transparência |

Convenções (também gravadas no JSON):

- `directions.layout = "row-per-direction"`, `order = "0 = frente, sentido anti-horário"`;
- `directions.animation_axis = "columns"` — o tempo corre na horizontal;
- chaves de frame `dirDD_FFF`, ex. `dir00_001` (direção 2 dígitos, frame 3 dígitos, 1-based);
- `animation.frames` são os tempos de cada frame **em milissegundos**.

## Receitas de engine

### Godot 4 — `SpriteFrames` + `AtlasTexture`

Coloque `<nome>_sheet.png` e `<nome>_metadata.json` em `res://` e:

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

Para trocar de direção no jogo, `sprite.play("dir%02d" % dir)`.

### Unity — Sprite Editor (grid slice)

1. Arraste `<nome>_sheet.png` para `Assets/`.
2. No Inspector: **Texture Type = Sprite (2D and UI)**, **Sprite Mode = Multiple**, **Apply**.
3. Abra **Sprite Editor → Slice → Type: Grid By Cell Size**, `Pixel Size X/Y` = o valor
   de `cell` do JSON (padrão 128), **Pivot: Center**, **Slice**.
4. A ordem vem linha a linha, então as linhas 0…N−1 são as direções `dir00…dirNN`.
5. Monte um `Animator`/`AnimatorOverrideController` por direção, ou crie
   `AnimationClip`s arrastando cada linha para a timeline (o `duration` do JSON é
   `1000/fps` ms por frame).

Como o PNG já sai com alpha, o material padrão `Sprites/Default` mostra a transparência.

### Aseprite

- **Automático**: renomeie o sidecar para `<nome>_sheet.json` (mesmo nome base do PNG) e
  deixe os dois na mesma pasta — `File → Open` no PNG importa as tags junto.
- **Manual**: `File → Import Sprite Sheet` → escolha o PNG; em *Type* use **Horizontal
  Strip** só se você recortar uma linha; para a sheet inteira o caminho é abrir o PNG e
  depois `Frame → New Frame`… — o mais simples é o pareamento automático acima.
- As `frameTags` (`dir00`, `dir01`, …) viram tags de animação: você reproduz uma direção
  com `Tag → Play` sem recortar nada.

## Limitações

- **Só glTF/GLB no navegador.** FBX/OBJ precisam ser convertidos para GLB antes
  (Blender: *File → Export → glTF 2.0*, ou `gltf-transform`/`FBX2glTF`).
- `.gltf` com recursos externos (`.bin`, texturas soltas) não carrega a partir de um
  arquivo arrastado — prefira `.glb` (tudo empacotado).
- **Sem MP4 no navegador** e sem processamento em lote: para FBX/OBJ, lote ou headless,
  use o CLI do Blender (ver “Decisões” — ele não está neste repositório).
- Sheets acima de 8192 px por lado são clampadas (a célula é reduzida e o app avisa).
- O GIF é limitado a 256 cores (limitação do formato); o PNG é a saída fiel.

## Decisões

Pontos em que o spec era ambíguo ou incompleto, e o que foi feito:

1. **`spriteforge.py` e `addon/` não existem neste repositório.** O prompt previa
   reaproveitar uma pasta `spriteforge/` de uma sessão anterior; o clone continha só o
   `DevKit`. Este app é independente e não depende do CLI. Se o CLI do Blender entrar no
   repo depois, o `metadata.json` daqui já usa o mesmo schema (mesmas chaves, mesmos
   nomes `dirDD_FFF`), e o caminho para FBX/OBJ/lote/headless + `--mp4` continua sendo ele.
2. **`app/core.js` além do `app.js` previsto.** Toda a matemática (auto-fit, layout,
   metadados, GIF) ficou num módulo sem DOM nem WebGL. Motivo: dá para exercitá-la em
   Node contra o `fox.glb` real, sem navegador. O `app.js` continua sendo o entry point.
3. **A conta do checklist não fecha, e o schema venceu.** O checklist fala em
   “8 direções + 12 frames + célula 128 → sheet 1024×1024”, mas `grid = {cols: frames,
   rows: direções}` dá **1536×1024**. 1024×1024 exigiria 8×8 células. Ficou com o schema
   (cols = frames, rows = direções), que é o que as engines e o `metadata.json` esperam.
4. **Controle de *frames* adicionado à UI.** A lista de controles do spec não tinha onde
   escolher o número de frames, mas o item 3 fala em “N amostras uniformes” e o checklist
   usa 12. Virou um slider 1–32 (padrão 12).
5. **Turntable não é o mesmo referencial.** Girar o modelo desloca a geometria no mundo
   (o pivô é a origem do modelo); girar a câmera não. Por isso o auto-fit **mede cada
   modo do jeito que o render desenha**: cada pose carrega `modelAzimuth` e `camAzimuth`,
   e a medição usa a câmera no azimute real daquela pose. Medir “genericamente” daria um
   enquadramento errado no turntable.
6. **Auto-fit em duas passadas.** Primeiro o centro médio das amostras (alvo do
   `lookAt`), depois as extensões medidas **relativas a esse centro final** — não ao
   centro de cada amostra. É isso que impede o sprite de “pular” entre frames.
7. **Dois `WebGLRenderer`.** O canvas do viewport não pode ser redimensionado para o
   tamanho da célula sem deformar o preview, então a sheet é renderizada num segundo
   contexto que reusa a **mesma cena** (mesmo rig de luz, mesmo chão). Ambos com
   `alpha`, `antialias` e `preserveDrawingBuffer: true`.
8. **`fps` é um slider só.** O mesmo valor alimenta o player, o `metadata.json`
   (`animation.fps` e `duration` de cada frame) e o delay dos GIFs.
9. **Nomes de download**: `<nome>_sheet.png` (= `metadata.image`),
   `<nome>_metadata.json`, `<nome>.aseprite.json`, `<nome>_dirNN.gif`, com
   `<nome> = <modelo>_<clip>`.
10. **Sombras em fundo branco/escuro continuam ligadas** pelo checkbox; o `ShadowMaterial`
    é preto com opacidade 0.35, então a sombra escurece qualquer fundo.

## Testes

O spec define o teste como o checklist de navegador:

- [ ] `fox.glb` + `Walk` + 8 direções + 12 frames + célula 128 → sheet **1536×1024**
      (ver Decisão 3) com transparência e sombra suave;
- [ ] o GIF da direção 0 loopa sem “pulo” e com fundo transparente;
- [ ] o player reproduz as 8 direções e o JSON bate com o layout visual;
- [ ] modelo sem animação gera 1 frame por direção sem erro;
- [ ] zero erros no console nos dois cenários.

A lógica pura (`core.js`) foi verificada à parte, em Node, contra o `fox.glb` real e as
libs vendidas: carga do GLB, tempos de frame, auto-fit nos dois modos (com verificação
independente de que **nenhum** dos 96 frames estoura a célula), elevações de −10° a 89°,
layout e clamp de 8192 px, schema exato do `metadata.json`, sidecar Aseprite, estrutura
de blocos do GIF (assinatura, `NETSCAPE2.0`, `transparentIndex=0`, delays) e o
`disposeHierarchy`. O harness não está no repo porque o spec exclui testes unitários
formais — para reproduzir: `npm i` num diretório fora do repo, crie um shim
`node_modules/three` apontando para `app/vendor/three.module.js` e importe
`app/core.js` + `app/vendor/GLTFLoader.js`.
