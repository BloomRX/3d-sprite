/*
 * Testa a sincronização slider <-> campo digitado do app.js.
 *
 * Não roda no navegador (não há como aqui), então o teste executa o BLOCO REAL do
 * app.js — extraído do arquivo pelo texto — contra um DOM mínimo que imita o
 * comportamento do <input type=range> do navegador (clamp + encaixe no passo).
 * Se o bloco mudar de forma, o teste falha em vez de testar outra coisa.
 *
 *   node tests/spriteforge/test-app-sync.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- pega o bloco REAL do app.js (o código que vai pro usuário, não uma cópia) ---
const src = readFileSync(
  fileURLToPath(new URL('../../spriteforge/app/app.js', import.meta.url)), 'utf8'
);
const inicio = src.indexOf('const ANGULOS = new Set');
const fim = src.indexOf("\n}", src.indexOf("num.addEventListener('change', () => commit(true));", inicio)) + 2;
const bloco = src.slice(inicio, fim);
if (!bloco.includes('dataset.baseMax') || !bloco.includes('range.max = String(acima ? raw : baseMax)')) {
  console.log('FALHA: o bloco extraído não é o esperado'); process.exit(1);
}

// --- DOM mínimo que se comporta como <input type=range> do navegador ---
class El {
  constructor({ min, max, step, value, kind }) {
    this.min = String(min); this.max = String(max); this.step = String(step);
    this._v = String(value); this.kind = kind; this.dataset = {}; this.handlers = {};
  }
  get value() { return this._v; }
  set value(v) {
    let n = Number(v);
    if (!Number.isFinite(n)) return;
    if (this.kind === 'range') {                       // o browser clampa E encaixa no passo
      n = Math.min(Number(this.max), Math.max(Number(this.min), n));
      if (this.step !== 'any') {
        const p = Number(this.step) || 1;
        n = Number(this.min) + Math.round((n - Number(this.min)) / p) * p;
        n = Math.round(n * 1e6) / 1e6;
      }
    }
    this._v = String(n);
  }
  addEventListener(t, fn) { (this.handlers[t] ??= []).push(fn); }
  dispatchEvent(ev) { for (const fn of (this.handlers[ev.type] ?? [])) fn(ev); }
}
class Event { constructor(type) { this.type = type; } }

const spec = {
  rngElevation: [-10, 89, 1, 18], rngAzimuth: [0, 359, 1, 0], rngFrames: [1, 32, 1, 12],
  rngCell: [16, 512, 8, 128], rngPadding: [0, 8, 1, 0], rngScaleLock: [0.05, 64, 0.05, 8],
  rngFps: [1, 30, 1, 12], rngZoom: [1, 8, 1, 1], rngLightAz: [0, 359, 1, 34], rngLightInt: [0, 5, 0.1, 2.6]
};
const el = {};
for (const [k, [mn, mx, st, v]] of Object.entries(spec)) el[k] = new El({ min: mn, max: mx, step: st, value: v, kind: 'range' });
for (const [, numKey] of [['rngElevation','elevationVal'],['rngAzimuth','azimuthVal'],['rngFrames','framesVal'],['rngCell','cellVal'],['rngPadding','paddingVal'],['rngScaleLock','scaleLockVal'],['rngFps','fpsVal'],['rngZoom','zoomVal'],['rngLightAz','lightAzVal'],['rngLightInt','lightIntVal']]) {
  const [mn, mx, st, v] = spec[{'elevationVal':'rngElevation','azimuthVal':'rngAzimuth','framesVal':'rngFrames','cellVal':'rngCell','paddingVal':'rngPadding','scaleLockVal':'rngScaleLock','fpsVal':'rngFps','zoomVal':'rngZoom','lightAzVal':'rngLightAz','lightIntVal':'rngLightInt'}[numKey]];
  el[numKey] = new El({ min: mn, max: mx, step: st, value: v, kind: 'number' });
}
const NUMERIC_PAIRS = [['rngElevation','elevationVal'],['rngAzimuth','azimuthVal'],['rngFrames','framesVal'],['rngCell','cellVal'],['rngPadding','paddingVal'],['rngScaleLock','scaleLockVal'],['rngFps','fpsVal'],['rngZoom','zoomVal'],['rngLightAz','lightAzVal'],['rngLightInt','lightIntVal']];

// O bloco real do app.js anota no gravador de sessão quando o usuário digita um
// valor. O stub abaixo recebe essas chamadas — assim o teste continua exercitando
// o código de verdade E verifica que a anotação acontece.
const gravador = {
  marcados: [], registrados: [],
  marcar(id) { this.marcados.push(id); return true; },
  registrar(tipo, msg) { this.registrados.push([tipo, msg]); }
};

new Function('el', 'NUMERIC_PAIRS', 'Event', 'gravador', bloco)(el, NUMERIC_PAIRS, Event, gravador);
const digitar = (id, v) => { el[id].value = v; el[id].dispatchEvent(new Event('input')); };
const sair = (id) => el[id].dispatchEvent(new Event('change'));
const arrastar = (r, v) => { el[r].value = v; el[r].dispatchEvent(new Event('input')); };
const digitarESair = (id, v) => { digitar(id, v); sair(id); };
const soltar = (r) => el[r].dispatchEvent(new Event('change'));

let fail = 0;
let passou = 0;
const ok = (c, m) => { if (!c) { console.log('FALHA:', m); fail++; } else { passou++; console.log('  ok —', m); } };

digitar('cellVal', '1024'); sair('cellVal');
ok(el.rngCell.value === '1024', `célula 1024 chega no slider (que o gerador lê): ${el.rngCell.value}`);
ok(el.cellVal.value === '1024', `o campo continua mostrando 1024: ${el.cellVal.value}`);
digitar('framesVal', '60'); sair('framesVal');
ok(el.rngFrames.value === '60', `60 frames no slider: ${el.rngFrames.value}`);
digitar('fpsVal', '60'); sair('fpsVal');
ok(el.rngFps.value === '60', `60 fps no slider: ${el.rngFps.value}`);
digitar('zoomVal', '16'); sair('zoomVal');
ok(el.rngZoom.value === '16', `zoom 16 no slider: ${el.rngZoom.value}`);
digitar('scaleLockVal', '200'); sair('scaleLockVal');
ok(el.rngScaleLock.value === '200', `escala 200 no slider: ${el.rngScaleLock.value}`);
digitar('lightIntVal', '12'); sair('lightIntVal');
ok(el.rngLightInt.value === '12', `intensidade 12 no slider: ${el.rngLightInt.value}`);
digitar('elevationVal', '200'); sair('elevationVal');
ok(el.rngElevation.value === '89' && el.elevationVal.value === '89', `ângulo continua clampado em 89: ${el.elevationVal.value}`);
digitar('azimuthVal', '400'); sair('azimuthVal');
ok(el.rngAzimuth.value === '359', `azimute clampado em 359: ${el.rngAzimuth.value}`);
digitar('cellVal', '7'); sair('cellVal');
ok(el.rngCell.value === '16', `mínimo continua valendo (7 -> 16): ${el.rngCell.value}`);
arrastar('rngCell', 256);
ok(el.cellVal.value === '256', `arrastar o slider atualiza o campo: ${el.cellVal.value}`);
soltar('rngCell');
ok(el.rngCell.max === '512', `soltar o slider devolve o teto de fábrica: max=${el.rngCell.max}`);
ok(el.rngCell.step === '8', `e o passo volta a 8: step=${el.rngCell.step}`);
digitar('cellVal', '1000');
ok(el.cellVal.value === '1000' && el.rngCell.value === '1000', `digitar não é sobrescrito no meio: campo=${el.cellVal.value} slider=${el.rngCell.value}`);
digitar('cellVal', '3');
ok(el.cellVal.value === '3', `digitar "3" a caminho de "300" não é podado pra 16: ${el.cellVal.value}`);

// setPair (usado por applySettings / presets) — precisa aceitar 1024 também
const setPairSrc = bloco.slice(bloco.indexOf('function setPair'), bloco.indexOf('for (const [rangeKey, numKey] of NUMERIC_PAIRS)'));
const el2 = {}; for (const k of Object.keys(el)) el2[k] = el[k];
new Function('el', 'ANGULOS', setPairSrc)(el2, new Set(['elevationVal','azimuthVal','lightAzVal']));
new Function('el','NUMERIC_PAIRS','Event','gravador', bloco)(el2, NUMERIC_PAIRS, Event, gravador);
el2.rngCell.max = '512'; el2.rngCell.step = '8';
new Function('el', 'ANGULOS', 'setPair', 'void 0;')({}, new Set(), () => {});
const aplicar = new Function('el', 'ANGULOS', setPairSrc + '; return setPair;')(el2, new Set(['elevationVal','azimuthVal','lightAzVal']));
aplicar('rngCell', 'cellVal', 1024);
ok(el2.rngCell.value === '1024' && el2.cellVal.value === '1024', `preset/ajuste com 1024 sobrevive: slider=${el2.rngCell.value} campo=${el2.cellVal.value}`);
aplicar('rngCell', 'cellVal', 128);
ok(el2.rngCell.value === '128' && el2.rngCell.max === '512', `voltar a 128 devolve o teto: max=${el2.rngCell.max}`);


/* ---- opcoesGif(): como cada GIF sai (também código real do app.js) ---- */
const iniOp = src.indexOf('function opcoesGif() {');
const fimOp = src.indexOf('\n}', src.indexOf('rotulo:', src.indexOf('sombra: {', iniOp))) + 2;
const opcoesSrc = src.slice(iniOp, fimOp);
if (!opcoesSrc.includes("alphaCut: modo === 'pontilhado'")) {
  console.log('FALHA: opcoesGif não foi extraído como esperado'); fail++;
} else {
  // `sombra` é o estado da caixa "Sombra no chão". O stub antigo nem a tinha, e
  // era isso que deixava o teste afirmar um `comSombra: true` fixo como se fosse
  // o comportamento certo.
  const rodar = (bg, modo, sombra = true) => new Function('el', 'core', 'GIF_BG', 'state',
    opcoesSrc + '; return opcoesGif();')(
    { selGifBg: { value: bg }, selShadowGif: { value: modo }, chkShadow: { checked: sombra } },
    { GIF_ALPHA_CUT: 128 }, { white: '#ffffff', dark: '#15181d' }, { result: { dirCount: 8 } }
  );
  let o = rodar('dither', 'silhueta');
  ok(o.personagem.transparente === true && o.personagem.pontilhado === true && o.personagem.alphaCut === 128,
    `GIF do personagem no padrão: transparente+pontilhado, corte ${o.personagem.alphaCut}`);
  ok(o.sombra.transparente === true && o.sombra.pontilhado === false && o.sombra.alphaCut === 8,
    `GIF da sombra: transparente e silhueta (corte ${o.sombra.alphaCut} -> preto sólido)`);
  o = rodar('white', 'silhueta');
  ok(o.personagem.transparente === false && o.personagem.fundo === '#ffffff', 'fundo branco compõe o GIF do personagem');
  ok(o.sombra.transparente === true, 'o GIF da sombra nunca ganha fundo sólido');
  o = rodar('transparent', 'pontilhado');
  ok(o.sombra.pontilhado === true && o.sombra.alphaCut === 128, 'sombra pontilhada usa Bayer com corte 128');
  ok(o.personagem.rotulo.includes('personagem') && o.sombra.rotulo.includes('sombra'), 'cada conjunto tem legenda própria');
  ok(o.personagem.comSombra === true, 'com a sombra ligada o GIF do personagem a recompõe por baixo');
  ok(o.sombra.comSombra === false, 'o GIF da sombra não se recompõe em si mesmo');

  // O bug relatado: desmarcar "Sombra no chão" e gerar GIFs continuava saindo com
  // sombra, porque comSombra era `true` fixo e a folha da sombra da geração
  // anterior continuava viva no resultado.
  const semSombra = rodar('dither', 'silhueta', false);
  ok(semSombra.personagem.comSombra === false,
    'desmarcar "Sombra no chão" faz o GIF do personagem sair SEM sombra (buildGifs só recompõe se comSombra)');
  ok(semSombra.sombra.comSombra === false, 'o GIF da sombra nunca se recompõe, ligado ou desligado');
  ok(semSombra.personagem.transparente === true && semSombra.personagem.alphaCut === 128,
    'desligar a sombra não mexe em nada mais do GIF do personagem');
}


