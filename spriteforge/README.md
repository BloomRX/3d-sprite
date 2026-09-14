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
             PLYLoader, OrbitControls, gifenc.esm.js
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
   elevação, pivot, célula, sombra e luz de uma vez; depois é só afinar. **Padrão** é o
   botão de voltar ao começo — não existe mais um "Reset" separado, era exatamente a
   mesma coisa. As preferências ficam salvas no navegador (`localStorage`).
2. **Carregue um modelo**: arraste em qualquer lugar da página, use **Abrir**,
   **Exemplo (Fox)** (animado) ou **Exemplo estático** (OBJ, sem animação → 1 frame por
   direção).
3. **Escolha o clip** (se houver) e confira no viewport com Play/scrub. No viewport você
   pode **arrastar para girar**, usar a **roda do mouse para zoom** e o **botão direito para
   deslocar**; **⟲ Reenquadrar** volta ao enquadramento automático. Isso é só conferência —
   o que vai para a sheet é decidido pelos controles do painel.
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
| **Fundo do GIF** | transparente / **pontilhado** / branco / escuro | GIF tem alpha de **1 bit**. `transparente` recorta em 50 % (sem halo, sem sombra); `pontilhado` usa Bayer 4×4 e mantém a sombra como pontinho (35 % de alpha ≈ 37,5 % de pontos); com fundo a sombra é composta de verdade |
| **Camada de sombra separada** | on/off | segundo passe de render que gera `<nome>_shadow.png` na mesma grade, só com a sombra. **Com ela ligada o personagem sai sem sombra** — a sombra passa a existir só na camada |
| **GIF da sombra** | silhueta preta / pontilhada | um **GIF animado por direção** só da sombra, para usar como sprite à parte ao lado do personagem |

Todo slider tem um **campo numérico** do lado: dá para digitar `512` em vez de arrastar.
O valor é limitado à faixa do slider e dispara exatamente os mesmos efeitos.

## O que sai

| Arquivo | Conteúdo |
|---|---|
| `<nome>_sheet.png` | a sheet. **Linhas = direções, colunas = frames.** |
| `<nome>_metadata.json` | schema completo, compatível com o CLI do Blender |
| `<nome>.aseprite.json` | sidecar Aseprite: `frames` em array + `meta.frameTags` |
| `<nome>_dirNN.gif` | um GIF animado por direção, com transparência |
| **`<nome>_com_sombra.png`** | **personagem + sombra num sprite só**, com a sombra de verdade (alpha de 8 bits, 35 % de opacidade) e fundo transparente. É o que o GIF não consegue guardar |
| **`<nome>_shadow.png`** | **só a sombra**, na mesma grade da sheet (mesma célula, mesmas linhas/colunas). Botão próprio, em linha separada logo abaixo do `metadata.json` — e também vai dentro do `.zip` |
| **`<nome>_dirNN_shadow.gif`** | **GIF animado da sombra**, um por direção — o sprite à parte que você coloca junto do personagem. Sai no **Gerar GIFs** (grupo "GIFs da sombra") e na pasta `gif_sombra/` do `.zip` |
| **`<nome>_spriteforge.zip`** | tudo acima + `gif/` + `gif_sombra/` + um `LEIA-ME.txt` com as receitas de engine |

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

### A camada de sombra

`<nome>_shadow.png` tem **a mesma grade** da sheet: célula, linhas e colunas idênticas, e o
`metadata.json` aponta o arquivo em `shadow.file`. Na engine ela é um segundo sprite
desenhado **antes** do personagem, com o mesmo frame atual — e basta esconder o nó para a
sombra sumir:

```gdscript
# Godot 4 — dois AnimatedSprite2D com os mesmos SpriteFrames
sombra.play(&"andar")            # mesmo nome de animação
sombra.frame = personagem.frame
sombra.visible = mostrar_sombra  # é só isso que liga e desliga
```

