import { describeDbTests } from "@/test/base";
import { expect } from "vitest";
import type { DB } from "@/global/database/db";
import { toOpenMarchSchema } from "../dots-to-om";
import { safeValidateOpenMarchData, SCHEMA_VERSION } from "@openmarch/schema";
import { generatePageNames } from "@/global/classes/Page";
import { FieldProperties } from "@openmarch/core";
import { rgbaToSchemaString } from "@/entity-components/appearance";
import { FieldPropertiesSchema } from "@/components/field/fieldPropertiesSchema";
import {
    createMarcherTags,
    createSectionAppearances,
    createTagAppearances,
    createTags,
} from "@/db-functions";
import { updateMarcherPages } from "@/db-functions/marcherPage";

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
        const expectedNames = generatePageNames(
            result.pages.map((p) => p.isSubset === true),
            0,
        );
        expect(result.pages.map((p) => p.name)).toEqual(expectedNames);
        result.pages.forEach((page) => {
            expect(page.id).toBeDefined();
            expect(typeof page.startBeatIndex).toBe("number");
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

    it("includes performerAppearance with default from field properties", async ({
        db,
    }) => {
        const result = await toOpenMarchSchema(db as unknown as DB);
        const fieldPropsRow = await db.query.field_properties.findFirst({
            columns: { json_data: true },
        });
        const fieldProps = new FieldProperties(
            FieldPropertiesSchema.parse(JSON.parse(fieldPropsRow!.json_data)),
        );

        expect(result.performerAppearance).toBeDefined();
        expect(result.performerAppearance.defaultAppearance.fillRgba).toBe(
            rgbaToSchemaString(fieldProps.theme.defaultMarcher.fill),
        );
        expect(result.performerAppearance.performers).toEqual([]);
    });

    it("exports section appearances for each section_appearances row", async ({
        db,
        marchersAndPages,
    }) => {
        await createSectionAppearances({
            db,
            newItems: [
                {
                    section: "Trumpet",
                    shape_type: "square",
                    fill_color: { r: 11, g: 22, b: 33, a: 1 },
                },
            ],
        });

        const result = await toOpenMarchSchema(db as unknown as DB);
        expect(result.performerAppearance.sections).toHaveLength(1);
        expect(result.performerAppearance.sections[0].section).toBe("Trumpet");
        expect(result.performerAppearance.sections[0].shape).toBe("square");
    });

    it("exports performer override when tag appearance applies on a page", async ({
        db,
        marchersAndPages,
    }) => {
        const firstPageId = marchersAndPages.expectedPages[0].id;
        const marcherId = 1;

        const [tag] = await createTags({ db, newTags: [{ name: "test-tag" }] });
        await createMarcherTags({
            db,
            newMarcherTags: [{ tag_id: tag.id, marcher_id: marcherId }],
        });
        await createTagAppearances({
            db,
            newItems: [
                {
                    tag_id: tag.id,
                    start_page_id: firstPageId,
                    shape_type: "triangle",
                },
            ],
        });

        const result = await toOpenMarchSchema(db as unknown as DB);
        const override = result.performerAppearance.performers.find(
            (p) =>
                p.marcherId === String(marcherId) &&
                p.pageId === String(firstPageId),
        );
        expect(override).toBeDefined();
        expect(override!.shape).toBe("triangle");
    });

    it("exports performer override when marcher page appearance differs from baseline", async ({
        db,
        marchersAndPages,
    }) => {
        const firstPageId = marchersAndPages.expectedPages[0].id;
        const marcherId = 1;

        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: marcherId,
                    page_id: firstPageId,
                    shape_type: "x",
                },
            ],
        });

        const result = await toOpenMarchSchema(db as unknown as DB);
        const override = result.performerAppearance.performers.find(
            (p) =>
                p.marcherId === String(marcherId) &&
                p.pageId === String(firstPageId),
        );
        expect(override).toBeDefined();
        expect(override!.shape).toBe("cross");
    });
});
