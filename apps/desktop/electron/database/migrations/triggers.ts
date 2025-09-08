import { DbConnection } from "../tables/__test__/testUtils";
import { DB } from "../db";
import { sql } from "drizzle-orm";

const triggers = {
    prevent_first_beat_modification: `
            CREATE TRIGGER IF NOT EXISTS prevent_first_beat_modification
                BEFORE UPDATE ON beats
                FOR EACH ROW
                WHEN OLD.id = 0
                BEGIN
                    SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
                END;
        `,
    prevent_first_beat_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_beat_deletion
            BEFORE DELETE ON beats
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
            END;
    `,
    prevent_first_page_modification: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_page_modification
            BEFORE UPDATE ON pages
            FOR EACH ROW
            WHEN OLD.id = 0 AND (
                NEW.is_subset != OLD.is_subset OR
                NEW.start_beat != OLD.start_beat
            )
            BEGIN
                SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
            END;
    `,
    prevent_first_page_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_page_deletion
            BEFORE DELETE ON pages
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
            END;
    `,
    prevent_utility_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_utility_deletion
            BEFORE DELETE ON utility
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
            END;
    `,
};

/**
 * Drops all triggers from the database.
 * @param db - The database instance to drop triggers from.
 */
export const dropAllTriggers = async (db: DbConnection | DB) => {
    for (const [name] of Object.entries(triggers)) {
        try {
            await db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        } catch (error) {
            console.error(`Error dropping trigger ${name}:`, error);
            throw error;
        }
    }
};

/**
 * Creates all triggers in the database.
 * @param db - The database instance to create triggers in.
 */
export const createAllTriggers = async (db: DbConnection | DB) => {
    for (const [name, trigger] of Object.entries(triggers)) {
        try {
            await db.run(sql.raw(`${trigger}`));
        } catch (error) {
            console.error(`Error creating trigger ${name}:`, error);
            throw error;
        }
    }
};
