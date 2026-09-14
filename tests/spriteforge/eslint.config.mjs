/**
 * Lint do app (core.js + app.js). Roda do repo inteiro, sem package.json:
 *
 *   npx eslint --no-config-lookup -c tests/spriteforge/eslint.config.mjs \
 *     spriteforge/app/app.js spriteforge/app/core.js
 *
 * Só regras que pegam erro de verdade (referência inexistente, variável morta,
 * chave duplicada): estilo não vale o ruído num app de arquivo único.
 */
import globals from 'globals';

export default [
  {
    files: ['spriteforge/app/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-const-assign': 'error',
      // Sombrear um nome do escopo externo já causou bug real aqui: um stream
      // chamado `gravador` escondeu o gravador de sessão e `.marcar()` estourou.
      'no-shadow': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'getter-return': 'error'
    }
  }
];
