// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import astroPlugin from "eslint-plugin-astro";
import tanstackQueryPlugin from "@tanstack/eslint-plugin-query";
import globals from "globals";

const tempRules = {
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/require-await": "warn",
    "@typescript-eslint/unbound-method": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/await-thenable": "warn",
    "@typescript-eslint/no-unused-expressions": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-wrapper-object-types": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "@typescript-eslint/no-misused-promises": "warn",
};

export default tseslint.config(
    // Global ignores
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/dist-electron/**",
            "**/build/**",
            "**/release/**",
            "**/src/styles/**/*.css",
            "eslint.config.mjs",
            "**/astro.d.ts",
            "**/.astro/**",
        ],
    },

    // Base ESLint recommended rules
    eslint.configs.recommended,

    // TypeScript configuration with type-aware linting
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    // React configuration for JS/TS/JSX/TSX files
    {
        files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
        ...reactPlugin.configs.flat.recommended,
        ...reactPlugin.configs.flat["jsx-runtime"],
        languageOptions: {
            ...reactPlugin.configs.flat.recommended.languageOptions,
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },

    // React Hooks configuration
    {
        files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
        plugins: {
            "react-hooks": reactHooksPlugin,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },

    // TanStack Query configuration
    {
        files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
        plugins: {
            "@tanstack/query": tanstackQueryPlugin,
        },
        rules: {
            ...tanstackQueryPlugin.configs.recommended.rules,
        },
    },

    // Astro configuration
    ...astroPlugin.configs.recommended,

    // Custom rules for all files
    {
        files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
        rules: {
            "no-console": [
                "warn",
                {
                    allow: ["error", "warn", "debug"],
                },
            ],
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-floating-promises": "error",
            "react/prop-types": "warn",
            "react/no-unescaped-entities": "warn",
            "react/jsx-key": "warn",
            "react-hooks/rules-of-hooks": "warn",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "max-lines-per-function": [
                "warn",
                {
                    max: 80,
                    skipBlankLines: true,
                    skipComments: true,
                },
            ],
            // Temporary rule disables in new flat configs
            ...tempRules,
            "@tanstack/query/no-void-query-fn": "warn",
        },
    },
    {
        files: ["**/*.mts"],
        rules: {
            ...tempRules,
        },
    },

    // Disable max-lines-per-function for tests and React components
    {
        files: ["**/*.test.ts*", "**/*.tsx"],
        rules: {
            "max-lines-per-function": "off",
        },
    },

    // Astro file specific configuration
    {
        files: ["**/*.astro"],
        rules: {
            // Disable React rules for Astro files
            "react/jsx-key": "off",
            "react/no-unknown-property": "off",
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "react/no-unescaped-entities": "off",
        },
    },

    // Disable type-checked rules for JavaScript files
    {
        files: ["**/*.{js,mjs,cjs}"],
        ...tseslint.configs.disableTypeChecked,
    },
);