/* ---- a sombra não pode existir nas duas folhas ao mesmo tempo ---- */
const linhaGround = src.split('\n').find((l) => l.includes('ground.visible = wantShadowLayer'));
ok(!!linhaGround, 'o passe do personagem decide o chão olhando a camada separada');
if (linhaGround) {
  const expr = linhaGround.trim().replace(/^ground\.visible = /, '').replace(/;$/, '');
  const rodar = (camada, sombra) => new Function('wantShadowLayer', 'el', `return (${expr});`)(
    camada, { chkShadow: { checked: sombra } }
  );
  ok(rodar(true, true) === false,
    'camada separada ligada -> chão FORA do passe do personagem (era isso que duplicava a sombra)');
  ok(rodar(false, true) === true, 'sem camada separada -> a sombra continua gravada no personagem');
  ok(rodar(false, false) === false, 'sombra desligada -> chão fora');
  ok(rodar(true, false) === false, 'camada separada com a sombra desligada -> chão fora');
}

/* ---- o gravador de sessão anota quando o usuário digita ---- */
{
  gravador.marcados.length = 0;
  gravador.registrados.length = 0;
  digitarESair('cellVal', 256);
  ok(gravador.marcados.includes('digitou'),
    'digitar um valor marca o recurso "digitou" no relatório da sessão');
  ok(gravador.registrados.length > 0 && gravador.registrados[0][0] === 'opcoes',
    'digitar um valor entra na linha do tempo como mudança de opção');
  ok(gravador.registrados.some(([, msg]) => String(msg).includes('cellVal') && String(msg).includes('256')),
    'a linha do tempo diz qual campo foi digitado e com que valor');

  gravador.marcados.length = 0;
  gravador.registrados.length = 0;
  arrastar('rngCell', 192);
  soltar('rngCell');
  ok(!gravador.marcados.includes('digitou'),
    'arrastar o slider NÃO conta como valor digitado (são interações diferentes)');

  // Num navegador, <input type=number> com texto inválido devolve value === ''.
  // O El falso rejeitaria no setter, então o '' é posto direto para emular isso.
  gravador.marcados.length = 0;
  gravador.registrados.length = 0;
  const antes = el.rngCell.value;
  el.cellVal._v = '';
  el.cellVal.dispatchEvent(new Event('change'));
  ok(el.cellVal.value === '', 'campo vazio ao sair NÃO é sobrescrito (o usuário pode estar apagando para digitar outro)');
  ok(el.rngCell.value === antes, `e o slider não muda: continua ${el.rngCell.value}`);
  ok(!gravador.marcados.includes('digitou') && gravador.registrados.length === 0,
    'campo vazio não vira evento no relatório (nada aconteceu de fato)');
}

