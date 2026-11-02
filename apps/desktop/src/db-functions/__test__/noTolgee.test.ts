// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The write path runs in the convert-on-open worker and the web build's worker too, which don't
 * load Tolgee. Its refusals carry their text as keys (`text.t`) and are translated where they're
 * shown; its logs use `timelineTextForLog`. So no db-functions module imports Tolgee, directly or
 * through `translateTimelineText`.
 */
describe("db-functions", () => {
    it("never imports Tolgee", () => {
        const dir = resolve(__dirname, "..");
        const offenders = readdirSync(dir)
            .filter((name) => /\.tsx?$/.test(name))
            .filter((name) =>
                /from\s+["'](?:@tolgee\/|@\/global\/singletons\/Tolgee|@\/timeline\/translateTimelineText)/.test(
                    readFileSync(resolve(dir, name), "utf8"),
                ),
            );
        expect(offenders).toEqual([]);
    });
});
