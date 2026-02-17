import Database from "libsql";

const triggers = {
    prevent_first_beat_modification: `CREATE TRIGGER IF NOT EXISTS prevent_first_beat_modification
BEFORE UPDATE ON beats
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
END;`,
    prevent_first_beat_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_first_beat_deletion
BEFORE DELETE ON beats
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
END;`,
    prevent_first_page_modification: `CREATE TRIGGER IF NOT EXISTS prevent_first_page_modification
BEFORE UPDATE ON pages
FOR EACH ROW
WHEN OLD.id = 0 AND (
    NEW.is_subset != OLD.is_subset OR
    NEW.start_beat != OLD.start_beat
)
BEGIN
    SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
END;`,
    prevent_first_page_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_first_page_deletion
BEFORE DELETE ON pages
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
END;`,
    prevent_utility_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_utility_deletion
BEFORE DELETE ON utility
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
END;`,
};

/**
 * Drops all triggers from the database.
 * @param dbConnection - The libsql database connection
 */
export const dropAllTriggers = (dbConnection: Database.Database) => {
    for (const [name] of Object.entries(triggers)) {
        if (!name || name.trim() === "") {
            console.warn("Skipping empty trigger name");
            continue;
        }
        try {
            dbConnection.exec(`DROP TRIGGER IF EXISTS ${name}`);
        } catch (error) {
            // Ignore errors - triggers might not exist (e.g., new database)
            // This is safe because we're using IF EXISTS
            console.debug(
                `Could not drop trigger ${name} (may not exist):`,
                error,
            );
        }
    }
};

/**
 * Creates all triggers in the database.
 * @param dbConnection - The libsql database connection
 */
export const createAllTriggers = (dbConnection: Database.Database) => {
    for (const [name, trigger] of Object.entries(triggers)) {
        if (!name || name.trim() === "" || !trigger || trigger.trim() === "") {
            console.warn(
                `Skipping invalid trigger: name="${name}", trigger empty=${!trigger}`,
            );
            continue;
        }
        try {
            dbConnection.exec(`${trigger}`);
        } catch (error) {
            console.error(`Error creating trigger ${name}:`, error);
            throw error;
        }
    }
};
