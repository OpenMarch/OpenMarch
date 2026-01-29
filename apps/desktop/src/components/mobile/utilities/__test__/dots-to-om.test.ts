import { describeDbTests } from "@/test/base";
import { expect } from "vitest";
import type { DB } from "@/global/database/db";
import { toOpenMarchSchema } from "../dots-to-om";
import { safeValidateOpenMarchData, SCHEMA_VERSION } from "@openmarch/schema";

describeDbTests("dots-to-om", (it) => {
    it("converts db to valid OpenMarch schema", async ({
        db,
        marchersAndPages,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        expect(result).toBeDefined();
        const validated = safeValidateOpenMarchData(result);
        expect(validated.success).toBe(true);
        if (validated.success) {
            expect(validated.data).toEqual(result);
        }
    });

    it("maps marchers to performers with correct id, label, and section", async ({
        db,
        marchersAndPages,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        const { expectedMarchers } = marchersAndPages;
        expect(result.performers).toHaveLength(expectedMarchers.length);
        for (const m of expectedMarchers) {
            const performer = result.performers.find((p) => p.id === m.id);
            expect(performer).toBeDefined();
            expect(performer!.id).toBe(m.id);
            expect(performer!.section).toBe(m.section);
            expect(performer!.label).toBe(`${m.drill_prefix}${m.drill_order}`);
        }
    });

    it("builds pages with correct ids, startBeatIndex, names, and isSubset", async ({
        db,
        marchersAndPages,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        expect(result.pages.length).toBeGreaterThan(0);
        result.pages.forEach((page, idx) => {
            expect(page.id).toBeDefined();
            expect(typeof page.startBeatIndex).toBe("number");
            expect(page.name).toBe(`Page ${idx + 1}`);
            expect(typeof page.duration).toBe("number");
            if (page.isSubset !== undefined) {
                expect(page.isSubset).toBe(true);
            }
        });
    });

    it("handles first beat with duration 0 and builds tempoSections from beat durations", async ({
        db,
        marchersAndPages,
    }) => {
        const { expectedBeats } = marchersAndPages;
        expect(expectedBeats[0].duration).toBe(0);

        const result = await toOpenMarchSchema(db as unknown as DB);
        expect(result.tempoSections.length).toBeGreaterThan(0);
        for (const section of result.tempoSections) {
            expect(section.tempo).toBeGreaterThan(0);
            expect(Number.isFinite(section.tempo)).toBe(true);
            expect(section.numberOfBeats).toBeGreaterThan(0);
        }
        const totalBeats = result.tempoSections.reduce(
            (sum, s) => sum + s.numberOfBeats,
            0,
        );
        expect(totalBeats).toBe(expectedBeats.length - 1);
        for (const section of result.tempoSections) {
            expect(60 / section.tempo).toBeCloseTo(0.5, 5);
        }
    });

    it("builds coordinates for every marcher_page", async ({
        db,
        marchersAndPages,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        const { expectedMarcherPages } = marchersAndPages;
        expect(result.coordinates).toHaveLength(expectedMarcherPages.length);
        for (const coord of result.coordinates) {
            expect(coord).toMatchObject({
                marcherId: expect.any(String),
                pageId: expect.any(String),
                xSteps: expect.any(Number),
                ySteps: expect.any(Number),
            });
        }
    });

    it("includes measures when present", async ({ db }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        if (result.measures != null && result.measures.length > 0) {
            expect(result.measures.length).toBeGreaterThan(0);
            result.measures.forEach((measure, idx) => {
                expect(measure.startBeatIndex).toBeDefined();
                expect(measure.name).toBe(`Measure ${idx + 1}`);
            });
        }
    });

    it("sets omSchemaVersion and metadata.performanceArea from field_properties", async ({
        db,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        expect(result.omSchemaVersion).toBe(SCHEMA_VERSION);
        expect(result.metadata).toBeDefined();
        expect(result.metadata.performanceArea).toBeDefined();
        expect(result.metadata.performanceArea.inchesPerStep).toBeGreaterThan(
            0,
        );
        expect(result.metadata.performanceArea.yOrigin).toBe("front");
        expect(result.metadata.performanceArea.xCheckpoints).toBeDefined();
        expect(result.metadata.performanceArea.yCheckpoints).toBeDefined();
    });
});
