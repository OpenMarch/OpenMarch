import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lastShowFolder } from "../last-show-folder";

const drafts = join("/data", "new-show-drafts");
const isDraft = (p: string) => p.startsWith(drafts);
const show = join("/shows", "fall", "opener.dots");
const recent = join("/shows", "spring", "closer.dots");

describe("lastShowFolder", () => {
    it("uses the open show's folder", () => {
        expect(lastShowFolder(show, [recent], isDraft)).toBe(dirname(show));
    });

    it("falls back to the most recent show after a show is closed", () => {
        expect(lastShowFolder("", [recent, show], isDraft)).toBe(
            dirname(recent),
        );
        expect(lastShowFolder(undefined, [recent], isDraft)).toBe(
            dirname(recent),
        );
    });

    it("never starts in the new-show draft folder", () => {
        const draft = join(drafts, "abc.dots");
        expect(lastShowFolder(draft, [recent], isDraft)).toBe(dirname(recent));
        expect(lastShowFolder(draft, [], isDraft)).toBeUndefined();
    });

    it("has no folder when nothing was ever opened", () => {
        expect(lastShowFolder("", [], isDraft)).toBeUndefined();
    });
});