Ela é renderizada num segundo passe com `material.colorWrite = false` no modelo: o modelo
continua projetando sombra, mas não escreve cor — então a imagem resultante tem apenas a
sombra no chão, em preto com alpha 0,35 sobre transparente. Por ser um segundo passe, a
geração leva ~2× o tempo; desmarque a opção se não quiser.

**Com a camada ligada, o passe do personagem esconde o chão.** Sem isso a sombra ficava
gravada nas duas folhas: o toggle do player só a escurecia em vez de desligar, e o sprite do
personagem continuava com a sombra cinza por baixo. As duas folhas são complementares —
personagem limpo + sombra isolada — e é por isso que dá para ligar e desligar a sombra em
jogo. Quer a sombra queimada no sprite? Desmarque a camada separada.

### Sprite único com sombra real

Quer um sprite só, com a sombra de verdade e fundo transparente? **`<nome>_com_sombra.png`** —
é o personagem com a sombra composta por baixo, em PNG, então os 35 % de opacidade ficam
exatamente como no preview. **Em GIF isso é impossível**: o formato guarda alpha de 1 bit
(por pixel é opaco ou transparente, não existe meio-termo), então lá a sombra só sai sólida
ou pontilhada.

São três entregas da mesma sombra, escolha uma:

| arquivo | o que é | quando usar |
|---|---|---|
| `_com_sombra.png` | personagem + sombra juntos, alpha real | o mais simples: um sprite só |
| `_shadow.png` | só a sombra, mesma grade | quer ligar/desligar a sombra no jogo |
| `gif_sombra/` | um GIF animado por direção | seu fluxo usa GIF, não spritesheet |

### A sombra como GIF (sprite à parte)

O **Gerar GIFs** produz dois grupos: os do personagem e os **da sombra** — o mesmo número de
arquivos, um por direção, animados e transparentes. No `.zip` eles ficam em `gif_sombra/`.
É isso que dá para colocar no motor como um segundo sprite junto do personagem:

```gdscript
# Godot 4 — dois AnimatedSprite2D, um por GIF
sombra.play(&"andar")
sombra.frame = personagem.frame
sombra.visible = mostrar_sombra     # ligar e desligar a sombra é só isso
```

O GIF da sombra sai em **silhueta preta** por padrão. GIF tem alpha de 1 bit, então os 35 % de
transparência não caberiam nele de qualquer jeito; preto sólido é o formato útil, porque a
transparência você escolhe no motor (`self_modulate = Color(1,1,1,0.35)` no Godot, cor com
alpha no Unity) e ainda pode mudar de cor, esmaecer no pulo, etc. A opção **pontilhada**
mantém a aparência de 35 % via Bayer 4×4, mas aí a transparência fica queimada na imagem.

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
- A órbita do viewport (arrastar/zoom) é só para conferir o modelo: a sheet usa a câmera
  ortográfica decidida pelos controles, então girar ali não muda a saída.

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
22. **Órbita no viewport só, nunca na sheet.** O `OrbitControls` (item D3 do spec, o último
    que faltava) é ligado à `previewCamera`, enquanto a geração cria a sua própria câmera
    ortográfica a cada pose — girar o modelo com o mouse não tem como vazar para a sheet.
    `framePreview()` seta a posição da câmera diretamente e chama `controls.update()`, que
    recalcula a esférica a partir dela; é por isso que os sliders de elevação continuam
    valendo depois de você orbitar. O módulo veio do tarball oficial do three 0.169.0 e um
    teste garante que ele casa com a build vendida (carrega, instancia, `update()` respeita
    posição externa, `dispose()` não explode).
23. **Sprite único com sombra real existe — em PNG.** A pergunta era se dava para ter
    "sprite + sombra real com fundo transparente" em vez de só preto/branco. Em **GIF não
    dá**: o formato guarda alpha de 1 bit, então 35 % de opacidade não é representável — não
    é limitação nossa. Em PNG dá, e é o `<nome>_com_sombra.png`: as duas folhas compostas,
    com o alpha de verdade. O `LEIA-ME.txt` do `.zip` agora lista as três entregas da sombra
    e quando usar cada uma.
