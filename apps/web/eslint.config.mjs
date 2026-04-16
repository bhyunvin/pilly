import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      sonarjs,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      'sonarjs/cognitive-complexity': ['error', 15],
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/label-has-associated-control': [
        'error',
        {
          labelComponents: ['Label'],
          labelAttributes: ['htmlFor'],
          controlComponents: ['Input', 'Textarea', 'Select', 'Checkbox'],
          depth: 3,
        },
      ],
    },
  },
];