/* ---- a sombra separada é opaca; a composta a recompõe a 35% ----
 * Um relato real de "imagem vazia" veio de uma folha com 1,3 milhão de pixels de
 * sombra a alpha 89. Estes asserts rodam o código REAL do app.js. */
function funcaoReal(assinatura) {
  const ini = src.indexOf(assinatura);
  if (ini < 0) { console.log('FALHA: não achei ' + assinatura); process.exit(1); }
  let prof = 0;
  for (let k = src.indexOf('{', ini); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(ini, k + 1); }
  }
  console.log('FALHA: chave não fecha em ' + assinatura); process.exit(1);
}

{
  const opacidadeReal = Number(
    src.match(/const SOMBRA_OPACIDADE = ([0-9.]+);/)?.[1] ?? NaN
  );
  ok(opacidadeReal === 0.35, `SOMBRA_OPACIDADE vale 0,35 (a opacidade da sombra dentro da imagem): ${opacidadeReal}`);

  const desenhos = [];
  const documento = {
    createElement: () => {
      const ctx = {
        globalAlpha: 1,
        drawImage(img) { desenhos.push({ img, alpha: this.globalAlpha }); }
      };
      const c = { width: 0, height: 0, getContext: () => ctx };
      return c;
    }
  };
  const composta = new Function(
    'document', 'SOMBRA_OPACIDADE', funcaoReal('function composeSheetWithShadow(r) {') + '; return composeSheetWithShadow;'
  )(documento, opacidadeReal);

  const sombra = { nome: 'sombra' }, folha = { nome: 'folha' };
  const c = composta({ sheet: folha, shadowSheet: sombra, layout: { w: 256, h: 128 } });
  ok(c.width === 256 && c.height === 128, `a folha composta tem o tamanho do layout: ${c.width}x${c.height}`);
  ok(desenhos.length === 2, `a composta desenha exatamente duas vezes: ${desenhos.length}`);
  ok(desenhos[0].img === sombra, 'desenha a sombra PRIMEIRO (fica por baixo do personagem)');
  ok(desenhos[0].alpha === opacidadeReal,
    `a sombra é recomposta a ${opacidadeReal} na composta — sem isto ela dobraria de força, já que o PNG agora é opaco`);
  ok(desenhos[1].img === folha, 'desenha o personagem por cima');
  ok(desenhos[1].alpha === 1,
    `o personagem volta ao alpha 1 depois da sombra: ${desenhos[1].alpha} (esquecer isto desbotaria o sprite inteiro)`);
}

