/**
 * Hook de resolução do Node: faz o especificador "three" (que no navegador é
 * resolvido pelo importmap do index.html) apontar para o arquivo VENDIDO. Assim
 * os testes rodam sem npm install e exercitam a mesma biblioteca do app.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const VENDOR = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../spriteforge/app/vendor/three.module.js');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return nextResolve(pathToFileURL(VENDOR).href, context);
  return nextResolve(specifier, context);
}
