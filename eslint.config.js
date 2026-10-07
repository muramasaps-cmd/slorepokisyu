import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist', 'node_modules', '*.config.js', '*.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
      'no-irregular-whitespace': 'off',
      'no-empty': 'warn',
    },
  }
);
