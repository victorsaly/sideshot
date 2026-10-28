import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.sideshot/'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Sent to a browser page as source and run there, so the page's globals, not Node's.
  {
    files: ['skills/sideshot/scripts/draw.mjs'],
    languageOptions: { globals: globals.browser },
  },
  // The e2e tests hand small functions to page.evaluate, which run in the page.
  {
    files: ['test/e2e/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
