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
    samples/ fox.glb                  exemplo animado (Survey / Walk / Run)
             crate.obj                exemplo estático (OBJ, sem animação)
tests/spriteforge/              testes do core.js (rodam em Node puro)
.github/workflows/ci.yml        CI: validate + ESLint + os três conjuntos de teste
devkit.json                     full_tests do DevKit.bat
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

A página tem **duas abas**: **3D** (viewport + painel) e **Sheet + Player** (resultado).
A barra de progresso fica na barra de abas, então dá para acompanhar a geração sem perder
o resultado de vista.

1. **Escolha uma predefinição** (opcional, mas é o caminho mais rápido):
   **Padrão**, **Personagem 2D**, **Isométrico** ou **Itens / props**. Cada uma ajusta
   elevação, pivot, célula, sombra e luz de uma vez; depois é só afinar. **Reset** volta
   ao padrão do site. As preferências ficam salvas no navegador (`localStorage`).
2. **Carregue um modelo**: arraste em qualquer lugar da página, use **Abrir**,
   **Exemplo (Fox)** (animado) ou **Exemplo estático** (OBJ, sem animação → 1 frame por
   direção).
3. **Escolha o clip** (se houver) e confira no viewport com Play/scrub.
4. **Ajuste** o que a predefinição não cobriu.
5. **Gerar spritesheet** → aba Sheet + Player com preview, grade, player e downloads.
   **Cancelar** interrompe no meio (a sheet anterior continua válida).
6. **Gerar GIFs** ou **Baixar tudo (.zip)**.

Se algo não renderizar, o botão **Diagnóstico** diz o que a GPU informou (versão do
WebGL, `UNMASKED_RENDERER`, `maxTextureSize`, `maxSamples`, RAM) e **copiar diagnóstico**
cola tudo para colar num relato de bug.

| Controle | Faixa | Efeito |
|---|---|---|
| Direções | 4 / 8 / 16 | linhas da sheet; passo angular = `360/N` |
| Frames | 1–32 | colunas da sheet; amostras uniformes do clip |
| Elevação | −10° a 89° | ângulo da câmera acima do horizonte |
| **Frente em** | 0–359° | gira a convenção de “frente”: muitos modelos olham para +X ou −Z, e sem isso a direção 0 sai de lado |
| **Pivot** | centro / base / topo | onde a âncora cai na célula; vai para o `metadata.json` e para o Aseprite |
| Célula | 16–512 px | lado de cada sprite (a sheet é clampada em 8192 px) |
| **Padding** | 0–8 px | vão entre as células (contra *bleeding* em atlas mipmapeado) |
| SSAA 2x | on/off | renderiza em 2× e reduz no `drawImage`. **Desliga sozinho** se `célula×2` passar do `maxTextureSize` da GPU |
| **Escala travada** | 0,05–64 px/un | modelos diferentes saem do mesmo tamanho. Ao ligar, o valor se **calibra no modelo atual**; se ainda assim não couber, o app usa o mínimo que cabe e avisa — **nunca corta** |
| Fundo | transparente / branco / escuro | fundo da sheet |
| Turntable | on/off | gira a **câmera** em vez do **modelo** |
| Sombra | on/off | plano com `ShadowMaterial` (aparece sobre fundo transparente) |
| **Luz (azim./int.)** | 0–359° / 0–5.0 | gira e dosa a luz principal |
| **Luz presa à câmera** | on/off | a luz gira junto com o que se move em relação a você: sombreamento idêntico em todas as direções (visual “flat”, bom para ícone/prop) |
| Loop perfeito | on/off | descarta o último frame (idêntico ao primeiro) |
| **Zoom (player)** | 1–6× | lupa **dentro** da caixa fixa de 256 px: não muda o layout |
| **Escala do GIF** | 100 / 50 / 25 % | reduz antes de quantizar (GIF tem 256 cores por quadro) |

## O que sai