24. **Um botão a menos.** "Reset (voltar ao padrão do site)" e o preset **Padrão** executavam
    as mesmas três chamadas (`applySettings(default)` + `markPreset('default')` +
    `saveSettings('default')`); só o texto do status mudava. O Reset existia de antes de haver
    o botão **Padrão** — saiu o duplicado, ficou o preset.
25. **`validate --full` não pode chamar `python3`.** No Windows `python3` não existe: é o
    alias da Microsoft Store, que responde "Python was not found" e derrubava o comando
    inteiro. `normalize_interpreter()` traduz `python3`/`python`/`py` para o
    `sys.executable` de quem está rodando o script, e o `devkit.json` continua legível.
26. **A sombra existe numa folha só.** Com a camada separada ligada, o passe do personagem
    renderiza com o chão escondido. Antes ele saía nas duas folhas, e o efeito era exatamente
    o relatado: o toggle "sombra" do player só a escurecia (tirava uma cópia, ficava a outra)
    e o sprite do personagem mantinha a sombra cinza. Como as folhas passaram a ser
    complementares, o GIF do personagem **recompõe** a sombra por baixo quando o fundo pede —
    assim as quatro opções de fundo continuam significando o que dizem, com ou sem camada.
27. **O índice 0 da paleta não pode roubar uma cor.** O `encodeGif` fazia
    `palette[0] = [255,0,255]` para marcar a cor transparente — e isso **sobrescreve** a cor
    que estivesse ali. Num quadro só de sombra a paleta tem UMA cor (o preto), então o preto
    era apagado e a sombra inteira virava transparente: o GIF saía byte a byte igual ao de um
    quadro vazio. `reservarTransparente()` agora procura o magenta na paleta e o troca para o
    índice 0, ou acrescenta uma cor se ele não existir — nunca apaga. O teste é decisivo: a
    silhueta da sombra codifica **igual** a um quadro preto 100 % opaco.
28. **A sombra como GIF, não só como folha.** O pedido era um sprite de sombra para usar em
    jogo, e folha PNG não é o que se põe num `AnimatedSprite2D`. `buildGifs` passou a aceitar
    qualquer folha na mesma grade, então a da sombra vira um GIF animado por direção
    (`gif_sombra/` no `.zip`). Ele é sempre transparente — um sprite de sombra com fundo
    sólido não serve — e sai em silhueta preta por padrão, que é a forma que o motor consegue
    modular; a opção pontilhada existe para quem prefere a aparência de 35 %.
29. **Sombra em camada separada.** O pedido era ter controle da sombra em jogo, e a
    resposta óbvia — exportar a sheet com e sem sombra — não dá controle nenhum. Sai uma
    terceira imagem, `<nome>_shadow.png`, na mesma grade, obtida num segundo passe com
    `colorWrite = false` nos materiais do modelo (ele continua no passe de sombras, só não
    escreve cor). `metadata.json` ganha `shadow: { file, layout, note }` — `null` quando a
    opção está desligada, para não inventar arquivo. O player tem um checkbox que desenha a
    camada por baixo, então dá para ver o resultado antes de baixar.
30. **Sombra pontilhada no GIF.** Depois do corte em 128 o GIF transparente ficou sem
    sombra nenhuma — correto, mas inútil para conferir o resultado. Como GIF não tem alpha
    parcial, a alternativa honesta é o *dithering*: `alphaMask()` com uma matriz de Bayer
    4×4 decide pixel a pixel, e 35 % de alpha vira 37,5 % de pontos opacos (6 de 16, o mais
    perto que a grade chega). Vazio e opaco continuam exatos; só a faixa parcial é
    pontilhada. É o padrão do seletor de fundo do GIF.
