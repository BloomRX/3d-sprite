/**
 * Gravador de sessão do SpriteForge.
 *
 * Guarda o que aconteceu na sessão numa fila de tamanho fixo e monta dois
 * relatórios: um texto legível (para colar num issue) e um JSON (para
 * analisar). O objetivo é responder duas perguntas de uma vez:
 *
 *   1. o que aconteceu, em que ordem, e quanto tempo levou;
 *   2. o que NÃO foi usado — um recurso nunca tocado durante o teste é
 *      justamente o que continua sem verificação.
 *
 * O módulo é puro: não toca em DOM nem em `localStorage`. Quem chama decide
 * quando gravar e onde salvar. Tudo recebe o tempo por parâmetro
 * (`agora`), então os testes são determinísticos.
 */

/** Tamanho da fila. Sessão longa descarta o começo, não trava a página. */
export const CAP_EVENTOS = 600;

/**
 * Recursos que o relatório acompanha. A ordem é a ordem em que aparecem no
 * relatório, que segue o fluxo natural de uso (carregar → ajustar → gerar →
 * exportar). `rotulo` é o que o usuário lê; `en` é a tradução.
 */
export const RECURSOS = [
  { id: 'modelo', rotulo: 'carregou um modelo', en: 'loaded a model' },
  { id: 'amostra', rotulo: 'carregou um exemplo', en: 'loaded a sample' },
  { id: 'preset', rotulo: 'usou uma predefinição', en: 'used a preset' },
  { id: 'digitou', rotulo: 'digitou um valor numérico', en: 'typed a numeric value' },
  { id: 'pivot', rotulo: 'usou pivot personalizado', en: 'used a custom pivot' },
  { id: 'trava', rotulo: 'calibrou a escala travada', en: 'calibrated the locked scale' },
  { id: 'idioma', rotulo: 'trocou o idioma', en: 'switched language' },
  { id: 'orbital', rotulo: 'girou/deu zoom no viewport', en: 'orbited the viewport' },
  { id: 'reenquadrar', rotulo: 'reenquadrou a câmera', en: 'reframed the camera' },
  { id: 'player', rotulo: 'usou o player', en: 'used the player' },
  { id: 'gerou', rotulo: 'gerou a spritesheet', en: 'generated the spritesheet' },
  { id: 'cancelou', rotulo: 'cancelou uma geração', en: 'canceled a generation' },
  { id: 'gifs', rotulo: 'gerou os GIFs', en: 'generated the GIFs' },
  { id: 'camadaSombra', rotulo: 'mudou a camada de sombra', en: 'changed the shadow layer' },
  { id: 'dlSheet', rotulo: 'baixou a sheet', en: 'downloaded the sheet' },
  { id: 'dlJson', rotulo: 'baixou o metadata.json', en: 'downloaded metadata.json' },
  { id: 'dlAseprite', rotulo: 'baixou o .aseprite.json', en: 'downloaded .aseprite.json' },
  { id: 'dlSombra', rotulo: 'baixou a sombra separada', en: 'downloaded the separate shadow' },
  { id: 'dlZip', rotulo: 'baixou o .zip', en: 'downloaded the .zip' },
  { id: 'dlGif', rotulo: 'baixou um GIF', en: 'downloaded a GIF' },
  { id: 'projetoSalvar', rotulo: 'salvou um projeto', en: 'saved a project' },
  { id: 'projetoAbrir', rotulo: 'abriu um projeto', en: 'opened a project' },
  { id: 'diagnostico', rotulo: 'abriu o diagnóstico', en: 'opened diagnostics' },
  { id: 'aba', rotulo: 'trocou de aba', en: 'switched tabs' }
];

const ID_RECURSOS = new Set(RECURSOS.map((r) => r.id));

/** Formata ms como `1m23.4s` / `12.3s` — legível sem perder resolução. */
export function formatarDuracao(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/d';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${(s - m * 60).toFixed(1)}s`;
}

/** Corta string longa no meio, mantendo começo e fim (caminhos, stacks). */
export function cortar(texto, max = 200) {
  const s = String(texto ?? '');
  if (s.length <= max) return s;
  const meio = Math.max(0, Math.floor((max - 3) / 2));
  return `${s.slice(0, meio)}…${s.slice(s.length - meio)}`;
}

/**
 * Cria um gravador independente. Vários podem coexistir (os testes usam isso).
 * @param {{agora?: () => number, id?: string}} [opcoes]
 */