/* ---- o passe da sombra renderiza opaco e devolve a opacidade depois ---- */
{
  const linha = (trecho) => {
    const l = src.split('\n').find((x) => x.includes(trecho));
    if (!l) { console.log('FALHA: falta a linha ' + trecho); process.exit(1); }
    return l.trim();
  };
  const guardar = linha('const opacidadeAntes = ground.material.opacity;');
  const forcarOpaco = linha('ground.material.opacity = 1;');
  const devolver = linha('ground.material.opacity = opacidadeAntes;');

  const ground = { material: { opacity: 0.35 } };
  const passos = [];
  const ctxReal = new Function('ground', 'passos', [
    guardar, 'passos.push(ground.material.opacity);',
    forcarOpaco, 'passos.push(ground.material.opacity);',
    devolver, 'passos.push(ground.material.opacity);',
    'return ground.material.opacity;'
  ].join('\n'));
  const final = ctxReal(ground, passos);

  ok(passos[1] === 1,
    `durante o passe da sombra o chão é OPACO (opacity 1) — é isto que faz o PNG sair preto sólido: ${passos[1]}`);
  ok(final === 0.35,
    `a opacidade volta ao valor de antes depois do passe: ${final} (senão o personagem também sairia com sombra opaca)`);
  ok(passos[0] === 0.35, `e o valor guardado é mesmo o do preview: ${passos[0]}`);
}