31. **GIF: alpha de 1 bit, resolvido com recorte em 50 % ou com fundo.** O corte de alpha
    era 8, então todo pixel semitransparente sobrevivia como opaco: a sombra do chão
    (`ShadowMaterial` a 0,35 = alpha ~89) saía **preta sólida** e a serrilha da borda saía
    com a cor do modelo, formando um halo. Não era a luz — era o formato. Agora o limiar é
    128 (o padrão de 1 bit) e há um seletor de fundo: com fundo, a sombra é composta antes
    de quantizar e o GIF bate com o preview; sem fundo, ela é removida em vez de virar
    mancha. `alphaMask()` existe separado do `encodeGif` justamente para isso ser testável
    sem decodificar GIF.
32. **O campo digitado manda, e pode passar do teto do slider.** Pediram para poder digitar
    1024 numa célula cujo slider vai até 512. O teto não estava só no HTML: `generate()` lê
    `el.rngCell.value` (o **slider**) em ~20 pontos, então soltar o `max` do campo sozinho não
    mudaria nada — o valor digitado continuaria virando 512. A solução foi o campo **ampliar o
    teto do slider** ao receber um valor acima dele (`max = valor`, `step = any` para o slider
    não arredondar) e devolvê-lo ao normal quando o slider é arrastado. Ângulos — elevação,
    azimute e azimute da luz — continuam clampados nas duas pontas: 200° não significa nada. O
    mínimo continua valendo (célula 7 vira 16). `setPair()` faz o mesmo para presets e
    `applySettings`, senão um preset salvo com 1024 era podado ao carregar. Célula grande não
    quebra nada: `computeLayout` já reduz a célula para caber em 8192 px e avisa na barra de
    status (1024 com 8×12 → 682 px).
33. **A barra de rolagem não sobrepõe os campos.** O `aside` rolava com `overflow-y:auto` e a
    barra do Windows caía em cima das caixinhas de número. Agora ele reserva o vão de uma vez
    (`scrollbar-gutter:stable`), usa barra fina e os campos têm largura fixa de 66 px.
34. **Sliders com campo numérico.** Os dez controles de valor aceitam texto digitado, com
    clamp na faixa do slider e disparando os mesmos handlers — não há um segundo caminho
    de efeito colateral para divergir.
35. **Uma segunda amostra sem animação** (`samples/crate.obj`, um caixote 1×1×1 apoiado
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
node tests\spriteforge\test-app-sync.mjs
```

`test-app-sync.mjs` (**29 asserções**) cobre a outra ponta — os campos digitados. Como não há
como abrir um navegador aqui, ele executa o **bloco real** do `app.js`, extraído do arquivo
pelo texto, contra um DOM mínimo que imita o `<input type=range>` do navegador (clamp + encaixe
no passo). Confirma que digitar 1024 na célula chega até o slider — que é o que `generate()`
lê —, que ângulos continuam limitados, que o mínimo continua valendo e que digitar não é
sobrescrito no meio do número, e que cada modo de GIF sai com o corte de alpha certo. Entra
no `validate --full`; **não** está no CI, porque o workflow só chama o núcleo.

**214 asserções** no núcleo, sem `npm install`: o `three` importado é o arquivo vendido em
`spriteforge/app/vendor/`, e o `fox.glb`/`crate.obj` usados são os do repo. Cobre
azimutes e offset de frente, tempos de frame e loop perfeito, amostragem do auto-fit,
**nenhum dos 96 frames do Fox estourando a célula** nos dois modos, elevações de −10° a
89°, bounds assinados e os três pivots (inclusive a estabilidade do pivot em qualquer
azimute), layout com padding e o clamp de 8192 px, o schema do `metadata.json` e o
sidecar Aseprite, os blocos do GIF (`GIF89a`, um `NETSCAPE2.0`, `transparentIndex=0`,
delays em centésimos), o recorte de alpha de 1 bit (a sombra a 35 % some em vez de virar
preto sólido), o pontilhado de Bayer (35 % de alpha → 96 de 256 pontos, com vazio e opaco
intactos), o GIF com fundo sem nenhum quadro transparente e o bloco `shadow` do metadata, rig de luz,
`disposeHierarchy` com geometria compartilhada, os quatro presets, a escala travada e a
amostra estática.

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
