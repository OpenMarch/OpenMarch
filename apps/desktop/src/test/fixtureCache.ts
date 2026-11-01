import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { inject } from "vitest";

/**
 * Test databases built once per run and copied for each test.
 *
 * Building one (sql.js, the undo triggers, a data fixture's SQL and the convert to timelines)
 * cost every DB test tens of milliseconds; the result only depends on `key`, so the first
 * worker to need it builds it and the rest copy the file. Two workers can build the same key
 * at once: each writes its own file and renames it into place, and the copies are the same.
 *
 * Because one file's build is every file's database, `build` must not depend on anything a
 * test file changes: no `vi.mock` of the code it runs (migrations, undo triggers, convert on
 * open), and no fake `Date` or `setTimeout` while it runs (faking only animation frames is fine).
 */
const builtInThisProcess = new Map<string, Promise<string>>();

export async function copyCachedDatabase(
    key: string,
    destination: string,
    build: (file: string) => Promise<void>,
): Promise<void> {
    let cached = builtInThisProcess.get(key);
    if (!cached) {
        cached = cachedDatabasePath(key, build);
        builtInThisProcess.set(key, cached);
        // A failed build is retried by the next test instead of failing them all
        cached.catch(() => builtInThisProcess.delete(key));
    }
    await fs.promises.copyFile(await cached, destination);
}

async function cachedDatabasePath(
    key: string,
    build: (file: string) => Promise<void>,
): Promise<string> {
    const dir = inject("fixtureCacheDir");
    if (!dir)
        throw new Error(
            "No fixture cache folder: run with apps/desktop/vitest.config.ts (its globalSetup makes it)",
        );
    const file = path.join(dir, `${encodeURIComponent(key)}.dots`);
    if (fs.existsSync(file)) return file;
    const partial = `${file}.${randomUUID()}.partial`;
    await build(partial);
    try {
        fs.renameSync(partial, file);
    } catch (error) {
        // Windows won't replace a file another worker is copying; theirs is the same
        if (!fs.existsSync(file)) throw error;
        fs.rmSync(partial, { force: true });
    }
    return file;
}
