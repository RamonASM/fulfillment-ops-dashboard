// Minimal ESLint 9.x configuration
// Export array with a single config object to silence empty config warning
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.cache/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
];
