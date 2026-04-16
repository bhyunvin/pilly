import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
];
