/* eslint-env node */

/**
 * Class names that bypass the theme's tokens (docs/conventions/ui-styling.md), as
 * no-restricted-syntax entries for string literals and template strings.
 */
function uiStyleRestrictions() {
    const checks = [
        {
            // text-[11px], text-[0.8rem]: use text-micro / text-sub / text-body / text-h*
            pattern: String.raw`(^|[\s:"'\x60])text-\[\d`,
            message:
                "Use a theme font size (text-sub, text-body, text-h5..h1; text-micro only for timeline/tempo lane labels), not text-[Npx]. See docs/conventions/ui-styling.md.",
        },
        {
            // rounded-[3px], rounded-t-[5px]; rounded-2 / rounded-sm etc. aren't the theme's radii
            pattern: String.raw`(^|[\s:"'\x60])rounded(-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-(\[|(2|xs|sm|md|lg|xl|2xl|3xl)($|[\s"'\x60]))`,
            message:
                "Use a theme radius (rounded-4, rounded-6, rounded-8, ..., rounded-full), not rounded-[..] or Tailwind's default names; rounded-2 does not exist. See docs/conventions/ui-styling.md.",
        },
    ];
    return checks.flatMap(({ pattern, message }) => [
        { selector: `Literal[value=/${pattern}/]`, message },
        { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
    ]);
}

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
        "**/dist-browser/*",
        "**/dist-browser-host/*",
        "**/dist-web/**",
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
            // UI style tokens (docs/conventions/ui-styling.md): font sizes and corner radii
            // come from the theme in packages/ui/src/tailwind.css, never one-off values
            files: [
                "apps/desktop/src/**/*.{ts,tsx}",
                "packages/ui/src/**/*.{ts,tsx}",
            ],
            excludedFiles: ["**/__test__/**", "**/*.test.*", "**/*.stories.*"],
            rules: {
                "no-restricted-syntax": [
                    "error",
                    "WithStatement",
                    ...uiStyleRestrictions(),
                ],
            },
        },
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
