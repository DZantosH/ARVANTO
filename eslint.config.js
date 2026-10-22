const js = require('@eslint/js');
const ts = require('typescript-eslint');
module.exports = ts.config({ignores: ['android/**', 'node_modules/**']}, js.configs.recommended, ...ts.configs.recommended, {files: ['**/*.{js,ts,tsx}'], languageOptions: {globals: {require: 'readonly', module: 'readonly', __dirname: 'readonly', console: 'readonly', setTimeout: 'readonly'}}, rules: {'@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}]}});
