import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDrillPackage } from "../package";

const fixturePath = fileURLToPath(
    new URL("./fixtures/sample.3dz", import.meta.url),
);

// The sample package contains a licensed show design and is not committed. When
// present locally it exercises the full pipeline against real data.
const describeWithFixture = existsSync(fixturePath) ? describe : describe.skip;

describeWithFixture("parseDrillPackage (real sample)", () => {
    const load = () => parseDrillPackage(readFileSync(fixturePath));

    it("reads the show title and cast", async () => {
        const show = await load();
        expect(show.title).toBe("westside2025 - part4");
        expect(show.performers).toHaveLength(49);
        const labels = show.performers.map((p) => p.label);
        expect(labels).toContain("T3");
        expect(labels).toContain("G10");
        expect(new Set(show.performers.map((p) => p.id)).size).toBe(49);
        const ts1 = show.performers.find((p) => p.label === "TS1")!;
        expect(ts1.drill_prefix).toBe("TS");
        expect(ts1.drill_order).toBe(1);
        const g10 = show.performers.find((p) => p.label === "G10")!;
        expect(g10.drill_prefix).toBe("G");
        expect(g10.drill_order).toBe(10);
    });

    it("reads the named sets with cumulative counts", async () => {
        const show = await load();
        // The opening formation (count 0) plus 24 named sets. A set's formation
        // stands on its own cumulative count and its label names the counts
        // spent arriving there, so `179-182` is the page reached at count 16.
        expect(show.sets).toHaveLength(25);
        expect(show.sets[0]!.name).toBe("");
        expect(show.sets[0]!.startCount).toBe(0);
        expect(show.sets[0]!.counts).toBe(0);
        expect(show.sets[0]!.isSubset).toBe(false);
        expect(show.sets[1]!.name).toBe("179-182");
        expect(show.sets[1]!.startCount).toBe(16);
        expect(show.sets[1]!.counts).toBe(16);
        expect(show.sets[2]!.name).toBe("183-185");
        expect(show.sets[2]!.startCount).toBe(28);
        // The show's closing hold is the last record, not an extra page.
        expect(show.sets.at(-1)!.name).toBe("234-END");
        expect(show.sets.at(-1)!.isSubset).toBe(true);
        expect(show.sets.at(-1)!.startCount).toBe(260);
    });

    it("marks subsets from the source's own flag, not a geometry guess", async () => {
        const show = await load();
        // Subsets come from the PTB7 trailer flag on the set itself, so a
        // labeled hold is caught even if the dots move within it.
        const subsetNames = show.sets
            .filter((s) => s.isSubset)
            .map((s) => s.name);
        expect(subsetNames).toEqual([
            "183-185",
            "201-202",
            "217-218",
            "225-227",
            "234-END",
        ]);
        // The first set is never a subset (OpenMarch anchors page 0), and every
        // subset is preceded by a main set.
        expect(show.sets[0]!.isSubset).toBe(false);
        for (let i = 0; i < show.sets.length; i++) {
            if (show.sets[i]!.isSubset) {
                expect(show.sets[i - 1]!.isSubset).toBe(false);
            }
        }
    });

    it("decodes coordinates for every cast member and prop at each set", async () => {
        const show = await load();
        expect(show.props).toHaveLength(7);
        for (const set of show.sets) {
            expect(Object.keys(set.coordinates)).toHaveLength(56);
        }
    });

    it("joins coordinates to performers by id", async () => {
        const show = await load();
        const t3 = show.performers.find((p) => p.label === "T3")!;
        const first = show.sets[0]!.coordinates[t3.id]!;
        expect(first).toBeDefined();
        expect(first.x).toBeCloseTo(-12.5, 3);
        expect(first.y).toBeCloseTo(9.375, 3);
    });

    it("reads the field border", async () => {
        const show = await load();
        expect(show.field).toEqual({
            minX: -50,
            minY: -26.25,
            maxX: 50,
            maxY: 26.25,
        });
    });

    it("reads the full grid: step ratio, sidelines, hashes, yard lines", async () => {
        const show = await load();
        const { grid } = show;
        expect(grid.stepsPerUnitX).toBeCloseTo(1.6, 5);
        expect(grid.stepsPerUnitY).toBeCloseTo(1.6, 5);
        expect(grid.sidelinesY).toEqual([-26.25, 26.25]);
        expect(grid.hashesY).toEqual([-8.75, 8.75]);
        expect(grid.yardLinesX).toHaveLength(21);
        expect(grid.yardLinesX[0]).toBe(-50);
        expect(grid.yardLinesX.at(-1)).toBe(50);
        expect(grid.measurementSystem).toBe("imperial");
        expect(grid.templateName).toBe("default");
    });

    it("extracts the field-surface image", async () => {
        const show = await load();
        expect(show.surface).toBeDefined();
        expect(show.surface!.data.byteLength).toBeGreaterThan(0);
    });

    it("splits the closing production note off the final set", async () => {
        const show = await load();
        // The credit block moves to show-level production notes...
        expect(show.productionNotes).toContain("Bright Designs");
        expect(show.productionNotes).toContain("Brighton & Trevor");
        // ...and the last set (the closing hold, `234-END`) keeps only its own
        // move note.
        expect(show.sets.at(-1)!.name).toBe("234-END");
        const lastNote = show.sets.at(-1)!.notes ?? "";
        expect(lastNote).toContain("Hold to END");
        expect(lastNote).not.toContain("Bright Designs");
    });

    it("decodes note text as UTF-8 (no mojibake)", async () => {
        const show = await load();
        const joined = [
            show.productionNotes ?? "",
            ...show.sets.map((s) => s.notes ?? ""),
        ].join("\n");
        // The closing note contains typographic punctuation (’ and —). Reading
        // the bytes as Latin-1 would surface the tell-tale "Â"/"â" mojibake.
        expect(joined).toContain("Bright Designs");
        expect(joined).not.toMatch(/Ã|Â|â€/);
    });

    it("extracts the show audio", async () => {
        const show = await load();
        expect(show.audio).toBeDefined();
        expect(show.audio!.name.toLowerCase()).toMatch(/\.ogg$/);
        expect(show.audio!.data.byteLength).toBeGreaterThan(0);
    });

    it("reads SYNC audio timestamps for beat alignment", async () => {
        const show = await load();
        expect(show.audioSync).toBeDefined();
        expect(show.audioSync!.timestamps.length).toBeGreaterThan(10);
        // Timestamps are monotonically increasing seconds into the audio.
        for (let i = 1; i < show.audioSync!.timestamps.length; i++) {
            expect(show.audioSync!.timestamps[i]!).toBeGreaterThan(
                show.audioSync!.timestamps[i - 1]!,
            );
        }
    });
});
