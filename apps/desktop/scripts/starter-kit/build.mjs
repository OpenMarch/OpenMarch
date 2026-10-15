// Builds the Blender Starter kit's generated files (package C1.13):
// templates/*.blend, examples/*.glb and the glTF export preset, then the
// pre-flight cases the app's tests import. Needs Blender 4.2 LTS or later;
// set BLENDER to its executable when it isn't on PATH or in the usual place.
//
//   pnpm --filter @openmarch/desktop run kit:build
//
// The tests use the committed outputs and never need Blender.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "../..");
const kit = path.join(desktop, "starter-kit");
const cases = path.join(desktop, "electron/main/starter-kit/__test__/fixtures");

function findBlender() {
    if (process.env.BLENDER) return process.env.BLENDER;
    const usual = {
        darwin: "/Applications/Blender.app/Contents/MacOS/Blender",
        win32: "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    }[process.platform];
    return usual && existsSync(usual) ? usual : "blender";
}

const blender = findBlender();
for (const [script, ...args] of [
    ["build_kit.py", kit],
    ["preflight_cases.py", kit, cases],
]) {
    const result = spawnSync(
        blender,
        [
            "--background",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "--python",
            path.join(here, script),
            "--",
            ...args,
        ],
        { stdio: "inherit" },
    );
    if (result.error) {
        console.error(
            `Couldn't run Blender (${blender}): ${result.error.message}`,
        );
        process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
}

// Python writes the JSON; prettier owns its layout.
spawnSync(
    "pnpm",
    ["exec", "prettier", "--write", path.join(cases, "predictions.json")],
    { stdio: "inherit", cwd: desktop, shell: process.platform === "win32" },
);
