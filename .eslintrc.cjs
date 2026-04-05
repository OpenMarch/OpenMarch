/* eslint-env node */
module.exports = {
    extends: [
        "eslint:recommended",
        "react-app",
        "plugin:astro/recommended",
        "plugin:@tanstack/query/recommended",
    ],
    ignorePatterns: [
        "**/node_modules/*",
        "**/dist/*",
        "**/dist-electron/*",
        "**/build/*",
        "**/src/styles/**/*.css",
        ".eslintrc.cjs",
        "**/astro.d.ts",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
    },
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
        "no-console": [
            "warn",
            {
                allow: ["error", "warn", "debug"],
            },
        ],
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-floating-promises": "error",
        "react/prop-types": "warn",
        "react/no-unescaped-entities": "warn",
        "react/jsx-key": "warn",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "max-lines-per-function": [
            "warn",
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
            files: ["*.test.ts*", "**/*.tsx"],
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
            rules: Object.keys(require("eslint-plugin-react").rules).reduce(
                (acc, rule) => {
                    acc[`react/${rule}`] = "off";
                    return acc;
                },
                {},
            ),
        },
    ],
    settings: {
        react: {
            version: "detect",
        },
    },
};
