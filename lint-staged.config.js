module.exports = {
    "*.{js,jsx,ts,tsx,astro}": [
        "cspell --no-must-find-files",
        "eslint --fix",
        "prettier --write --ignore-unknown",
    ],
    "*.{json,yml,yaml,json5,md,mdx,mdc}": [
        "cspell --no-must-find-files",
        "prettier --write --ignore-unknown",
    ],
    // Checks the whole desktop app once, whichever of these files changed.
    "apps/desktop/{src/**/*.{ts,tsx},i18n/en.json,i18n-meta/*.json}": () =>
        "pnpm check:i18n",
};
