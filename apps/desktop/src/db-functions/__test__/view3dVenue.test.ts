import { describe, expect } from "vitest";
import { count } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import GridFieldTemplates from "@/global/classes/fieldTemplates/GridFields";
import { performRedo, performUndo } from "../history";
import {
    getStoredVenueSettings,
    getVenueSettings,
    updateVenueSettings,
} from "../view3dVenue";
import {
    defaultVenueForField,
    defaultVenueForKit,
    type VenueSettings,
} from "@/view3d/core/venueSettings";

const football = FootballTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
const indoor = GridFieldTemplates.INDOOR_50x80_8to5;

const proSettings: VenueSettings = {
    version: 1,
    kit: "pro",
    lighting: "night",
    crowd: true,
    params: {
        homeColor: "#123456",
        awayColor: "#654321",
        endZoneText: "OPENMARCH",
        endZoneColor: "#1f2a5c",
    },
};

const rowCount = async (db: DbConnection) =>
    (await db.select({ c: count() }).from(schema.view3d_venue).get())?.c;

describeDbTests("view3dVenue", (it) => {
    const testWithHistory = getTestWithHistory(it, [schema.view3d_venue]);

    describe("reading", () => {
        it("reads a missing row as the field's default without writing", async ({
            db,
        }) => {
            expect(await getStoredVenueSettings({ db })).toBeUndefined();
            expect(await getVenueSettings({ db, field: football })).toEqual(
                defaultVenueForField(football),
            );
            expect(await getVenueSettings({ db, field: indoor })).toEqual(
                defaultVenueForKit("gym"),
            );
            expect(await rowCount(db)).toBe(0);
        });

        it("reads invalid stored JSON as the default", async ({ db }) => {
            await db
                .insert(schema.view3d_venue)
                .values({ id: 1, json_data: '{"version":1,"kit":"arena"}' })
                .run();
            expect(await getStoredVenueSettings({ db })).toBeUndefined();
            expect(await getVenueSettings({ db, field: indoor })).toEqual(
                defaultVenueForKit("gym"),
            );
        });

        it("rejects a second row", async ({ db }) => {
            await expect(
                db
                    .insert(schema.view3d_venue)
                    .values({ id: 2, json_data: JSON.stringify(proSettings) })
                    .run(),
            ).rejects.toThrow();
        });
    });

    describe("updateVenueSettings", () => {
        testWithHistory(
            "creates the row on the first change",
            async ({ db, expectNumberOfChanges }) => {
                const result = await updateVenueSettings({
                    db,
                    settings: proSettings,
                });
                expect(result).toEqual(proSettings);
                expect(await getStoredVenueSettings({ db })).toEqual(
                    proSettings,
                );
                expect(await rowCount(db)).toBe(1);
                await expectNumberOfChanges.test(db, 1);
            },
        );

        testWithHistory(
            "updates the existing row",
            async ({ db, expectNumberOfChanges }) => {
                await updateVenueSettings({ db, settings: proSettings });
                const second = { ...proSettings, crowd: false };
                await updateVenueSettings({ db, settings: second });
                expect(await getStoredVenueSettings({ db })).toEqual(second);
                expect(await rowCount(db)).toBe(1);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistory(
            "moves unsupported lighting to the kit's default",
            async ({ db }) => {
                const result = await updateVenueSettings({
                    db,
                    settings: { ...proSettings, kit: "gym", lighting: "dusk" },
                });
                expect(result.lighting).toBe("house");
                expect((await getStoredVenueSettings({ db }))?.lighting).toBe(
                    "house",
                );
            },
        );

        it("rejects invalid settings without writing", async ({ db }) => {
            await expect(
                updateVenueSettings({
                    db,
                    settings: { ...proSettings, kit: "arena" },
                }),
            ).rejects.toThrow();
            await expect(
                updateVenueSettings({
                    db,
                    settings: {
                        ...proSettings,
                        params: { ...proSettings.params, homeColor: "blue" },
                    },
                }),
            ).rejects.toThrow();
            expect(await rowCount(db)).toBe(0);
        });

        it("undoes back to the default and redoes the change", async ({
            db,
        }) => {
            await updateVenueSettings({ db, settings: proSettings });
            const second = { ...proSettings, kit: "college" as const };
            await updateVenueSettings({ db, settings: second });
            expect(await getStoredVenueSettings({ db })).toEqual(second);

            await performUndo(db);
            expect(await getStoredVenueSettings({ db })).toEqual(proSettings);

            await performUndo(db);
            expect(await getStoredVenueSettings({ db })).toBeUndefined();
            expect(await getVenueSettings({ db, field: football })).toEqual(
                defaultVenueForField(football),
            );

            await performRedo(db);
            expect(await getStoredVenueSettings({ db })).toEqual(proSettings);

            await performRedo(db);
            expect(await getStoredVenueSettings({ db })).toEqual(second);
        });
    });
});
