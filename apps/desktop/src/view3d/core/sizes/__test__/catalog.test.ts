// @vitest-environment node
// cspell:words demoulin styleplus
import { describe, expect, it } from "vitest";
import {
    SIZE_CATALOG,
    catalogDims,
    catalogEntryMatches,
    silkDepthM,
    catalogEntries,
    catalogEntry,
    defaultCatalogEntry,
    type CatalogEntry,
    type SizeKind,
    type SourcedLength,
} from "../catalog";
import { formatLength, fromMeters, parseLength, toMeters } from "../units";

const KINDS: SizeKind[] = [
    "pole",
    "swingPole",
    "tPole",
    "silk",
    "rifle",
    "sabre",
    "floor",
    "flatProp",
];

function sourcedLengths(entry: CatalogEntry): SourcedLength[] {
    return Object.values(entry.dims).flatMap(
        (v: SourcedLength | readonly SourcedLength[]) =>
            Array.isArray(v) ? v : [v as SourcedLength],
    );
}

describe("SIZE_CATALOG", () => {
    it("has unique ids", () => {
        const ids = SIZE_CATALOG.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("names a source for every entry", () => {
        for (const entry of SIZE_CATALOG) {
            expect(entry.sources.length, entry.id).toBeGreaterThan(0);
            for (const source of entry.sources) {
                expect(source.name.trim(), entry.id).not.toBe("");
                expect(["verified", "snippet", "unverified"]).toContain(
                    source.confidence,
                );
                if (source.url) expect(source.url).toMatch(/^https:\/\//);
            }
        }
    });

    it("covers every kind", () => {
        for (const kind of KINDS)
            expect(catalogEntries(kind).length, kind).toBeGreaterThan(0);
    });

    it("stores sizes in their source unit", () => {
        for (const entry of SIZE_CATALOG)
            for (const length of sourcedLengths(entry)) {
                expect(["in", "ft"]).toContain(length.unit);
                expect(length.value).toBeGreaterThan(0);
            }
    });

    it("has the spec's sizes", () => {
        const lengths = (kind: SizeKind) =>
            catalogEntries(kind).map((e) => {
                const d = e.dims as { length: SourcedLength };
                return `${d.length.value} ${d.length.unit}`;
            });
        expect(lengths("pole")).toEqual([
            "5 ft",
            "5.5 ft",
            "6 ft",
            "6.5 ft",
            "7 ft",
            "8 ft",
        ]);
        expect(lengths("swingPole")).toEqual([
            "24 in",
            "30 in",
            "36 in",
            "42 in",
            "48 in",
            "52 in",
        ]);
        expect(lengths("rifle")).toEqual(["36 in", "37.5 in", "39 in"]);
        expect(lengths("sabre")).toEqual(["32 in", "36 in", "39 in"]);
        expect(
            catalogEntries("silk").map(
                (e) =>
                    `${e.dims.header.value} x ${e.dims.fly.value}` +
                    (e.dims.depth ? `, ${e.dims.depth.value} deep` : ""),
            ),
        ).toEqual([
            "30 x 46",
            "33 x 50",
            "36 x 54",
            "42 x 60",
            "36 x 56",
            "42 x 67",
            "44 x 74, 79.625 deep",
            "44 x 66",
            "44 x 68, 84 deep",
            "42 x 56, 84 deep",
            "45 x 78.625, 96 deep",
            "44 x 94, 56 deep",
            "54 x 100, 87 deep",
        ]);
        expect(catalogEntry("pole-8ft")?.special).toBe(true);
    });

    it("pairs silks with poles that exist", () => {
        for (const silk of catalogEntries("silk"))
            if (silk.pole) expect(catalogEntry(silk.pole)?.kind).toBe("pole");
    });
});

describe("defaults", () => {
    const meters = (entry: CatalogEntry | undefined, key: string) =>
        (catalogDims(entry!) as unknown as Record<string, { m: number }>)[key]
            .m;

    it("picks the spec's defaults", () => {
        expect(meters(defaultCatalogEntry("pole"), "length")).toBe(1.8288);
        expect(meters(defaultCatalogEntry("swingPole"), "length")).toBe(
            toMeters(36, "in"),
        );
        expect(defaultCatalogEntry("silk")?.id).toBe("silk-6ft-36x54");
        expect(defaultCatalogEntry("silk", "swing")?.id).toBe(
            "silk-swing-44x66",
        );
        expect(defaultCatalogEntry("rifle")?.id).toBe("rifle-36in");
        expect(defaultCatalogEntry("sabre")?.id).toBe("sabre-36in");
        expect(defaultCatalogEntry("floor")?.id).toBe(
            "floor-wgi-minimum-60x90ft",
        );
        expect(defaultCatalogEntry("flatProp")?.id).toBe("flat-prop-4x8ft");
        expect(defaultCatalogEntry("tPole")).toBeUndefined();
    });

    it("has at most one default per kind and use", () => {
        const keys = SIZE_CATALOG.filter((e) => e.isDefault).map((e) =>
            e.kind === "silk" ? `silk:${e.use}` : e.kind,
        );
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("round trip", () => {
    it("keeps a 36 x 54 in silk exact", () => {
        const dims = catalogDims(defaultCatalogEntry("silk")!);
        expect(dims.header.m).toBe(0.9144);
        expect(dims.fly.m).toBe(1.3716);
        expect(formatLength(dims.header, "metric")).toBe("36 in");
        expect(formatLength(dims.fly, "imperial")).toBe("54 in");
        expect(formatLength(dims.header.m, "imperial")).toBe(`3' 0"`);
        expect(formatLength(dims.fly.m, "imperial")).toBe(`4' 6"`);
    });

    it("re-displays and re-parses every catalog size without drift", () => {
        for (const entry of SIZE_CATALOG) {
            const dims = catalogDims(entry) as unknown as Record<
                string,
                { m: number; typed?: string } | { m: number }[]
            >;
            const sourced = sourcedLengths(entry);
            const lengths = Object.values(dims).flat();
            expect(lengths.length).toBe(sourced.length);
            lengths.forEach((length, i) => {
                const source = sourced[i];
                expect(length.m, entry.id).toBe(
                    toMeters(source.value, source.unit),
                );
                expect(fromMeters(length.m, source.unit)).toBeCloseTo(
                    source.value,
                    10,
                );
                const shown = formatLength(length, "metric");
                expect(shown).toBe(`${source.value} ${source.unit}`);
                expect(parseLength(shown)!.m).toBe(length.m);
                const rounded = formatLength(length.m, "imperial");
                expect(parseLength(rounded)!.m, rounded).toBe(length.m);
            });
        }
    });
});

describe("silk depth (Q39)", () => {
    const silk = (id: string) =>
        catalogEntries("silk").find((e) => e.id === id)!;

    it("re-reads the hanging Cuts' second figure as their depth", () => {
        const swing = catalogDims(silk("silk-oversized-swing-56x84"));
        expect(swing.header.m).toBe(toMeters(42, "in"));
        expect(swing.fly.m).toBe(toMeters(56, "in"));
        expect(swing.depth?.m).toBe(toMeters(84, "in"));
        expect(swing.sleeve).toBeUndefined();
        const superSwing = catalogDims(silk("silk-super-swing-44x84"));
        expect([
            superSwing.header.m,
            superSwing.fly.m,
            superSwing.depth?.m,
        ]).toEqual([
            toMeters(44, "in"),
            toMeters(68, "in"),
            toMeters(84, "in"),
        ]);
        const arc = catalogDims(silk("silk-arc-45x96"));
        expect(arc.depth?.m).toBe(toMeters(96, "in"));
        expect(fromMeters(arc.fly.m, "in")).toBeCloseTo(79, 0);
    });

    it("defaults the depth to the header", () => {
        const dims = catalogDims(silk("silk-6ft-36x54"));
        expect(dims.depth).toBeUndefined();
        expect(silkDepthM(dims)).toBe(dims.header.m);
        expect(silkDepthM(catalogDims(silk("silk-swing-44x66")))).toBe(
            toMeters(44, "in"),
        );
    });

    it("never stores a depth shallower than the header", () => {
        for (const entry of catalogEntries("silk")) {
            const dims = catalogDims(entry);
            expect(silkDepthM(dims), entry.id).toBeGreaterThanOrEqual(
                dims.header.m,
            );
        }
    });

    it("adds a curve Cut's sag to its depth", () => {
        const dims = catalogDims(silk("silk-6ft-36x54"));
        const sag = { m: toMeters(9, "in") };
        expect(silkDepthM({ ...dims, sag })).toBeCloseTo(
            toMeters(45, "in"),
            12,
        );
    });
});

describe("aliases (Q44)", () => {
    it("finds a Cut by a vendor's name without using it as the label", () => {
        const hits = catalogEntries("silk").filter((e) =>
            catalogEntryMatches(e, "extended tear drop"),
        );
        expect(hits.map((e) => e.id)).toEqual(["silk-teardrop-44x74"]);
        expect(
            catalogEntries("silk")
                .filter((e) => catalogEntryMatches(e, "demoulin"))
                .map((e) => e.id),
        ).toContain("silk-oversized-swing-56x84");
        for (const entry of catalogEntries("silk"))
            expect(entry.name, entry.id).not.toMatch(
                /miller|demoulin|band shoppe|field & floor|mccormick|drill company|styleplus/i,
            );
    });

    it("matches names and ids too, and everything for an empty query", () => {
        const teardrop = catalogEntry("silk-teardrop-44x74")!;
        expect(catalogEntryMatches(teardrop, "Teardrop")).toBe(true);
        expect(catalogEntryMatches(teardrop, "  ")).toBe(true);
        expect(catalogEntryMatches(teardrop, "super arc")).toBe(false);
    });
});
