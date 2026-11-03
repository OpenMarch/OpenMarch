import { expect } from "vitest";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { hashParts, versionHashOf } from "@/view3d/library/showHash";
import {
    embedLibraryVersionInTransaction,
    type EmbedLibraryVersion,
} from "../showLibrary";
import { createItems } from "../items";
import { pruneShowLibraryOnSave } from "../showLibrarySave";

const bytes = (text: string) => new TextEncoder().encode(text);

const RIFLE = "11111111-1111-4111-8111-111111111111";
const SABRE = "22222222-2222-4222-8222-222222222222";

async function model(
    itemId: string,
    name: string,
): Promise<EmbedLibraryVersion> {
    const parts = { glb: bytes(`glTF ${name}`) };
    return {
        itemId,
        versionHash: await versionHashOf(await hashParts(parts)),
        kind: "model",
        name,
        builtIn: false,
        metadata: {
            tags: [],
            createdAt: "2026-10-16T00:00:00.000Z",
            updatedAt: "2026-10-16T00:00:00.000Z",
            originalFilename: `${name}.glb`,
            derivedFrom: null,
            license: "CC0-1.0",
            licenseText: null,
            author: null,
            sourceUrl: null,
            attribution: null,
            modified: false,
        },
        pins: [],
        parts,
    };
}

const embedded = async (db: DbConnection) =>
    (
        await db
            .select({ itemId: schema.library_items.item_id })
            .from(schema.library_items)
            .orderBy(schema.library_items.item_id)
            .all()
    ).map((r) => r.itemId);

describeDbTests("pruneShowLibraryOnSave", (it) => {
    it("keeps the Library Versions the show's items pin, and drops the rest", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const rifle = await model(RIFLE, "rifle");
        const sabre = await model(SABRE, "sabre");
        await db.transaction(async (tx) => {
            await embedLibraryVersionInTransaction({ tx, version: rifle });
            await embedLibraryVersionInTransaction({ tx, version: sabre });
        });
        const [beat] = await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .limit(1)
            .all();
        await createItems({
            db,
            newItems: [
                {
                    kind: "equipment",
                    home: [0, 0],
                    beatId: beat!.id,
                    library: {
                        itemId: RIFLE,
                        versionHash: rifle.versionHash,
                    },
                    geometry: {
                        outlineType: "rectangle",
                        width: 1,
                        depth: 0.1,
                    },
                },
            ],
        });

        const plan = await pruneShowLibraryOnSave({ db });

        expect(plan.items).toEqual([
            { itemId: SABRE, versionHash: sabre.versionHash },
        ]);
        expect(await embedded(db)).toEqual([RIFLE]);
    });
});
