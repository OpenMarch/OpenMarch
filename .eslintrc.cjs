/* eslint-env node */
module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'react', 'react-hooks'],
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
        "@typescript-eslint/no-var-requires": "off",
        "react/prop-types": "warn",
        "react/no-unescaped-entities": "warn",
        "react/jsx-key": "warn",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn"
    },
    "settings": {
      "react": {
        "version": "detect"
      }
    }
  };
