// Flat ESLint config (ESLint v9). One root config covers every package — the
// repo is ESM throughout. Prettier owns formatting; ESLint owns code quality +
// the repo's naming conventions (see README — Conventions & coding rules).
import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  // Not project source: deps, build output, the backend data plane (node
  // bodies / state / assets — sandboxed user content), and the Deno service
  // (lint that with deno's own tooling, not here).
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'kernel/data/**',
      'runtime/executions/**',
      'runtime/state/**',
      'ws-exchange/**',
      'experiments/js-engine/program.yo',
    ],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // House rules — encode the repo conventions + ESM. Applies to all JS and Vue.
  {
    files: ['**/*.js', '**/*.vue'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      // README convention: no single-letter variable names, EXCEPT i/j/k as numeric
      // loop counters (exempted below). The ~150 pre-existing single-letter names
      // (callback args, catch errors, graphics math, the `yo` interpreter) were
      // renamed to descriptive names; only i/j/k loop indices remain, by design.
      // Kept as 'warn'; bump to 'error' to hard-enforce once it's proven stable.
      'id-length': ['warn', { min: 2, properties: 'never', exceptions: ['_', 'i', 'j', 'k'] }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      // Node-type components are intentionally single-word (Scene, Html, …).
      'vue/multi-word-component-names': 'off',
      // The editor edits the `node` prop in place, then persists via store.save()
      // — a deliberate edit-in-place model, not accidental prop mutation. (A future
      // refactor to store actions / emits could re-enable this.)
      'vue/no-mutating-props': 'off',
      // The `html` node renders its own stored HTML by design — a single-user
      // local tool over trusted local content, not untrusted input.
      'vue/no-v-html': 'off',
    },
  },

  // Node runtime: everything except the frontend app source.
  {
    files: ['**/*.js'],
    ignores: ['frontend/src/**'],
    languageOptions: { globals: globals.node },
  },

  // Browser runtime: the Vue editor.
  {
    files: ['frontend/src/**/*.{js,vue}'],
    languageOptions: { globals: globals.browser },
  },

  // Keep last: turn off stylistic rules that would fight Prettier.
  prettier,
]