/* ---- pastaPara pede permissão no clique em vez de cair em download ---- */
async function testarPastaPara() {
  const pedidas = [];
  const pastaStub = {
    permissaoOk(handle, pedir) { pedidas.push([handle.name, pedir]); return Promise.resolve(true); }
  };
  const rotulos = [];
  const saidaStub = { pasta: { name: 'saida', getDirectoryHandle: (n, o) => Promise.resolve({ name: n, criado: !!o?.create }) }, permissao: false };
  const fn = new Function('saida', 'pasta', 'atualizarRotuloPasta',
    funcaoReal('async function pastaPara(tipo) {') + '; return pastaPara;')(saidaStub, pastaStub, () => rotulos.push(1));

  {
    const dir = await fn('projetos');
    ok(pedidas.length === 1 && pedidas[0][1] === true,
      `permissão sem gesto guardado -> PEDIU de novo (pedir=true): ${JSON.stringify(pedidas[0])}`);
    ok(saidaStub.permissao === true, 'e a permissão concedida fica guardada para os próximos exports');
    ok(rotulos.length === 1, 'o rótulo da pasta na interface é atualizado depois de pedir');
    ok(dir && dir.name === 'projetos' && dir.criado === true,
      `a subpasta "projetos" é criada dentro da pasta escolhida: ${dir && dir.name}`);
  }

  // recusou a permissão -> volta null, sem inventar caminho
  const saidaSem = { pasta: { name: 'saida', getDirectoryHandle: () => Promise.resolve(null) }, permissao: false };
  const pastaNega = { permissaoOk: () => Promise.resolve(false) };
  const fn2 = new Function('saida', 'pasta', 'atualizarRotuloPasta',
    funcaoReal('async function pastaPara(tipo) {') + '; return pastaPara;')(saidaSem, pastaNega, () => {});
  ok((await fn2('projetos')) === null,
    'permissão negada -> null (aí sim cai em download, e o aviso diz isso)');

  // sem pasta escolhida, nem pergunta
  const fn3 = new Function('saida', 'pasta', 'atualizarRotuloPasta',
    funcaoReal('async function pastaPara(tipo) {') + '; return pastaPara;')({ pasta: null, permissao: false }, pastaStub, () => {});
  const antes = pedidas.length;
  ok((await fn3('saida')) === null && pedidas.length === antes,
    'sem pasta escolhida não pergunta nada, só devolve null');
}

