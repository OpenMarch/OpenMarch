module.exports = {
    "src/**/*.{js,jsx,ts,tsx,json,css}": [
        "eslint --fix --max-warnings 0",
        "prettier --write --ignore-unknown",
        "cspell --no-must-find-files",
    ],
};
