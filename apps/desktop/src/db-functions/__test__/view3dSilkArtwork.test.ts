import { describe, expect } from "vitest";
import { count } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import { performRedo, performUndo } from "../history";
import { getStoredVenueSettings } from "../view3dVenue";
import { getSilkArtwork, setSilkArtwork } from "../view3dSilkArtwork";
import type { SilkArtworkImport } from "@/view3d/core/silkArtwork";

const field = FootballTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;

/** A PNG's signature and a few bytes: the store never decodes it. */
const png = (tag: number): SilkArtworkImport => ({
    name: `flag-${tag}.png`,
    data: new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        tag,
        0,
        255,
    ]),
    width: 640,
    height: 480,
});

const rows = async (db: DbConnection) =>
    (await db.select({ c: count() }).from(schema.view3d_silk_artwork).get())?.c;

describeDbTests("view3dSilkArtwork", (it) => {
    describe("setSilkArtwork", () => {
        it("stores the PNG and points the venue at it", async ({ db }) => {
            const id = await setSilkArtwork({ db, artwork: png(1), field });
            expect(id).toBeGreaterThan(0);
            expect((await getStoredVenueSettings({ db }))?.silkArtwork).toBe(
                id,
            );
            const row = await getSilkArtwork({ db, id: id! });
            expect(row?.name).toBe("flag-1.png");
            expect(Array.from(row!.data)).toEqual(Array.from(png(1).data));
            expect([row?.width, row?.height]).toEqual([640, 480]);
        });

        it("replaces the old Artwork, which nothing else names", async ({
            db,
        }) => {
            const first = await setSilkArtwork({ db, artwork: png(1), field });
            const second = await setSilkArtwork({ db, artwork: png(2), field });
            expect(second).not.toBe(first);
            expect(await getSilkArtwork({ db, id: first! })).toBeUndefined();
            expect(await rows(db)).toBe(1);
        });

        it("removes it, keeping the rest of the venue", async ({ db }) => {
            await setSilkArtwork({ db, artwork: png(1), field });
            expect(
                await setSilkArtwork({ db, artwork: null, field }),
            ).toBeNull();
            const venue = await getStoredVenueSettings({ db });
            expect(venue).toBeDefined();
            expect(venue?.silkArtwork).toBeUndefined();
            expect(venue?.kit).toBe("hs");
            expect(await rows(db)).toBe(0);
        });

        it("undoes and redoes an import and a removal, one step each", async ({
            db,
        }) => {
            const id = await setSilkArtwork({ db, artwork: png(1), field });
            await setSilkArtwork({ db, artwork: null, field });

            await performUndo(db);
            expect((await getStoredVenueSettings({ db }))?.silkArtwork).toBe(
                id,
            );
            expect((await getSilkArtwork({ db, id: id! }))?.name).toBe(
                "flag-1.png",
            );
            expect(
                Array.from((await getSilkArtwork({ db, id: id! }))!.data),
            ).toEqual(Array.from(png(1).data));

            await performUndo(db);
            expect(await getStoredVenueSettings({ db })).toBeUndefined();
            expect(await rows(db)).toBe(0);

            await performRedo(db);
            expect((await getStoredVenueSettings({ db }))?.silkArtwork).toBe(
                id,
            );
            await performRedo(db);
            expect(await rows(db)).toBe(0);
        });
    });
});
