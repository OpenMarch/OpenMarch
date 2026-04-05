const { spawnSync } = require("node:child_process");
const path = require("node:path");

/**
 * This script exists so we can run Vitest in the Electron runtime.
 *
 * This is necessary for testing the better-sqlite3 database driver and prevents needing to rebuild the app.
 */

const isWindows = process.platform === "win32";
const electronBinary = path.resolve(
    __dirname,
    "../node_modules/.bin",
    isWindows ? "electron.cmd" : "electron",
);
const vitestEntrypoint = path.resolve(
    __dirname,
    "../node_modules/vitest/vitest.mjs",
);
const disableCanvasPreload = path.resolve(
    __dirname,
    "./vitest-disable-canvas.cjs",
);

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
let mode = "test";
const passthroughArgs = [];

for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--mode") {
        mode = rawArgs[index + 1] ?? "";
        index += 1;
        continue;
    }

    if (arg.startsWith("--mode=")) {
        mode = arg.slice("--mode=".length);
        continue;
    }

    passthroughArgs.push(arg);
}

const modeConfigs = {
    test: {
        vitestArgs: ["run", "--silent=true"],
    },
    history: {
        vitestArgs: ["run"],
        env: {
            VITEST_ENABLE_HISTORY: "true",
        },
    },
    watch: {
        vitestArgs: [],
    },
    coverage: {
        vitestArgs: ["run", "--silent=true", "--coverage"],
    },
    clearCache: {
        vitestArgs: ["--clearCache"],
    },
};

if (!modeConfigs[mode]) {
    const availableModes = Object.keys(modeConfigs).join(", ");
    console.error(
        `Invalid mode. Use --mode <mode>, where mode is one of: ${availableModes}`,
    );
    process.exit(1);
}

const selectedMode = modeConfigs[mode];
const vitestArgs = [...selectedMode.vitestArgs, ...passthroughArgs];
const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
const disableCanvasRequireArg = `--require=${disableCanvasPreload}`;
const nodeOptions = existingNodeOptions
    ? `${existingNodeOptions} ${disableCanvasRequireArg}`
    : disableCanvasRequireArg;

const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    // Keep jsdom from loading node-canvas native bindings in CI.
    // canvas can preload an older libstdc++.so.6 that breaks better-sqlite3.
    NODE_OPTIONS: nodeOptions,
    ...(selectedMode.env ?? {}),
};

const result = spawnSync(electronBinary, [vitestEntrypoint, ...vitestArgs], {
    stdio: "inherit",
    env,
});

if (result.error) {
    console.error(result.error);
    process.exit(1);
}

process.exit(result.status ?? 1);
