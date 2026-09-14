/**
 * SpriteForge Web — i18n.js
 *
 * Tradução POR CONTEÚDO: o dicionário mapeia o texto em português para o inglês e
 * o DOM é varrido trocando o que casar. Numerar 140 chaves `data-i18n` à mão seria
 * mais frágil — texto novo entraria sem tradução e ninguém notaria. Aqui, o que não
 * está no dicionário simplesmente continua em português, e `t()` (usado nas
 * mensagens dinâmicas) devolve o original quando não há tradução.
 *
 * O português é a língua fonte: ele mora no HTML e no app.js, e este arquivo só
 * precisa da outra direção.
 */

export const IDIOMAS = [
  { id: 'pt-BR', rotulo: 'Português (BR)' },
  { id: 'en', rotulo: 'English' }
];

/** Normaliza para comparar: quebras de linha e indentação do HTML não importam. */
export function norm(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

const EN = {
  /* ---- aviso de file:// ---- */
  'Aberto por': 'Opened via',
  '— o app não funciona assim.': '— the app does not work that way.',
  'O navegador bloqueia módulos ES em': 'The browser blocks ES modules over',
  ', então nada desta página responde. Rode o servidor local e use': ', so nothing on this page responds. Run the local server and use',
  'Windows: duplo clique em': 'Windows: double-click',
  '(na raiz do repositório). Linux/macOS:': '(at the repository root). Linux/macOS:',
  '. Manual:': '. Manual:',

  /* ---- cabeçalho / viewport ---- */
  'nenhum modelo carregado — .glb .gltf .obj .fbx .stl .ply': 'no model loaded — .glb .gltf .obj .fbx .stl .ply',
  'Viewport 3D': '3D Viewport',
  'arraste um modelo aqui': 'drop a model here',
  'Solte o modelo (.glb, .gltf, .obj, .fbx, .stl, .ply)': 'Drop the model (.glb, .gltf, .obj, .fbx, .stl, .ply)',
  '.gltf com .bin/texturas: arraste todos juntos': '.gltf with .bin/textures: drop them all together',
  'arraste = girar · roda = zoom · botão direito = deslocar': 'drag = orbit · wheel = zoom · right button = pan',
  '⟲ Reenquadrar': '⟲ Reframe',

  /* ---- presets ---- */
  'Predefinições': 'Presets',
  'Padrão': 'Default',
  'Personagem 2D': '2D Character',
  'Isométrico': 'Isometric',
  'Itens / props': 'Items / props',

  /* ---- modelo e animação ---- */
  'Abrir modelo': 'Open model',
  'Exemplo (Fox)': 'Sample (Fox)',
  'Exemplo estático': 'Static sample',
  'Animação': 'Animation',
  '— sem animação —': '— no animation —',

  /* ---- câmera e enquadramento ---- */
  'Câmera e enquadramento': 'Camera and framing',
  'Direções': 'Directions',
  'Elevação': 'Elevation',
  'Frente em': 'Front at',
  'centro': 'center',
  'base (pés)': 'base (feet)',
  'topo': 'top',
  'personalizado…': 'custom…',
  'fora de 0.07–0.93 o modelo seria cortado, então o valor é preso nessa faixa':
    'outside 0.07–0.93 the model would be cropped, so the value is clamped to that range',
  'Célula': 'Cell',
  'SSAA 2x (renderiza 2x e reduz)': 'SSAA 2x (renders 2x, then downscales)',
  'Escala travada (px por unidade)': 'Locked scale (px per unit)',
  'Trava absoluta: o mesmo modelo sai do mesmo tamanho em qualquer projeto. Ao ligar, o valor é calibrado no modelo atual para não cortar nada.':
    'Absolute lock: the same model always renders at the same size in any project. When you turn it on, the value is calibrated on the current model so nothing gets cropped.',
  'Turntable (girar a câmera)': 'Turntable (rotate the camera)',
  'Fundo': 'Background',
  'transparente': 'transparent',
  'branco': 'white',
  'escuro': 'dark',
  'Sombra no chão': 'Ground shadow',

  /* ---- luz ---- */
  'Luz e fundo': 'Light and background',
  'Luz presa à câmera (flat)': 'Light attached to the camera (flat)',
  'Luz (azim.)': 'Light (azim.)',
  'Luz (int.)': 'Light (int.)',

  /* ---- gerar ---- */
  'Gerar': 'Generate',
  'Camada de sombra separada': 'Separate shadow layer',
  'Segunda sheet, mesma grade, só com a sombra — para você ligar e desligar no jogo.':
    'A second sheet, same grid, shadow only — so you can toggle it in game.',
  'Gerar spritesheet': 'Generate spritesheet',
  'Cancelar': 'Cancel',
  'linhas = direções · colunas = frames': 'rows = directions · columns = frames',

  /* ---- diagnóstico ---- */
  'Diagnóstico': 'Diagnostics',
  'Cole isto aqui se algo falhar: ele diz o que a GPU suporta e qual foi o último erro.':
    'Paste this if something fails: it reports what the GPU supports and the last error.',
  'copiar': 'copy',
  'fechar': 'close',

  /* ---- downloads ---- */
  'Baixar tudo (.zip)': 'Download all (.zip)',
  '⬛ shadow.png — só a sombra, separada': '⬛ shadow.png — shadow only, separate',
  '🎭 sheet+sombra.png — sprite único, sombra real': '🎭 sheet+shadow.png — single sprite, real shadow',
  'Personagem e sombra num arquivo só, com a sombra de verdade a 35 % de opacidade — é o que o GIF não consegue guardar (o alpha dele é de 1 bit). A sombra acima e o botão abaixo são as mesmas sombras, separadas.':
    'Character and shadow in one file, with the real shadow at 35% opacity — the thing a GIF cannot store (its alpha is 1 bit). The shadow above and the button below are the same shadows, separated.',
  'mesma grade da sheet: na engine, desenhe antes do sprite e esconda esse nó para tirar a sombra. Também vai dentro do .zip.':
    'same grid as the sheet: in the engine, draw it before the sprite and hide that node to remove the shadow. Also included in the .zip.',

  /* ---- player e sheet ---- */
  'direção': 'direction',
  'sombra': 'shadow',
  'zoom = lupa dentro da caixa fixa (não muda o layout)':
    'zoom = a loupe inside the fixed box (it does not change the layout)',
  'grade': 'grid',
  'alvo do pivot': 'pivot target',
  'gere uma sheet para ver aqui': 'generate a sheet to see it here',

  /* ---- GIFs ---- */
  'GIF por direção': 'GIF per direction',
  'escala': 'scale',
  'GIF da sombra': 'Shadow GIF',
  'silhueta preta (transparência você põe no motor)': 'black silhouette (set the transparency in the engine)',
  'pontilhada a 35%': 'dithered at 35%',
  'transparente (sem sombra)': 'transparent (no shadow)',
  'transparente + sombra pontilhada': 'transparent + dithered shadow',
  'fundo branco (sombra real)': 'white background (real shadow)',
  'fundo escuro (sombra real)': 'dark background (real shadow)',
  'GIF tem alpha de 1 bit: a sombra do personagem ou é composta num fundo, ou sai pontilhada. A da sombra sai sempre transparente (silhueta preta é o que dá para modular no motor) e é um sprite à parte, para colocar junto do personagem':
    'A GIF has 1-bit alpha: the character shadow is either composited onto a background or dithered. The shadow GIF is always transparent (a black silhouette is what the engine can modulate) and is a separate sprite, to place alongside the character',
  'Loop perfeito (descarta o último frame)': 'Perfect loop (drops the last frame)',
  'fundo': 'background',
  'Gerar GIFs': 'Generate GIFs',
  'pronto': 'ready',
  'px/unid.': 'px/unit',

  /* ---- títulos (atributo title) ---- */
  'Ambiente, limites da GPU e último erro': 'Environment, GPU limits and last error',
  'GIF tem alpha de 1 bit: com fundo transparente a sombra some; com fundo ela é composta de verdade':
    'A GIF has 1-bit alpha: on a transparent background the shadow disappears; on a background it is really composited',
  'OBJ sem animação: 1 frame por direção': 'OBJ has no animation: 1 frame per direction',
  'como sai o GIF da sombra, que é um sprite à parte': 'how the shadow GIF comes out — it is a separate sprite',
  'graus': 'degrees',
  'graus — digite ou arraste': 'degrees — type or drag',
  'graus — onde fica a frente do modelo': 'degrees — where the front of the model is',
  'intensidade da luz principal': 'main light intensity',
  'marca o ponto que a engine usa como âncora em cada célula': 'marks the point the engine uses as the anchor in each cell',
  'personagem + sombra num sprite só, com alpha de 8 bits e fundo transparente':
    'character + shadow in a single sprite, with 8-bit alpha and a transparent background',
  'pixels de vão entre células': 'gap pixels between cells',
  'pixels por unidade de mundo': 'pixels per world unit',
  'pixels — digite o valor que quiser, o slider só vai até 512':
    'pixels — type any value you want, the slider only goes to 512',
  'posição do alvo na célula, 0 = esquerda, 1 = direita': 'target position in the cell, 0 = left, 1 = right',
  'posição do alvo na célula, 0 = topo, 1 = base': 'target position in the cell, 0 = top, 1 = base',
  'quadros por direção — pode digitar além de 32': 'frames per direction — you can type beyond 32',
  'quadros por segundo': 'frames per second',
  'só a sombra do chão, na mesma grade da sheet': 'only the ground shadow, on the same grid as the sheet',
  'vezes': 'times',
  'volta a câmera para o enquadramento automático': 'returns the camera to the automatic framing',

  /* ---- mensagens dinâmicas (status, progresso, legendas) ----
   * As sem variável já passam por t() dentro de setStatus/setProgress. */
  'modelo anterior liberado ({g} geometrias, {m} materiais, {tex} texturas)':
    'previous model released ({g} geometries, {m} materials, {tex} textures)',
  'clip "{nome}" — {d}s': 'clip "{nome}" — {d}s',
  'modelo sem animação — 1 frame por direção': 'model has no animation — 1 frame per direction',
  'lendo {nome}…': 'reading {nome}…',
  'carregando samples/{arquivo}…': 'loading samples/{arquivo}…',
  'predefinição "{nome}" aplicada — ajuste o que quiser e gere':
    'preset "{nome}" applied — tweak whatever you like and generate',
  'câmera reenquadrada no modelo': 'camera reframed on the model',
  'escala travada em {v} px/unidade (calibrada neste modelo) — mude para combinar com outros projetos':
    'locked scale {v} px/unit (calibrated on this model) — change it to match other projects',
  'diagnóstico copiado — cole onde for pedir ajuda': 'diagnostics copied — paste wherever you ask for help',
  'diagnóstico copiado': 'diagnostics copied',
  'não consegui copiar — selecione o texto do painel': "couldn't copy — select the panel text",
  'carregue um modelo para calibrar a escala travada': 'load a model to calibrate the locked scale',
  'cancelando após a célula atual…': 'canceling after the current cell…',
  'carregue um modelo antes de gerar': 'load a model before generating',
  'sem contexto WebGL não há como gerar — abra "Diagnóstico" para ver o que a GPU informou':
    'no WebGL context means nothing can be generated — open "Diagnostics" to see what the GPU reported',
  'sheet pronta: {w}×{h} ({cols}×{rows} células de {cell}px)':
    'sheet ready: {w}×{h} ({cols}×{rows} cells of {cell}px)',
  ' · camada de sombra pronta no botão shadow.png': ' · shadow layer ready on the shadow.png button',
  'geração cancelada — a sheet anterior continua válida': 'generation canceled — the previous sheet is still valid',
  'falha na geração: {msg}': 'generation failed: {msg}',
  'gere a sheet com "Camada de sombra separada" marcada': 'generate the sheet with "Separate shadow layer" checked',
  'gere a sheet antes de baixar o .zip': 'generate the sheet before downloading the .zip',
  'zip pronto: {kb} KB, {n} arquivos': 'zip ready: {kb} KB, {n} files',
  'falha no zip: {msg}': 'zip failed: {msg}',
  'gere a sheet antes dos GIFs': 'generate the sheet before the GIFs',
  'falha no GIF: {msg}': 'GIF failed: {msg}',
  'WebGL com problema — {detalhe}': 'WebGL problem — {detalhe}',

  /* progresso */
  'preparando…': 'preparing…',
  'medindo enquadramento (auto-fit)…': 'measuring framing (auto-fit)…',
  'renderizando {i}/{n} — dir {d}, frame {f}': 'rendering {i}/{n} — dir {d}, frame {f}',
  'renderizando a camada de sombra…': 'rendering the shadow layer…',
  'sombra {i}/{n}': 'shadow {i}/{n}',
  'empacotando a sheet…': 'packing the sheet…',
  'empacotando a camada de sombra…': 'packing the shadow layer…',
  'compondo personagem + sombra…': 'compositing character + shadow…',
  'codificando os GIFs…': 'encoding the GIFs…',
  'codificando os GIFs da sombra…': 'encoding the shadow GIFs…',
  'zipando…': 'zipping…',
  'GIF dir{d} ({i}/{n})': 'GIF dir{d} ({i}/{n})',

  /* textos construídos em tempo de execução */
  '— sem animação (1 frame) —': '— no animation (1 frame) —',
  ' — sem animação': ' — no animation',
  '"{nome}" carregado ({fmt})': '"{nome}" loaded ({fmt})',
  '{nome} · {fmt} · {meshes} mesh · {tris} tris · {clips} clip(s)':
    '{nome} · {fmt} · {meshes} mesh · {tris} tris · {clips} clip(s)',
  '{nome} — {n} animação(ões)': '{nome} — {n} animation(s)',
  '{nome} — sem animação (1 frame por direção)': '{nome} — no animation (1 frame per direction)',
  '{w}×{h} px · {cols} frames × {rows} direções · célula {cell}px':
    '{w}×{h} px · {cols} frames × {rows} directions · {cell}px cell',
  ' + {p}px de vão': ' + {p}px padding',
  '{arquivo} · {n} frames · {fps} fps · elevação {elev}°':
    '{arquivo} · {n} frames · {fps} fps · elevation {elev}°',
  ' · frente {az}°': ' · facing {az}°',
  'modelo girando': 'model rotating',
  ' · {ppu} px/unidade': ' · {ppu} px/unit',
  'pronto — arraste um modelo (.glb, .gltf, .obj, .fbx, .stl, .ply), use "Abrir" ou carregue o exemplo (Fox)':
    'ready — drop a model (.glb, .gltf, .obj, .fbx, .stl, .ply), use "Open" or load the sample (Fox)',
  ' · suas preferências foram restauradas': ' · your preferences were restored',

  /* ---- iguais nos dois idiomas, de propósito ----
   * Nomes próprios, nomes de arquivo e o seletor de idioma (que não traduz o
   * próprio rótulo). Estão aqui para o teste de cobertura saber que foi visto. */
  'Idioma / Language': 'Idioma / Language',
  'Sprite': 'Sprite',
  '🇧🇷 Português': '🇧🇷 Português',
  '🇺🇸 English': '🇺🇸 English',
  'Clip': 'Clip',
  'Play': 'Play',
  'Pause': 'Pause',
  'Pivot': 'Pivot',
  'pivot x': 'pivot x',
  'pivot y': 'pivot y',
  'Frames': 'Frames',
  'Padding': 'Padding',
  'Sheet': 'Sheet',
  'Sheet & Player': 'Sheet & Player',
  'Player': 'Player',
  'sheet.png': 'sheet.png',
  'metadata.json': 'metadata.json',
  '.aseprite.json': '.aseprite.json',
  'fps': 'fps',
  'zoom': 'zoom',
  'y': 'y',

  /* ---- projeto (.spriteforge.json) ---- */
  'Projeto': 'Project',
  'Salvar projeto': 'Save project',
  'Abrir projeto': 'Open project',
  'Salva todas as opções num arquivo .spriteforge.json': 'Saves every option to a .spriteforge.json file',
  'Carrega as opções de um .spriteforge.json': 'Loads the options from a .spriteforge.json',
  'Só as opções são salvas — o modelo não vai junto. Salve na pasta projetos/ do app; ela está no .gitignore.':
    'Only the options are saved — the model does not go with it. Save into the app\'s projetos/ folder; it is gitignored.',
  'projeto salvo em {nome}': 'project saved to {nome}',
  'projeto baixado como {nome} — mova para a pasta projetos/ se quiser':
    'project downloaded as {nome} — move it into the projetos/ folder if you like',
  'projeto carregado': 'project loaded',
  'não é um projeto do SpriteForge: {motivo}': 'not a SpriteForge project: {motivo}',
  'não consegui ler o arquivo: {msg}': "couldn't read the file: {msg}",
  'projeto feito com {nome} — carregue o modelo de novo': 'project made with {nome} — load the model again',
  'ignorei {n} valor(es) inválido(s): {lista}': 'ignored {n} invalid value(s): {lista}',
  'não é um JSON válido': 'not valid JSON',
  'o arquivo não contém um objeto de projeto': 'the file does not contain a project object',
  'não parece um projeto do SpriteForge (falta "kind" e "settings")':
    'does not look like a SpriteForge project (missing "kind" and "settings")',
  'o campo "settings" não é um objeto': 'the "settings" field is not an object',

  /* ---- relatório da sessão ---- */
  'Relatório da sessão': 'Session report',
  'baixar .txt': 'download .txt',
  'baixar .json': 'download .json',
  'limpar': 'clear',
  'Relatório legível: ambiente, linha do tempo e o que você não chegou a usar':
    'Readable report: environment, timeline, and what you never got to use',
  'Os mesmos dados em JSON, para analisar': 'The same data as JSON, for analysis',
  'Apaga a sessão gravada e começa do zero': 'Deletes the recorded session and starts over',
  'Lista cada ação em ordem, quanto tempo levou, e o que nunca foi usado — é isso que mostra o que ainda falta testar. A sessão sobrevive a recarregar a página.':
    'Lists every action in order, how long it took, and what was never used — that is what shows what is left to test. The session survives a page reload.',
  '{n} eventos · {u} recursos usados': '{n} events · {u} features used',
  'relatório baixado (.txt)': 'report downloaded (.txt)',
  'relatório baixado (.json)': 'report downloaded (.json)',
  'relatório da sessão baixado ({n} eventos)': 'session report downloaded ({n} events)',
  'sessão limpa': 'session cleared',

  /* ---- pasta de saída ---- */
  'Pasta de saída: downloads': 'Output folder: downloads',
  'Pasta de saída: {nome}': 'Output folder: {nome}',
  ' — clique para autorizar': ' — click to authorize',
  'Os arquivos vão para a pasta de downloads do navegador. Clique para escolher uma pasta (por exemplo a pasta do app).':
    'Files go to the browser downloads folder. Click to pick a folder (for example the app folder).',
  'Os arquivos saem em "{nome}". Clique para trocar ou esquecer.':
    'Files are written to "{nome}". Click to change it, right-click to forget it.',
  'arquivos agora saem na pasta "{nome}"': 'files now go to the "{nome}" folder',
  'pasta "{nome}" escolhida, mas a permissão de escrita foi negada — vai continuar baixando':
    'folder "{nome}" picked, but write permission was denied — it will keep downloading',
  'pasta de saída esquecida — voltou para a pasta de downloads':
    'output folder forgotten — back to the downloads folder',
  'este navegador não deixa escolher pasta de saída (Firefox/Safari) — os arquivos continuam indo para downloads':
    'this browser cannot pick an output folder (Firefox/Safari) — files keep going to downloads',
  'não consegui gravar na pasta ({msg}) — baixei em vez disso':
    "couldn't write to the folder ({msg}) — downloaded it instead",
};

let atual = 'pt-BR';
/** Diz se o texto tem entrada no dicionário inglês — mesmo que a tradução
 * seja idêntica ao original. O teste de cobertura usa isto para não confundir
 * "esquecido" com "igual nos dois idiomas". */
export function temTraducao(texto) {
  return Object.prototype.hasOwnProperty.call(EN, norm(texto));
}

export function idiomaAtual() { return atual; }

/** Traduz um texto já montado. `{var}` é substituído depois de traduzir. */
export function t(texto, vars) {
  let base = String(texto);
  if (atual !== 'pt-BR') {
    const chave = norm(base);
    if (EN[chave]) base = EN[chave];
  }
  if (vars) for (const [k, v] of Object.entries(vars)) base = base.replaceAll(`{${k}}`, String(v));
  return base;
}

const originaisTexto = new WeakMap();
const originaisTitle = new WeakMap();

function pulavel(node) {
  const pai = node.parentElement;
  if (!pai) return true;
  const tag = pai.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || pai.id === 'idiomaBox';
}

/** Troca todo texto (e todo `title`) do documento para o idioma escolhido. */
export function aplicarIdioma(lang) {
  atual = IDIOMAS.some((i) => i.id === lang) ? lang : 'pt-BR';
  // Fora do navegador (testes em Node) não há DOM: o idioma é trocado e t() passa
  // a traduzir, só não há árvore para percorrer.
  if (typeof document === 'undefined' || !document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (pulavel(node)) continue;
    if (!originaisTexto.has(node)) originaisTexto.set(node, node.nodeValue);
    const original = originaisTexto.get(node);
    const chave = norm(original);
    if (!chave) continue;
    const novo = atual === 'pt-BR' ? original : (EN[chave] ?? original);
    if (node.nodeValue !== novo) node.nodeValue = novo;
  }
  for (const elmt of document.querySelectorAll('[title]')) {
    if (!originaisTitle.has(elmt)) originaisTitle.set(elmt, elmt.getAttribute('title'));
    const original = originaisTitle.get(elmt);
    const chave = norm(original);
    if (!chave) continue;
    elmt.setAttribute('title', atual === 'pt-BR' ? original : (EN[chave] ?? original));
  }
  document.documentElement.lang = atual;
}

/** Quantos textos visíveis ficaram sem tradução — útil para não deixar buraco. */
export function semTraducao() {
  const faltando = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (pulavel(node)) continue;
    const chave = norm(originaisTexto.get(node) ?? node.nodeValue);
    if (!chave || /^[\d\s.:,%/·—–-]*$/.test(chave)) continue;
    if (!EN[chave]) faltando.push(chave);
  }
  return [...new Set(faltando)];
}
