/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
    tabWidth: 4,
    useTabs: false,
    plugins: ["prettier-plugin-tailwindcss", "prettier-plugin-astro"],
    overrides: [
        {
            files: ["*.md", "*.mdx"],
            options: {
                tabWidth: 2,
                useTabs: false,
            },
        },
    ],
};

export default config;
