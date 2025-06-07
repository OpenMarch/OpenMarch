import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import * as OpenMarchSchema from "./schema/schema";
import Database from "better-sqlite3";
import { createRequire } from "node:module";
import type * as DrizzleKit from "drizzle-kit/api";
import { DrizzleSQLiteSnapshotJSON } from "drizzle-kit/api";
import FieldPropertiesTemplates from "../../src/global/classes/FieldProperties.templates";
export type DB = BetterSQLite3Database<typeof OpenMarchSchema>;

export function getOrm(db: Database.Database): DB {
    return drizzle({
        client: db,
        schema: OpenMarchSchema,
        casing: "snake_case",
        logger: true,
    });
}

export const getSchema = () => OpenMarchSchema;

// workaround for https://github.com/drizzle-team/drizzle-orm/issues/2853
const require = createRequire(import.meta.url);
const { generateSQLiteDrizzleJson, generateSQLiteMigration } =
    require("drizzle-kit/api") as typeof DrizzleKit;
// end of workaround
export type OpenMarchDatabase = BetterSQLite3Database<typeof OpenMarchSchema>;

// workaround for https://github.com/drizzle-team/drizzle-orm/issues/3913
async function pushSchema(db: OpenMarchDatabase) {
    const prevJson = await generateSQLiteDrizzleJson({});
    const curJson = (await generateSQLiteDrizzleJson(
        OpenMarchSchema,
        "snake_case",
    )) as DrizzleSQLiteSnapshotJSON;
    const statements = await generateSQLiteMigration(prevJson, curJson as any);
    for (const statement of statements) {
        await db.run(statement);
    }
}
// end of workaround

export const createDefaultValues = async (db: OpenMarchDatabase) => {
    // History stats
    await db.insert(OpenMarchSchema.historyStats).values({
        id: 1, // based on schema constraint, id must be 1
        curUndoGroup: 0,
        curRedoGroup: 0,
        groupLimit: 500,
    });

    // Default starting beat (ID 0)
    await db.insert(OpenMarchSchema.beats).values({
        id: 0,
        duration: 0,
        position: 0,
        includeInMeasure: true,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    // Default starting page (ID 0) linked to starting beat (ID 0)
    await db.insert(OpenMarchSchema.pages).values({
        id: 0,
        isSubset: false,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startBeat: 0,
    });

    // Default FieldProperties using the template
    await db.insert(OpenMarchSchema.fieldProperties).values({
        id: 1,
        jsonData: JSON.stringify(
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
        ),
        image: null,
    });

    // Utility table
    await db.insert(OpenMarchSchema.utility).values({
        id: 0,
        lastPageCounts: 8,
    });
};

export const createTemporaryDatabase = async (): Promise<{
    db: OpenMarchDatabase;
    dbClient: Database.Database;
}> => {
    const client = new Database("file::memory:");
    const db: OpenMarchDatabase = await drizzle(client, {
        schema: OpenMarchSchema,
        casing: "snake_case",
    });
    await pushSchema(db);
    await createDefaultValues(db);
    return { db, dbClient: client };
};