export function criarGravador(opcoes = {}) {
  const agora = typeof opcoes.agora === 'function' ? opcoes.agora : Date.now;
  const estado = {
    id: opcoes.id || `s${agora().toString(36)}`,
    inicio: agora(),
    eventos: [],
    recursos: Object.create(null),
    descartados: 0,
    geracoes: { iniciadas: 0, concluidas: 0, canceladas: 0, falhas: 0, msTotal: 0 },
    downloads: 0,
    erros: 0
  };

  /** Marca um recurso como usado. Id desconhecido é ignorado (não inventa linha). */
  function marcar(id) {
    if (!ID_RECURSOS.has(id)) return false;
    if (!(id in estado.recursos)) estado.recursos[id] = agora() - estado.inicio;
    return true;
  }

  /**
   * Anota um evento. `tipo` é uma categoria curta e estável (modelo, geracao,
   * export, erro…); `msg` é o que o humano lê; `dados` vai só para o JSON.
   */
  function registrar(tipo, msg, dados = null) {
    const ev = {
      ms: agora() - estado.inicio,
      tipo: String(tipo || 'evento'),
      msg: cortar(msg ?? '', 400)
    };
    if (dados !== null && dados !== undefined) ev.dados = dados;
    if (estado.eventos.length >= CAP_EVENTOS) {
      estado.eventos.shift();
      estado.descartados += 1;
    }
    estado.eventos.push(ev);
    return ev;
  }

  function contarGeracao(campo, ms) {
    if (campo in estado.geracoes) estado.geracoes[campo] += 1;
    if (Number.isFinite(ms) && ms > 0) estado.geracoes.msTotal += ms;
  }

  function contarDownload() {
    estado.downloads += 1;
  }

  function contarErro() {
    estado.erros += 1;
  }

  /** Recursos usados e não usados, na ordem de RECURSOS. */
  function inventario() {
    const usados = [];
    const naoUsados = [];
    for (const r of RECURSOS) {
      if (r.id in estado.recursos) usados.push({ ...r, ms: estado.recursos[r.id] });
      else naoUsados.push({ ...r });
    }
    return { usados, naoUsados };
  }

  /** Objeto pronto para JSON.stringify. `extra` entra em `ambiente`. */
  function json(extra = null) {
    const { usados, naoUsados } = inventario();
    return {
      ferramenta: 'SpriteForge Web',
      formato: 'spriteforge.session',
      versao: 1,
      sessao: estado.id,
      inicio: new Date(estado.inicio).toISOString(),
      duracaoMs: agora() - estado.inicio,
      idioma: extra?.idioma ?? null,
      ambiente: extra?.ambiente ?? null,
      modelo: extra?.modelo ?? null,
      opcoes: extra?.opcoes ?? null,
      contagem: {
        eventos: estado.eventos.length,
        descartados: estado.descartados,
        downloads: estado.downloads,
        erros: estado.erros,
        ...estado.geracoes
      },
      recursosUsados: usados.map((r) => r.id),
      recursosNaoUsados: naoUsados.map((r) => r.id),
      eventos: estado.eventos
    };
  }

  /**
   * Relatório legível. É o que se cola num issue: ambiente, o que foi e o que
   * não foi usado, linha do tempo e resumo.
   * @param {{idioma?: 'pt-BR'|'en', ambiente?: string, modelo?: string, opcoes?: string}} [extra]
   */
  function texto(extra = {}) {
    const en = extra.idioma === 'en';
    const { usados, naoUsados } = inventario();
    const L = [];
    const titulo = en ? 'SpriteForge Web — session report' : 'SpriteForge Web — relatório da sessão';
    L.push('='.repeat(64), titulo, '='.repeat(64));
    L.push(en ? `session : ${estado.id}` : `sessão  : ${estado.id}`);
    L.push(en ? `started : ${new Date(estado.inicio).toISOString()}` : `início  : ${new Date(estado.inicio).toISOString()}`);
    L.push(en ? `duration: ${formatarDuracao(agora() - estado.inicio)}` : `duração : ${formatarDuracao(agora() - estado.inicio)}`);
    L.push(en
      ? `events  : ${estado.eventos.length}${estado.descartados ? ` (${estado.descartados} dropped by the cap)` : ''}`
      : `eventos : ${estado.eventos.length}${estado.descartados ? ` (${estado.descartados} descartados pelo limite)` : ''}`);

    if (extra.ambiente) {
      L.push('', en ? '--- environment ---' : '--- ambiente ---', String(extra.ambiente));
    }
    if (extra.modelo) {
      L.push('', en ? '--- model ---' : '--- modelo ---', String(extra.modelo));
    }
    if (extra.opcoes) {
      L.push('', en ? '--- options at export time ---' : '--- opções no momento da exportação ---', String(extra.opcoes));
    }

    L.push('', en ? `--- features used (${usados.length}/${RECURSOS.length}) ---` : `--- recursos usados (${usados.length}/${RECURSOS.length}) ---`);
    if (!usados.length) L.push(en ? '  (none)' : '  (nenhum)');
    for (const r of usados) {
      L.push(`  [x] ${en ? r.en : r.rotulo}  (+${formatarDuracao(r.ms)})`);
    }

    if (naoUsados.length) {
      L.push('', en ? `--- never used (${naoUsados.length}) — these are still unverified ---`
                   : `--- nunca usados (${naoUsados.length}) — continuam sem verificação ---`);
      for (const r of naoUsados) L.push(`  [ ] ${en ? r.en : r.rotulo}`);
    }

    const g = estado.geracoes;
    L.push('', en ? '--- summary ---' : '--- resumo ---');
    L.push(en
      ? `generations: ${g.iniciadas} started, ${g.concluidas} done, ${g.canceladas} canceled, ${g.falhas} failed`
      : `gerações   : ${g.iniciadas} iniciadas, ${g.concluidas} concluídas, ${g.canceladas} canceladas, ${g.falhas} falharam`);
    L.push(en ? `render time: ${formatarDuracao(g.msTotal)}` : `tempo render: ${formatarDuracao(g.msTotal)}`);
    L.push(en ? `downloads  : ${estado.downloads}` : `downloads  : ${estado.downloads}`);
    L.push(en ? `errors     : ${estado.erros}` : `erros      : ${estado.erros}`);

    L.push('', en ? '--- timeline ---' : '--- linha do tempo ---');
    if (!estado.eventos.length) L.push(en ? '  (empty)' : '  (vazia)');
    for (const ev of estado.eventos) {
      const carimbo = `[+${formatarDuracao(ev.ms)}]`.padEnd(11);
      L.push(`${carimbo}${ev.tipo.padEnd(10)}${ev.msg}`);
    }
    return L.join('\n');
  }

  /** Forma compacta para persistir entre recarregamentos. */
  function serializar() {
    return JSON.stringify({
      id: estado.id, inicio: estado.inicio, eventos: estado.eventos,
      recursos: estado.recursos, descartados: estado.descartados,
      geracoes: estado.geracoes, downloads: estado.downloads, erros: estado.erros
    });
  }

  /**
   * Recarrega uma sessão persistida. Nunca lança: dado corrompido devolve
   * `false` e a sessão atual segue intacta.
   */
  function restaurar(bruto) {
    let d;
    try {
      d = JSON.parse(bruto);
    } catch {
      return false;
    }
    if (!d || typeof d !== 'object' || !Number.isFinite(Number(d.inicio))) return false;
    estado.id = typeof d.id === 'string' ? d.id : estado.id;
    estado.inicio = Number(d.inicio);
    estado.descartados = Number.isFinite(Number(d.descartados)) ? Number(d.descartados) : 0;
    estado.downloads = Number.isFinite(Number(d.downloads)) ? Number(d.downloads) : 0;
    estado.erros = Number.isFinite(Number(d.erros)) ? Number(d.erros) : 0;
    if (d.geracoes && typeof d.geracoes === 'object') {
      for (const k of Object.keys(estado.geracoes)) {
        if (Number.isFinite(Number(d.geracoes[k]))) estado.geracoes[k] = Number(d.geracoes[k]);
      }
    }
    estado.recursos = Object.create(null);
    if (d.recursos && typeof d.recursos === 'object') {
      for (const [k, v] of Object.entries(d.recursos)) {
        if (ID_RECURSOS.has(k) && Number.isFinite(Number(v))) estado.recursos[k] = Number(v);
      }
    }
    estado.eventos = [];
    if (Array.isArray(d.eventos)) {
      for (const ev of d.eventos.slice(-CAP_EVENTOS)) {
        if (!ev || typeof ev !== 'object') continue;
        estado.eventos.push({
          ms: Number.isFinite(Number(ev.ms)) ? Number(ev.ms) : 0,
          tipo: String(ev.tipo || 'evento'),
          msg: cortar(ev.msg ?? '', 400),
          ...(ev.dados !== undefined ? { dados: ev.dados } : {})
        });
      }
    }
    return true;
  }

  return {
    estado, marcar, registrar, contarGeracao, contarDownload, contarErro,
    inventario, json, texto, serializar, restaurar
  };
}
