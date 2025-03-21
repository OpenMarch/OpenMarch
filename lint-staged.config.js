module.exports = {
    "*.{js,jsx,ts,tsx}": [
        "eslint --fix --max-warnings 0",
        "prettier --write --ignore-unknown",
        "cspell --no-must-find-files",
    ],
};
