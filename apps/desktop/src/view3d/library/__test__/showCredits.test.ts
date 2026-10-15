import { describe, expect, it } from "vitest";
import { creditText, licenseLabel, showCredits } from "../showCredits";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";

const h = (c: string) => c.repeat(64);
let next = 0;
const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

function item(
    name: string,
    license: string,
    patch: Partial<ShowLibraryItem> & {
        meta?: Partial<ShowLibraryItem["metadata"]>;
    } = {},
): ShowLibraryItem {
    const { meta, ...rest } = patch;
    return {
        itemId: id(),
        versionHash: h("a"),
        kind: "artwork",
        name,
        builtIn: false,
        metadata: {
            tags: [],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            originalFilename: null,
            derivedFrom: null,
            license,
            licenseText: null,
            author: null,
            sourceUrl: null,
            attribution: null,
            modified: false,
            ...meta,
        },
        pins: [],
        parts: {},
        sidecar: null,
        embeddedAt: "2026-10-01T00:00:00.000Z",
        ...rest,
    };
}

describe("showCredits", () => {
    it("lists one CC-BY and one Unknown item, counts the rest and shows the Share note", () => {
        const credits = showCredits([
            item("Sunrise silk", "CC-BY-4.0", { meta: { author: "Ana" } }),
            item("Mystery flag", "LicenseRef-Unknown"),
            item("Plain floor", "CC0-1.0"),
            item("Band default", "CC0-1.0", { builtIn: true }),
            item("Built-in riser", "CC-BY-4.0", { builtIn: true }),
        ]);
        expect(credits.groups.map((g) => g.license)).toEqual([
            "CC-BY-4.0",
            "LicenseRef-Unknown",
        ]);
        expect(credits.groups[0].lines.map((l) => l.name)).toEqual([
            "Sunrise silk",
        ]);
        expect(credits.groups[1].lines.map((l) => l.name)).toEqual([
            "Mystery flag",
        ]);
        expect(credits.uncredited).toBe(3);
        expect(credits.shareNote).toBe(true);
    });

    it("has no Share note without Unknown items", () => {
        const credits = showCredits([
            item("Sunrise silk", "CC-BY-4.0"),
            item("Logo", "LicenseRef-Proprietary"),
        ]);
        expect(credits.shareNote).toBe(false);
        expect(credits.groups.map((g) => g.license)).toEqual([
            "CC-BY-4.0",
            "LicenseRef-Proprietary",
        ]);
    });

    it("orders CC-BY groups first, other licenses next, Unknown last, names within", () => {
        const credits = showCredits([
            item("Zed", "LicenseRef-Unknown"),
            item("Mid", "MIT"),
            item("B", "CC-BY-SA-4.0"),
            item("Beta", "CC-BY-4.0"),
            item("Alpha", "CC-BY-4.0"),
        ]);
        expect(credits.groups.map((g) => g.license)).toEqual([
            "CC-BY-4.0",
            "CC-BY-SA-4.0",
            "MIT",
            "LicenseRef-Unknown",
        ]);
        expect(credits.groups[0].lines.map((l) => l.name)).toEqual([
            "Alpha",
            "Beta",
        ]);
    });

    it("counts an item embedded in several Versions once, with its newest metadata", () => {
        const first = item("Silk", "LicenseRef-Unknown", {
            embeddedAt: "2026-10-01T00:00:00.000Z",
        });
        const corrected = item("Silk", "CC-BY-4.0", {
            itemId: first.itemId,
            versionHash: h("b"),
            embeddedAt: "2026-10-05T00:00:00.000Z",
            meta: { author: "Ana" },
        });
        const credits = showCredits([corrected, first]);
        expect(credits.groups).toHaveLength(1);
        expect(credits.groups[0].lines[0]).toMatchObject({
            license: "CC-BY-4.0",
            author: "Ana",
        });
        expect(credits.shareNote).toBe(false);
    });

    it("is empty for a show with nothing embedded", () => {
        expect(showCredits([])).toEqual({
            groups: [],
            uncredited: 0,
            shareNote: false,
        });
    });
});

describe("creditText", () => {
    const line = {
        itemId: "x",
        name: "Sunrise silk",
        author: "Ana",
        license: "CC-BY-4.0",
        sourceUrl: "https://example.com/sunrise",
        attribution: null,
        modified: true,
    };

    it("reads Name — Author — License — Source (modified)", () => {
        expect(creditText(line, "CC-BY-4.0")).toBe(
            "Sunrise silk — Ana — CC-BY-4.0 — https://example.com/sunrise (modified)",
        );
    });

    it("leaves out what's missing", () => {
        expect(
            creditText(
                { ...line, author: null, sourceUrl: null, modified: false },
                "Unknown license",
            ),
        ).toBe("Sunrise silk — Unknown license");
    });
});

describe("licenseLabel", () => {
    const words = {
        unknown: "Unknown license",
        proprietary: "All rights reserved",
    };
    it("puts words to the LicenseRef ids and keeps SPDX ids", () => {
        expect(licenseLabel("LicenseRef-Unknown", words)).toBe(
            "Unknown license",
        );
        expect(licenseLabel("LicenseRef-Proprietary", words)).toBe(
            "All rights reserved",
        );
        expect(licenseLabel("CC-BY-4.0", words)).toBe("CC-BY-4.0");
    });
});
