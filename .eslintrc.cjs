/* eslint-env node */
module.exports = {
    extends: ["eslint:recommended", "react-app"],
    parser: "@typescript-eslint/parser",
    root: true,
    globals: {
        console: "readonly",
        exports: "readonly",
    },
    env: {
        node: true,
        es6: true,
    },
    plugins: ["eslint-plugin-react", "eslint-plugin-react-hooks"],
    rules: {
        "@typescript-eslint/no-var-requires": "off",
        "react/prop-types": "warn",
        "react/no-unescaped-entities": "warn",
        "react/jsx-key": "warn",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "max-lines-per-function": [
            "warn",
            {
                skipBlankLines: true,
                skipComments: true,
            },
        ],
    },
    overrides: [
        {
            // Disable for tests and React components
            files: ["*.test.ts*", "src/components/**/*.tsx"],
            rules: {
                "max-lines-per-function": "off",
            },
        },
    ],
    settings: {
        react: {
            version: "detect",
        },
    },
};
