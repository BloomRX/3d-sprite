/** Registra o hook acima. Uso: node --import ./tests/spriteforge/register-three.mjs <teste>.mjs */
import { register } from 'node:module';
register('./three-resolver.mjs', import.meta.url);
