/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Minimal ESLint flat config. Currently enforces a single rule:
 * `@typescript-eslint/no-explicit-any` must be an error across all
 * TypeScript source files (see CLAUDE.md's ban on `any`).
 */

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**', 'packages/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
