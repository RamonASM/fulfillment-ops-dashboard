// Minimal ESLint 9.x configuration
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.cache/**'],
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
];