| Arquivo | Conteúdo |
|---|---|
| `<nome>_sheet.png` | a sheet. **Linhas = direções, colunas = frames.** |
| `<nome>_metadata.json` | schema completo, compatível com o CLI do Blender |
| `<nome>.aseprite.json` | sidecar Aseprite: `frames` em array + `meta.frameTags` |
| `<nome>_dirNN.gif` | um GIF animado por direção, com transparência |
| **`<nome>_spriteforge.zip`** | tudo acima + `gif/` + um `LEIA-ME.txt` com as receitas de engine |

Convenções (gravadas no JSON): `directions.layout = "row-per-direction"`,
`order = "0 = frente, sentido anti-horário"`, `animation_axis = "columns"`, chaves
`dirDD_FFF` (ex. `dir00_001`) e `animation.frames` com os tempos **em milissegundos**.

Chaves **adicionadas** ao schema (aditivas: quem não conhece, ignora):
`pivot: {x, y}` (normalizado dentro da célula, `y` medido do topo),
`cell.padding`, `directions.angle_offset_deg` e `scale: {locked, px_per_unit}`.
No Aseprite o pivot vira um `slice` chamado `pivot`, então o anchor abre no lugar certo.

Em **Godot**, o `offset` do `Sprite2D`/`AnimatedSprite2D` que corresponde a esse pivot é
`(0.5 - pivot.x, 0.5 - pivot.y) * tamanho da célula`; em **Unity**, o pivot em pixels é
`(pivot.x * cell.w, (1 - pivot.y) * cell.h)`.

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
14. **Abas em vez de empilhar 3D e resultado.** O usuário reportou layout “truncado”: as
    duas áreas disputavam a mesma altura. Cada uma passou a ter a página inteira, e a
    barra de progresso mora na barra de abas.
15. **O zoom do player é uma lupa, não um redimensionamento.** O canvas tem tamanho fixo
    (256 px) e o zoom muda o **recorte** da célula (`cell/zoom`). Antes o canvas crescia
    com o zoom e empurrava o layout inteiro — o bug relatado.
16. **Pivot desloca o frustum, não o alvo.** `left = cx − half`, `top = cy + half`. As
    duas formas foram medidas lado a lado no Fox e dão o mesmo número; a diferença é que
    deslocar o alvo exigiria recalculá-lo a cada pose (o eixo “cima” da câmera muda com o
    azimute), e no laço de render o pivot é aplicado uma única vez.
17. **Pivot “base” não corta o modelo para ancorar.** O `half` continua sendo o do
    enquadramento centrado; só o alvo desliza, e só até onde houver folga. Numa célula
    quadrada, quando é a **altura** que limita o `half` (caso do Fox e do caixote),
    `base` coincide com `centro` — não há para onde descer sem cortar o topo. A
    diferença aparece em modelos mais largos que altos.
18. **Escala travada se calibra e nunca corta.** Com `px/unidade` o `half` deixa de vir
    da medição (`célula / (2 × px/un)`) — e aí está a armadilha: é um valor **absoluto**,
    e o tamanho dos modelos varia muito. O preset isométrico nascia com a trava ligada em
    8 px/un, o que só serve para modelos de ~16 unidades; sobre o Fox (79 unidades) a
    janela da câmera cobria **7 %** do personagem, e o pior vértice caía em NDC 12,2 —
    1220 % além da borda. Agora: (a) nenhum preset liga a trava; (b) ao ligar, o valor é
    calculado do modelo carregado (`pxPerUnitToFit`); (c) se o valor pedido não couber, o
    app usa o mínimo que cabe e diz qual é, em vez de entregar um sprite decepado. O
    slider foi de `1–64` para `0,05–64` porque o Fox precisa de **0,564 px/un** — o
    intervalo antigo nem expressava um valor correto. Vale notar que a distância da
    câmera não tem nada com isso: numa orthographic quem define o tamanho projetado é só
    o `half` do frustum.
19. **SSAA é limitado pela GPU.** `célula × 2` acima de `maxTextureSize` desliga o SSAA e
    avisa — acima disso o render falha em silêncio ou derruba o contexto.