/* ---- o seletor de pasta não abre duas vezes ---- */
async function testarSeletor() {
  let aberturas = 0;
  const estados = [];
  const resolucoes = [];
  const pastaLento = {
    apiDisponivel: () => true,
    // Guarda TODAS as resoluções: se a guarda de reentrada falhar, abre mais de um
    // seletor e liberar só o último deixaria o primeiro pendurado para sempre.
    escolherPasta: () => { aberturas++; return new Promise((r) => resolucoes.push(r)); },
    permissaoOk: () => Promise.resolve(true),
    guardarPasta: () => Promise.resolve(),
    esquecerPasta: () => Promise.resolve()
  };
  const saidaG = { pasta: null, permissao: false, escolhendo: false };
  const abrir = new Function('saida', 'pasta', 'setStatus', 't', 'gravador', 'gravarSessao', 'atualizarRotuloPasta',
    funcaoReal('async function escolherPastaSaida() {') + '; return escolherPastaSaida;')(
    saidaG, pastaLento,
    (msg, tipo) => estados.push([msg, tipo]),
    (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : `{${k}}`)),
    { registrar() {} }, () => {}, () => {}
  );

  const primeiro = abrir();
  const segundo = abrir();
  // Só libera DEPOIS dos dois cliques: o ponto do teste é que o segundo encontre
  // o primeiro ainda aberto. Liberar antes deixaria o flag já abaixado e o teste
  // passaria sem provar nada.
  ok(saidaG.escolhendo === true, 'o flag sobe assim que o seletor abre');
  ok(estados.length === 1, `o segundo clique avisa em vez de abrir outro seletor: ${estados.length} aviso`);
  for (const r of resolucoes) r(null);  // o usuário cancela o seletor
  await Promise.all([primeiro, segundo]);
  {
    ok(aberturas === 1,
      `clicar de novo com o seletor aberto NÃO abre outro (aberturas=${aberturas}) — era isto que gerava "File picker already active"`);
    ok(estados.some(([m, tipo]) => tipo === 'err' && m.includes('já está aberto')),
      `e o usuário fica sabendo por quê: "${estados[estados.length - 1][0]}"`);
  }
  ok(saidaG.escolhendo === false, 'cancelar o seletor libera o flag para tentar de novo');
}

// Os dois blocos acima são async (pastaPara e o seletor pedem permissão de
// verdade), então a contagem precisa esperar por eles — senão os asserts
// rodavam DEPOIS do process.exit e não contavam.
//
// O vigia existe porque um await que nunca resolve deixa o laço de eventos vazio
// e o Node sai com código 0: um teste travado contava como sucesso. Verificado
// de propósito, desligando a guarda do seletor.
const vigia = setTimeout(() => {
  console.log('\nFALHA: o teste travou — alguma promessa não resolveu');
  process.exit(1);
}, 5000);

(async () => {
  await testarPastaPara();
  await testarSeletor();
  clearTimeout(vigia);
  console.log(fail === 0
    ? `\n${passou} passou, 0 falhou — sync slider/campo digitado do app.js`
    : `\n${passou} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})();
