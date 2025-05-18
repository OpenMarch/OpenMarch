/* eslint-env node */
module.exports = {
    extends: ["eslint:recommended", "react-app", "plugin:astro/recommended"],
    ignorePatterns: [
        "**/node_modules/*",
        "**/dist/*",
        "**/dist-electron/*",
        "**/build/*",
        "**/src/styles/**/*.css",
    ],
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
    plugins: ["eslint-plugin-react"],
    rules: {
        "@typescript-eslint/no-var-requires": "off",
        "react/prop-types": "warn",
        "react/no-unescaped-entities": "warn",
        "react/jsx-key": "warn",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "max-lines-per-function": [
            "off",
            {
                max: 80,
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
        {
            // Define the configuration for `.astro` file.
            files: ["*.astro"],
            // Allows Astro components to be parsed.
            parser: "astro-eslint-parser",
            // Parse the script in `.astro` as TypeScript by adding the following configuration.
            // It's the setting you need when using TypeScript.
            parserOptions: {
                parser: "@typescript-eslint/parser",
                extraFileExtensions: [".astro"],
            },
            rules: {
                // override/add rules settings here, such as:
                // "astro/no-set-html-directive": "error"
            },
        },
    ],
    settings: {
        react: {
            version: "detect",
        },
    },
};