20. **`WebGLRenderer` protegido nos dois lugares**, com `webglcontextlost` e um painel de
    diagnóstico. Era o único ponto em que a página morria sem dizer por quê (driver
    antigo, VM sem aceleração, VRAM esgotada).
21. **Os testes entraram no repo.** O spec excluía testes unitários formais, mas o
    harness era a única garantia real de que o auto-fit e os schemas continuavam certos a
    cada mudança. Ele não pede `npm install`: um hook de resolução do Node faz o
    especificador `three` apontar para o arquivo **vendido**, então o teste exercita a
    mesma biblioteca que roda no navegador.
22. **Uma segunda amostra sem animação** (`samples/crate.obj`, um caixote 1×1×1 apoiado
    em `y=0`) para exercitar o caminho de 1 frame por direção sem depender de o usuário
    ter um arquivo estático à mão.

## Testes

O spec define o teste como o checklist de navegador:

- [ ] `fox.glb` + `Walk` + 8 direções + 12 frames + célula 128 → sheet **1536×1024**
      (Decisão 5) com transparência e sombra suave;
- [ ] o GIF da direção 0 loopa sem “pulo” e com fundo transparente;
- [ ] o player reproduz as 8 direções e o JSON bate com o layout visual;
- [ ] modelo sem animação gera 1 frame por direção sem erro;
- [ ] zero erros no console nos dois cenários.

### O que roda sozinho (sem navegador)

```bat
python3 tools/project_cli.py validate --full
```

ou, direto:

```bat
node --import ./tests/spriteforge/register-three.mjs tests/spriteforge/test-core.mjs
```

**156 asserções**, sem `npm install`: o `three` importado é o arquivo vendido em
`spriteforge/app/vendor/`, e o `fox.glb`/`crate.obj` usados são os do repo. Cobre
azimutes e offset de frente, tempos de frame e loop perfeito, amostragem do auto-fit,
**nenhum dos 96 frames do Fox estourando a célula** nos dois modos, elevações de −10° a
89°, bounds assinados e os três pivots (inclusive a estabilidade do pivot em qualquer
azimute), layout com padding e o clamp de 8192 px, o schema do `metadata.json` e o
sidecar Aseprite, os blocos do GIF (`GIF89a`, um `NETSCAPE2.0`, `transparentIndex=0`,
delays em centésimos), rig de luz, `disposeHierarchy` com geometria compartilhada, os
quatro presets e a amostra estática.

Lint (o CI roda exatamente isto):

```bat
npm install --no-save eslint@9 globals@15
npx eslint --no-config-lookup -c tests/spriteforge/eslint.config.mjs spriteforge/app/app.js spriteforge/app/core.js
```

### CI

`.github/workflows/ci.yml` roda em todo push e PR: `validate`, ESLint e os três conjuntos
de teste (`tools/test_project_cli.py`, `tools/test_creation.py` e `test-core.mjs`).

O arquivo entrou pelo commit `25a9445`, feito na máquina do mantenedor: o token de GitHub
App usado para escrever aqui não tem a permissão `workflows`, e o GitHub recusa o push de
qualquer arquivo em `.github/workflows/` (`refusing to allow a GitHub App to create or
update workflow`). Enquanto o workflow morou em `tools/ci.yml` ele era só conteúdo;
ativado, é o que garante que uma mudança em `core.js` não quebre o auto-fit nem os
schemas sem ninguém perceber.

Cada passo é *fail-fast* — `test-core.mjs` termina com `process.exit(fail === 0 ? 0 : 1)`,
os testes do DevKit usam `unittest.main()` e o `validate` propaga o código de `main()` —,
então um passo verde significa checagem aprovada, não passo vazio.

### O que **não** foi verificado

Tudo que exige GPU de verdade. Este ambiente não tem navegador: a renderização em si, a
aparência da sombra, a transparência do GIF num visualizador e o clique nos botões nunca
foram executados. O checklist acima continua pendente e é o que falta conferir na sua
máquina.
