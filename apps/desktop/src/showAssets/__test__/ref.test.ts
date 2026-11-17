import { describe, expect, it } from "vitest";
import { parseShowAssetRef, showAssetRefValue } from "../ref";
import { pitModelName } from "@/view3d/core/pit/pitModels";

const HASH = "ab".repeat(32);
const ID = "7f1c2a90-0000-4000-8000-000000000001";

describe("show asset references", () => {
    it("writes library:<id>@<hash> and reads it back", () => {
        const value = showAssetRefValue({ id: ID, versionHash: HASH });
        expect(value).toBe(`library:${ID}@${HASH}`);
        expect(parseShowAssetRef(value)).toEqual({ id: ID, versionHash: HASH });
    });

    it("names no show asset for built-in ids, nothing, or a malformed value", () => {
        for (const value of [
            null,
            undefined,
            "",
            "pit/marimba-4.3",
            `library:${ID}`,
            `library:@${HASH}`,
            `library:${ID}@${HASH.toUpperCase()}`,
            `library:${ID}@${HASH}0`,
            `library:a b@${HASH}`,
        ])
            expect(parseShowAssetRef(value)).toBeNull();
    });

    it("refuses to write a reference it couldn't read back", () => {
        expect(() =>
            showAssetRefValue({ id: "a@b", versionHash: HASH }),
        ).toThrow(/id/);
        expect(() => showAssetRefValue({ id: ID, versionHash: "abc" })).toThrow(
            /hash/,
        );
    });

    it("is no built-in model, so a build that can't draw it draws a block", () => {
        expect(
            pitModelName(showAssetRefValue({ id: ID, versionHash: HASH })),
        ).toBe(null);
    });
});
