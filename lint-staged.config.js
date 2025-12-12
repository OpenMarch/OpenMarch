module.exports = {
    "*.{js,jsx,ts,tsx,astro}": [
        "cspell --no-must-find-files",
        "eslint --fix",
        "prettier --write --ignore-unknown",
    ],
    "*.{json,md,mdx}": [
        "cspell --no-must-find-files",
        "prettier --write --ignore-unknown",
    ],
};
