module.exports = {
    "*.{js,jsx,ts,tsx,astro}": [
        "eslint --fix",
        "prettier --write --ignore-unknown",
        "cspell --no-must-find-files",
    ],
    "*.{json,md,mdx}": [
        "prettier --write --ignore-unknown",
        "cspell --no-must-find-files",
    ],
};
