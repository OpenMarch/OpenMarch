/* eslint-env node */
module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    root: true,
    globals: {
        console: "readonly",
        exports: "readonly",
    },
    env: {
        node: true,
        es6: true,
    },
    rules: {
        "@typescript-eslint/no-var-requires": "off"
    }
  };
