import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * One temp folder per test run for electron-store's files (see
 * src/__mocks__/electron.ts). Workers are stopped without a normal exit, so
 * the run removes the folder here rather than each worker on exit.
 */
export default function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-vitest-"));
    process.env.OPENMARCH_VITEST_USER_DATA = dir;
    return () => fs.rmSync(dir, { recursive: true, force: true });
}
