module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: ['dist'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  }
};
