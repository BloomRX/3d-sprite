/**
 * Pasta de saída — para os arquivos saírem na pasta do app em vez da pasta de
 * downloads do navegador.
 *
 * O navegador não deixa um site escrever onde quiser: é preciso o usuário
 * escolher a pasta UMA vez (File System Access API). Depois disso o handle fica
 * guardado no IndexedDB — `localStorage` não serve, porque um
 * FileSystemDirectoryHandle não vira string, e o IndexedDB guarda o objeto
 * clonado de verdade.
 *
 * Sem a API (Firefox, Safari, ou `file://`) tudo cai no download comum, então
 * nada quebra: o app apenas volta ao comportamento antigo.
 *
 * As funções de decisão são puras (recebem os handles por parâmetro) para serem
 * testáveis em Node; só as que tocam `window`/`indexedDB` precisam de navegador.
 */

const NOME_DB = 'spriteforge';
const NOME_LOJA = 'pastas';
const CHAVE_SAIDA = 'saida';
const VERSAO_DB = 1;

/** A API existe neste navegador? */
export function apiDisponivel() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Abre o seletor de pasta. Devolve o handle, ou `null` se o usuário cancelou. */
export async function escolherPasta() {
  if (!apiDisponivel()) return null;
  try {
    return await window.showDirectoryPicker({ id: 'spriteforge-saida', mode: 'readwrite' });
  } catch (err) {
    if (err && err.name === 'AbortError') return null;   // cancelou: não é erro
    throw err;
  }
}

/**
 * Confere (e, se preciso, pede) permissão de escrita.
 *
 * Depois de reabrir o navegador a permissão volta a `prompt`, e
 * `requestPermission` só pode ser chamado a partir de um gesto do usuário — por
 * isso este módulo nunca pede sozinho na inicialização: quem chama decide.
 */
export async function permissaoOk(handle, pedir = true) {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  const opcoes = { mode: 'readwrite' };
  let estado = await handle.queryPermission(opcoes);
  if (estado === 'granted') return true;
  if (!pedir) return false;
  estado = await handle.requestPermission(opcoes);
  return estado === 'granted';
}

/**
 * Escreve um arquivo na pasta, sobrescrevendo se já existir.
 * Sobrescrever é o comportamento certo aqui: regenerar a sheet com o mesmo nome
 * deve substituir a anterior, não criar `sheet (1).png`.
 */
export async function escreverArquivo(dirHandle, nome, dados) {
  const arquivo = await dirHandle.getFileHandle(nome, { create: true });
  const fluxo = await arquivo.createWritable();
  try {
    await fluxo.write(dados);
  } finally {
    await fluxo.close();     // fecha mesmo se o write falhar
  }
  return nome;
}

/**
 * Nome seguro para arquivo. O navegador já sanitiza no download, mas aqui o nome
 * vira entrada de sistema de arquivos de verdade, então vale garantir.
 */
export function nomeSeguro(nome, substituto = 'saida') {
  const limpo = String(nome ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')     // inválidos no Windows
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo || limpo === '.' || limpo === '..') return substituto;
  return limpo.slice(0, 180);
}

/** Decide para onde um arquivo vai: pasta escolhida ou download. */
export function destinoArquivo(dirHandle, temPermissao) {
  return dirHandle && temPermissao ? 'pasta' : 'download';
}

/* ------------------------- IndexedDB ------------------------- *
 * Aberto sob demanda e fechado a cada uso: manter a conexão aberta segura uma
 * trava que atrapalha upgrades de versão depois.
 */
function abrirDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB indisponível'));
      return;
    }
    const pedido = indexedDB.open(NOME_DB, VERSAO_DB);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(NOME_LOJA)) db.createObjectStore(NOME_LOJA);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

/** Guarda a pasta escolhida. Silencioso se não der: o app segue com download. */
export async function guardarPasta(handle) {
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const pedido = db.transaction(NOME_LOJA, 'readwrite').objectStore(NOME_LOJA).put(handle, CHAVE_SAIDA);
      pedido.onsuccess = () => resolve();
      pedido.onerror = () => reject(pedido.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Recupera a pasta salva, ou `null`. Nunca lança. */
export async function lerPasta() {
  try {
    const db = await abrirDb();
    const handle = await new Promise((resolve, reject) => {
      const pedido = db.transaction(NOME_LOJA, 'readonly').objectStore(NOME_LOJA).get(CHAVE_SAIDA);
      pedido.onsuccess = () => resolve(pedido.result ?? null);
      pedido.onerror = () => reject(pedido.error);
    });
    db.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

/** Esquece a pasta salva. */
export async function esquecerPasta() {
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const pedido = db.transaction(NOME_LOJA, 'readwrite').objectStore(NOME_LOJA).delete(CHAVE_SAIDA);
      pedido.onsuccess = () => resolve();
      pedido.onerror = () => reject(pedido.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}
