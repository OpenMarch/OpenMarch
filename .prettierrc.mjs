/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
    tabWidth: 4,
    useTabs: false,
    // prettier-plugin-tailwindcss MUST be loaded last
    plugins: [
        "prettier-plugin-astro",
        "prettier-plugin-tailwindcss", // MUST be last
    ],
    overrides: [
        {
            files: ["*.md", "*.mdx", "*.yaml"],
            options: {
                tabWidth: 2,
                useTabs: false,
            },
        },
    ],
};

export default config;
