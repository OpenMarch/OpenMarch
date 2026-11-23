/* eslint-env node */

/**
 * Type-aware lint for the website uses the website's own TypeScript project. Without this the
 * root config's project (the repo-root tsconfig.json, which includes everything) made every
 * website lint type-check the whole monorepo, desktop app included, and run out of heap in CI.
 */
module.exports = {
    parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
    },
};
