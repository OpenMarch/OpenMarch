import fs from "fs";
import os from "os";
import path from "path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
    export interface ProvidedContext {
        /** Where this run's built test databases go (see ./fixtureCache.ts) */
        fixtureCacheDir: string;
    }
}

/**
 * Makes one folder per run for the test databases the fixtures build, so every worker
 * reuses them. Each watch-mode rerun gets a new folder, so a changed migration, fixture or
 * converter never hits a database the old code built, and a run still copying from the old
 * folder keeps it until teardown.
 */
export default function setup(project: TestProject) {
    const parent = path.join(os.tmpdir(), "openmarch-test");
    fs.mkdirSync(parent, { recursive: true });
    const dirs: string[] = [];
    const startNewFolder = () => {
        const dir = fs.mkdtempSync(path.join(parent, "fixture-cache-"));
        dirs.push(dir);
        project.provide("fixtureCacheDir", dir);
    };
    startNewFolder();
    project.onTestsRerun(startNewFolder);
    return () => {
        for (const dir of dirs)
            fs.rmSync(dir, { recursive: true, force: true });
    };
}
