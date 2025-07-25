/**
 * @license Business Source License 1.1
 * See LICENSE.txt for usage restrictions and change date.
 */

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
    expoConfig,
    {
        ignores: ["dist/*"],
        plugins: ["eslint-plugin-header"],
    },
]);
