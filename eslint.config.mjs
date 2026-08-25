import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';
import reactPlugin from 'eslint-plugin-react';

export default [
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      'unused-imports': unusedImports,
      react: reactPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        jsxPragma: null, // react-jsx transform — React not required in scope
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // New JSX transform — React import is never required
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Flag and autofix unused imports (warn-only; promote to error after first clean CI run)
      'unused-imports/no-unused-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
