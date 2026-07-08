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
        expect(show.sets).toHaveLength(24);
        expect(show.sets[0]!.name).toBe("179-182");
        expect(show.sets[0]!.startCount).toBe(0);
        expect(show.sets[1]!.name).toBe("183-185");
        expect(show.sets[1]!.startCount).toBe(16);
        expect(show.sets.at(-1)!.name).toBe("234-END");
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

    it("extracts the show audio", async () => {
        const show = await load();
        expect(show.audio).toBeDefined();
        expect(show.audio!.name.toLowerCase()).toMatch(/\.ogg$/);
        expect(show.audio!.data.byteLength).toBeGreaterThan(0);
    });
});
