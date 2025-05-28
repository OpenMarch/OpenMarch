import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import {
    createHistoryTables,
    createUndoTriggers,
    dropUndoTriggers,
} from "../database.history";
import v5 from "./v5";

const FIRST_BEAT_ID = 0;
const FIRST_PAGE_ID = 0;

export default class v6 extends v5 {
    get version() {
        return 6;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        this.migrationWrapper(() => {
            // Greedily delete audio file triggers
            dropUndoTriggers(dbToUse, Constants.AudioFilesTableName);
            // Create new tables first, but don't create initial beats since we'll create them from ABC data
            this.createBeatsTable(dbToUse, false);
            this.createUtilityTable(dbToUse);
            this.createSectionAppearancesTable(dbToUse);

            // Create section appearances table
            dbToUse.exec(`
                CREATE TABLE IF NOT EXISTS "section_appearances" (
                    "id"            INTEGER PRIMARY KEY,
                    "section"       TEXT NOT NULL UNIQUE,
                    "fill_color"    TEXT NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    "outline_color" TEXT NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    "shape_type"    TEXT NOT NULL DEFAULT 'circle',
                    "created_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Get the old ABC notation data
            type OldMeasureData = {
                abc_data: string;
                created_at: string;
                updated_at: string;
            };
            const oldMeasureData = dbToUse
                .prepare(
                    `
                SELECT abc_data, created_at, updated_at
                FROM measures
                WHERE id = 1
            `,
                )
                .get() as OldMeasureData | undefined;

            // Convert ABC notation to Measure objects
            let measures: Measure[] = [];
            if (oldMeasureData?.abc_data) {
                measures = Measure.abcToMeasures(oldMeasureData.abc_data);
            } else {
                // If no measures exist, create default measures from the template
                measures = Measure.abcToMeasures(Measure.defaultMeasures);
            }

            // Drop and recreate measures table with new schema
            dbToUse.exec(
                `DROP TABLE IF EXISTS "${Constants.MeasureTableName}"`,
            );
            this.createMeasureTable(dbToUse);

            // First, create all the beats needed for the measures
            const insertBeat = dbToUse.prepare(`
                INSERT INTO "${Constants.BeatsTableName}" (
                    id,
                    duration,
                    position,
                    include_in_measure,
                    notes,
                    created_at,
                    updated_at
                ) VALUES (@id, @duration, @position, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            `);

            // Insert measures into new table
            // Each measure will start at a beat position based on its duration
            const insertMeasure = dbToUse.prepare(`
                INSERT INTO "${Constants.MeasureTableName}" (
                    start_beat,
                    rehearsal_mark,
                    notes,
                    created_at,
                    updated_at
                ) VALUES (@start_beat, @rehearsal_mark, @notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            `);

            // Create a start beat
            insertBeat.run({
                id: FIRST_BEAT_ID,
                duration: 0,
                position: 0,
            });

            // For each measure, calculate its beats and create them
            let lastTempo = 120;
            let currentBeatId = 1; // Start at 1 since 0 is reserved for FIRST_BEAT_ID
            for (const measure of measures) {
                const beatDuration = measure.duration / measure.getBigBeats();
                for (let i = 0; i < measure.getBigBeats(); i++) {
                    insertBeat.run({
                        id: currentBeatId,
                        duration: beatDuration,
                        position: currentBeatId,
                    });

                    if (i === 0) {
                        insertMeasure.run({
                            start_beat: currentBeatId,
                            rehearsal_mark: measure.rehearsalMark,
                            notes: measure.notes,
                        });
                    }

                    currentBeatId++;
                }
                lastTempo = measure.tempo;
            }
            const numBeats = currentBeatId;

            // Migrate pages table
            interface PageBackup {
                id: number;
                is_subset: number;
                notes: string | null;
                counts: number;
                created_at: string;
                updated_at: string;
            }

            // Create temporary table
            dbToUse.exec(`
                CREATE TEMPORARY TABLE pages_backup (
                    id INTEGER PRIMARY KEY,
                    is_subset INTEGER NOT NULL DEFAULT 0,
                    notes TEXT,
                    counts INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);

            // Copy existing data to backup
            dbToUse.exec(`
                INSERT INTO pages_backup
                SELECT id, is_subset, notes, counts, created_at, updated_at
                FROM pages;
            `);

            // Get backup data
            const pagesBackup = dbToUse
                .prepare(
                    `
                SELECT * FROM pages_backup ORDER BY id
            `,
                )
                .all() as PageBackup[];

            const marcherPagesBackup = dbToUse
                .prepare(
                    `
                SELECT * FROM marcher_pages ORDER BY id
            `,
                )
                .all() as {
                id: number;
                marcher_id: number;
                page_id: number;
                x: number;
                y: number;
            }[];

            // Drop and recreate pages table
            dbToUse.exec(`
                DROP TABLE pages;

                CREATE TABLE "pages" (
                    "id" INTEGER PRIMARY KEY,
                    "is_subset" INTEGER NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
                    "notes" TEXT,
                    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "start_beat" INTEGER NOT NULL UNIQUE,
                    FOREIGN KEY ("start_beat") REFERENCES "beats" ("id")
                );
            `);

            // Insert statement for new pages
            const insertPage = dbToUse.prepare(`
                INSERT INTO pages (id, is_subset, notes, created_at, updated_at, start_beat)
                VALUES (@id, @is_subset, @notes, @created_at, @updated_at, @start_beat)
            `);

            // Helper to get cumulative counts before a page
            const getCumulativeCountsBefore = (pageId: number): number => {
                return pagesBackup
                    .filter((p) => p.id < pageId)
                    .reduce((sum, p) => sum + p.counts, 0);
            };

            // delete later
            const existingBeats: { id: number; position: number }[] = dbToUse
                .prepare(
                    `
                SELECT * FROM "${Constants.BeatsTableName}" ORDER BY id
            `,
                )
                .all() as { id: number; position: number }[];
            // Helper to find start beat for a page
            const findStartBeat = (
                pageId: number,
                cumulativeCounts: number,
            ): number | undefined => {
                if (pageId === 0) return FIRST_BEAT_ID;

                return existingBeats.find(
                    (beat) => beat.position > cumulativeCounts && beat.id > 0,
                )?.id;
            };

            const insertMarcherPage = dbToUse.prepare(`
                INSERT INTO marcher_pages (marcher_id, page_id, x, y, created_at, updated_at)
                VALUES (@marcher_id, @page_id, @x, @y, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);

            // Migrate each page
            let latestBeatId = numBeats;
            const lastExistingBeatId =
                existingBeats[existingBeats.length - 1].id;
            for (const page of pagesBackup) {
                const cumulativeCounts = getCumulativeCountsBefore(page.id);
                let startBeat = findStartBeat(page.id, cumulativeCounts);

                if (startBeat == null) {
                    startBeat = latestBeatId;
                    for (let i = 0; i < page.counts; i++) {
                        insertBeat.run({
                            id: latestBeatId,
                            duration: 60 / lastTempo,
                            position: latestBeatId,
                        });
                        latestBeatId++;
                    }
                } else if (startBeat + page.counts >= lastExistingBeatId) {
                    for (
                        let i = latestBeatId;
                        i < startBeat + page.counts;
                        i++
                    ) {
                        insertBeat.run({
                            id: latestBeatId,
                            duration: 60 / lastTempo,
                            position: latestBeatId,
                        });
                        latestBeatId++;
                    }
                }

                const newPageId = insertPage.run({
                    id: page.id,
                    is_subset: page.is_subset,
                    notes: page.notes,
                    created_at: page.created_at,
                    updated_at: page.updated_at,
                    start_beat: startBeat,
                }).lastInsertRowid;

                // add old marcher pages
                // Migrate all marcher pages for this page
                const relevantMarcherPages = marcherPagesBackup.filter(
                    (p) => p.page_id === page.id,
                );
                for (const oldMarcherPage of relevantMarcherPages) {
                    insertMarcherPage.run({
                        marcher_id: oldMarcherPage.marcher_id,
                        page_id: newPageId,
                        x: oldMarcherPage.x,
                        y: oldMarcherPage.y,
                    });
                }
            }

            // Clean up
            dbToUse.exec("DROP TABLE pages_backup");
        });
    }

    tableAlreadyExists = (tableName: string, db: Database.Database) => {
        const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const tableExists = tableInfo.length > 0;
        if (tableExists) {
            console.log(`Table ${tableName} already exists`);
        }
        return tableExists;
    };

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");

        const currentVersion = db.pragma("user_version", { simple: true });
        if (currentVersion === this.version) {
            console.log(`Database already at version ${this.version}`);
            return;
        }

        console.log(db);
        // Set the pragma version to -1 so we know if it failed in the middle of creation
        db.pragma("user_version = " + -1);
        console.log("Creating database...");
        createHistoryTables(db);
        this.createBeatsTable(db);
        this.createMeasureTable(db);
        this.createPageTable(db);
        this.createMarcherTable(db);
        this.createMarcherPageTable(db);
        this.createFieldPropertiesTable(db);
        this.createAudioFilesTable(db);
        this.createShapeTable(db);
        this.createShapePageTable(db);
        this.createShapePageMarcherTable(db);
        this.createSectionAppearancesTable(db);
        this.createUtilityTable(db);
        db.pragma("user_version = " + this.version);
        console.log("\nDatabase created successfully.");
    }

    createBeatsTable(db: Database.Database, createInitialBeats = true) {
        const tableName = Constants.BeatsTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    "id"                    INTEGER PRIMARY KEY,
                    "duration"              FLOAT NOT NULL CHECK (duration >= 0),
                    "position"              INTEGER NOT NULL UNIQUE CHECK (position >= 0),
                    "include_in_measure"    INTEGER NOT NULL DEFAULT 1 CHECK (include_in_measure IN (0, 1)),
                    "notes"                 TEXT,
                    "created_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            if (createInitialBeats) {
                // Create default starting beat
                db.prepare(
                    `INSERT INTO ${tableName} ("duration", "position", "id") VALUES (0, 0, ${FIRST_BEAT_ID})`,
                ).run();

                db.prepare(
                    `CREATE TRIGGER prevent_beat_modification
                        BEFORE UPDATE ON "${tableName}"
                        FOR EACH ROW
                        WHEN OLD.id = ${FIRST_BEAT_ID}
                        BEGIN
                            SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
                        END;`,
                ).run();
                db.prepare(
                    `
                        CREATE TRIGGER prevent_beat_deletion
                        BEFORE DELETE ON "${tableName}"
                        FOR EACH ROW
                        WHEN OLD.id = ${FIRST_BEAT_ID}
                        BEGIN
                            SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
                        END;`,
                ).run();
            }
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }

    createPageTable(db: Database.Database) {
        const tableName = Constants.PageTableName;
        // Check if table exists
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        const tableExists = db
            .prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
            )
            .get();
        if (tableExists) {
            console.log(`Table ${tableName} already exists`);
            return { success: true, data: tableName };
        }

        try {
            db.prepare(
                `
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    "id"	            INTEGER PRIMARY KEY,
                    "is_subset"	        INTEGER NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
                    "notes"	            TEXT,
                    "created_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "start_beat"	    INTEGER NOT NULL UNIQUE,
                    FOREIGN KEY ("start_beat") REFERENCES "${Constants.BeatsTableName}" ("id")
                    );
                `,
            ).run();

            // Create page 1 with 0 counts. Page 1 should always exist
            // It is safe to assume there are no marchers in the database at this point, so MarcherPages do not need to be created
            db.prepare(
                `INSERT INTO ${tableName} ("start_beat", "id") VALUES (${FIRST_BEAT_ID}, ${FIRST_PAGE_ID})`,
            ).run();

            db.prepare(
                `CREATE TRIGGER prevent_page_modification
                    BEFORE UPDATE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_PAGE_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
                    END;`,
            ).run();
            db.prepare(
                `
                    CREATE TRIGGER prevent_page_deletion
                    BEFORE DELETE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_PAGE_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
                    END;`,
            ).run();

            // Make the undo triggers after so the creation of the first page cannot be undone
            createUndoTriggers(db, tableName);

            return { success: true, data: tableName };
        } catch (error: any) {
            throw new Error(`Failed to create  table: ${error}`);
        }
    }

    /**
     * Measures in OpenMarch use a simplified version of ABC notation.
     * There is only ever one entry in this table, and it is the ABC notation string.
     * When updating measures, this string will be modified.
     *
     * @param db Database object to use
     */
    createMeasureTable(db: Database.Database) {
        const tableName = Constants.MeasureTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        id              INTEGER PRIMARY KEY,
                        start_beat      INTEGER NOT NULL UNIQUE,
                        rehearsal_mark  TEXT,
                        notes           TEXT,
                        "created_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "updated_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (start_beat) REFERENCES "${Constants.BeatsTableName}" ("id")
                    );
                `);
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }

    /**
     * A table for storing default appearance settings for each section.
     * @param db Database object to use
     */
    createSectionAppearancesTable(db: Database.Database) {
        const tableName = Constants.SectionAppearancesTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    "id"            INTEGER PRIMARY KEY,
                    "section"       TEXT NOT NULL UNIQUE,
                    "fill_color"    TEXT NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    "outline_color" TEXT NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    "shape_type"    TEXT NOT NULL DEFAULT 'circle',
                    "created_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }

    /**
     * A table with various utility and metadata about the piece.
     * @param db Database object to use
     */
    createUtilityTable(db: Database.Database) {
        const tableName = Constants.UtilityTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        id                      INTEGER PRIMARY KEY CHECK (id = 0),
                        last_page_counts        INTEGER CHECK (last_page_counts >= 1)
                    );
                `);
            db.prepare(
                `INSERT INTO "${tableName}" (id, last_page_counts) VALUES (0, 8);`,
            ).run();
            db.prepare(
                `CREATE TRIGGER prevent_utility_deletion
                    BEFORE DELETE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = 0
                    BEGIN
                        SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
                    END;`,
            ).run();
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }
}

// OLD CODE FOR MIGRATION

/**
 * A Measure represents a measure in the music is used in conjunction with Page objects to define a show's length.
 *
 * Measures in OpenMarch are stored in the database as a single string in ABC notation.
 * While this makes updating the database a bit more cumbersome, it allows for easy parsing of the measures.
 */
export class Measure {
    static readonly defaultMeasures = `X:1
Q:1/4=120
M:4/4
V:1 baritone
V:1
z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |
`;

    /** INTEGER - The number of the measure in the piece */
    readonly number: number;
    /** The rehearsal mark of the measure. E.g. "A" or "12" (for measure 12) */
    readonly rehearsalMark: string | null;
    /** Beats per minute of the measure */
    readonly tempo: number;
    /**
     * The type of note that the bpm defines in this measure.
     * E.g. if the tempo is quarter = 120, the beat unit would be 1/4. Half note would be 1/2.
     * Dotted quarter would be 3/8
     */
    readonly beatUnit: BeatUnit;
    /** Time signature of the measure */
    readonly timeSignature: TimeSignature;
    /** The duration, in seconds, that the measure is */
    readonly duration: number;
    /** NOT IMPLEMENTED - The notes for the measure */
    readonly notes: string | null;

    constructor({
        number,
        rehearsalMark = null,
        timeSignature,
        tempo,
        beatUnit,
        notes = null,
    }: {
        number: number;
        rehearsalMark?: string | null;
        timeSignature: TimeSignature;
        beatUnit: BeatUnit;
        tempo: number;
        notes?: string | null;
    }) {
        if (!Number.isInteger(number))
            throw new Error("Measure number must be an integer.");
        if (tempo <= 0) throw new Error("Tempo must be > 0");

        this.number = number;
        this.rehearsalMark = rehearsalMark;
        this.timeSignature = timeSignature;
        this.tempo = tempo;
        this.beatUnit = beatUnit;
        this.duration = this.calculateDuration();
        this.notes = notes;
    }

    /*********************** PUBLIC INSTANCE METHODS ***********************/
    /**
     * Compares two measures to see if they are equal.
     *
     * @param other The measure to compare to.
     * @returns If this measure is equal to the other measure.
     */
    equals(other: Measure): boolean {
        return (
            this.number === other.number &&
            this.rehearsalMark === other.rehearsalMark &&
            this.timeSignature.equals(other.timeSignature) &&
            this.tempo === other.tempo &&
            this.beatUnit.equals(other.beatUnit) &&
            this.duration === other.duration &&
            this.notes === other.notes
        );
    }

    /**
     * Compares two measures by their name. Used for sorting.
     *
     * @param other The measure to compare to.
     * @returns A number that represents the comparison. (this.number - other.number)
     */
    compareTo(other: Measure): number {
        return this.number - other.number;
    }

    /**
     * Get the number of big beats in the measure.
     *
     * E.g.
     * A 4/4 measure with beat unit of QUARTER has 4 big beats.
     * 6/8, DOTTED_QUARTER has 2 big beats.
     * 6/8, EIGHTH has 6 big beats.
     */
    getBigBeats(): number {
        return (
            this.timeSignature.numerator /
            (this.timeSignature.denominator * this.beatUnit.value)
        );
    }

    /*********************** PRIVATE INSTANCE METHODS ***********************/
    /**
     * Calculates the duration of the measure (in seconds) based on the time signature, tempo, and beat unit.
     *
     * The time signature (numerator specifically) will determine how many beats are in the measure.
     *
     * The tempo (beats per minute) defines how many time the beat unit occurs in one minute.
     *
     * The beat unit determines what note gets the pulse. E.g. quarter = 144 == half = 72
     */
    private calculateDuration() {
        const beatsPerMeasure = this.timeSignature.numerator;
        // The ratio of the measure's beat unit to the pulse's beat unit
        const tempoRatio =
            1 / this.timeSignature.denominator / this.beatUnit.value;
        // The duration of one beat in seconds
        const tempoBeatDuration = 60 / this.tempo;
        return tempoRatio * beatsPerMeasure * tempoBeatDuration;
    }

    /*********************** MEASURE -> ABC ***********************/
    /**
     * Converts an array of Measure objects to an abc string.
     *
     * @param measures The measures to convert to an abc string
     * @returns The abc string.
     */
    private static toAbcString(measures: Measure[]) {
        if (measures.length === 0) return "";

        let output = "X:1\n";
        // Time Signature
        output += `M:${measures[0].timeSignature.toString()}\n`;
        // Tempo
        output += `Q:${measures[0].beatUnit.toFractionString()}=${measures[0].tempo}\n`;
        // Voice placeholder
        output += "V:1 baritone\nV:1\n";

        // First measure
        let previousMeasure;
        for (const measure of measures) {
            output += measure.toMeasureAbcString(previousMeasure);
            previousMeasure = measure;
        }

        return output;
    }

    /**
     * Helper function to convert a single measure to an abc string.
     *
     * @param previousMeasure The previous measure to compare tempo and time signature to.
     * @returns The abc string for the measure.
     */
    private toMeasureAbcString(previousMeasure?: Measure) {
        let output = "";
        // Rehearsal mark
        if (this.rehearsalMark) output += `"^${this.rehearsalMark}" `;

        // Time signature
        if (
            previousMeasure &&
            !this.timeSignature.equals(previousMeasure.timeSignature)
        )
            output += `[M:${this.timeSignature.toString()}] `;

        // Tempo
        if (
            previousMeasure &&
            (this.tempo !== previousMeasure.tempo ||
                !this.beatUnit.equals(previousMeasure.beatUnit))
        )
            output += `[Q:${this.beatUnit.toFractionString()}=${this.tempo}] `;

        // Beats
        output += `z${this.getBigBeats()} `;

        // barline
        output += "| ";

        return output;
    }

    /*********************** ABC -> MEASURE ***********************/
    /**
     * Parses an abc string and returns an array of Measure objects.
     *
     * ABC is a music notation language that is used to represent music in text form.
     *
     * NOTE - This is only public for testing purposes. There should be no reason to use this outside of the Measure class.
     *
     * @param abcString The abc string to parse
     * @param testing A boolean to determine if the function is being tested. If true, it will not print errors to the console.
     * @returns An array of Measure objects
     */
    static abcToMeasures(abcString: string, testing = false): Measure[] {
        if (!abcString || abcString.length === 0) return [];
        if (abcString.indexOf("V:1") < 0) {
            // V:1 means voice 1, which is what we're looking for
            if (!testing)
                console.error("No measures found in abcString. No V:1 found.");
            return [];
        }

        const abcHeader = abcString.substring(0, abcString.indexOf("V:1"));
        let currentTimeSignature = Measure.parseTimeSignature(abcHeader);
        if (!currentTimeSignature) {
            console.error(
                "No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4.",
            );
            currentTimeSignature = TimeSignature.fromString("4/4");
        }
        let currentTempo = Measure.parseTempo(abcHeader);
        if (!currentTempo) {
            console.error(
                "No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4. To fix this, add a tempo in the first measure.",
            );
            currentTempo = { bpm: 120, beatUnit: BeatUnit.QUARTER };
        }

        // Create a new string to modify
        let newAbcString = abcString;

        // only get the first voice
        while (newAbcString.includes("V:1")) {
            newAbcString = newAbcString.substring(
                newAbcString.indexOf("V:1") + 4,
            );
        }
        // Remove any following voices
        const nextVoiceIndex = newAbcString.indexOf("V:");
        if (nextVoiceIndex > 0)
            newAbcString = newAbcString.substring(0, nextVoiceIndex);

        // make each bar a new line. We don't care about what type of barline it is
        const multiBarlines = new Set(["|]", "[|", "||", "|:", ":|", "::"]);
        for (const barline of multiBarlines) {
            while (newAbcString.includes(barline)) {
                newAbcString = newAbcString.replace(barline, "\n");
            }
        }
        // Single barline is after so that it doesn't replace the multi-barlines
        const singleBarline = "|";
        while (newAbcString.includes(singleBarline)) {
            newAbcString = newAbcString.replace(singleBarline, "\n");
        }

        const measureStrings = newAbcString.split("\n");

        // Remove all comments (text that starts with %)
        for (let i = 0; i < measureStrings.length; i++) {
            if (
                measureStrings[i].trim()[0] === "%" ||
                measureStrings[i].trim() === ""
            ) {
                measureStrings.splice(i, 1);
                i--;
            }
        }

        // initialize empty object to store measures
        const output: Measure[] = [];
        // loop through each measure, checking for time signature and tempo changes
        for (const measureString of measureStrings) {
            const timeSignature = Measure.parseTimeSignature(measureString);
            if (timeSignature) {
                currentTimeSignature = timeSignature;
            }

            const tempo = Measure.parseTempo(measureString);
            if (tempo) {
                currentTempo = tempo;
            }

            if (currentTimeSignature && currentTempo) {
                output.push(
                    new Measure({
                        number: output.length + 1,
                        timeSignature: currentTimeSignature,
                        tempo: currentTempo.bpm,
                        beatUnit: currentTempo.beatUnit,
                    }),
                );
            }
        }

        return output;
    }

    /**
     * Gets the first occurrence of a time signature in an abc string and returns it as a TimeSignature object.
     *
     * @param abcString The abc string to parse the time signature from (e.g. "M:4/4")
     * @returns TimeSignature object representing the time signature
     */
    private static parseTimeSignature(
        abcString: string,
    ): TimeSignature | undefined {
        if (!abcString.includes("M:")) return; // no time signature found, don't print an error

        const timeSignatureRegex = /M:(\d+)\/(\d+)/;
        const timeSignatureMatch = abcString.match(timeSignatureRegex);
        if (!timeSignatureMatch) {
            console.error("No time signature found in abcString");
            return;
        }
        const timeSignatureString = `${parseInt(timeSignatureMatch[1], 10)}/${parseInt(timeSignatureMatch[2], 10)}`;
        return TimeSignature.fromString(timeSignatureString);
    }

    /**
     * Gets the first occurrence of a tempo in an abc string and returns it as a bpm and beat unit object.
     *
     * @param abcString The abc string to parse the tempo from (e.g. "Q:1/4=100")
     * @returns { bpm: number, beatUnit: BeatUnit} | undefined The tempo as a bpm and beat unit object
     */
    private static parseTempo(
        abcString: string,
    ): { bpm: number; beatUnit: BeatUnit } | undefined {
        if (!abcString.includes("Q:")) return; // no tempo found, don't print an error

        const tempoRegex = /Q:(\d+)\/(\d+)=(\d+)/;
        const tempoMatch = abcString.match(tempoRegex);
        if (!tempoMatch) {
            console.error("No tempo found in abcString");
            return;
        }
        const beatUnitString = `${parseInt(tempoMatch[1], 10)}/${parseInt(tempoMatch[2], 10)}`;
        const beatUnit = BeatUnit.fromString(beatUnitString);
        return { bpm: parseInt(tempoMatch[3], 10), beatUnit };
    }
}
/**
 * A beat unit is a fraction of a whole note that represents the duration of a note.
 * This is used for things like tempo and pulse.
 */
class BeatUnit {
    readonly value: number;
    readonly name: string;

    private constructor(value: number, name: string) {
        this.value = value;
        this.name = name;
    }

    // The following are the beat units that are available
    static readonly WHOLE = new BeatUnit(1, "WHOLE");
    static readonly HALF = new BeatUnit(1 / 2, "HALF");
    static readonly DOTTED_HALF = new BeatUnit(3 / 4, "DOTTED HALF");
    static readonly QUARTER = new BeatUnit(1 / 4, "QUARTER");
    static readonly DOTTED_QUARTER = new BeatUnit(3 / 8, "DOTTED QUARTER");
    static readonly EIGHTH = new BeatUnit(1 / 8, "EIGHTH");
    static readonly DOTTED_EIGHTH = new BeatUnit(3 / 16, "DOTTED EIGHTH");
    static readonly SIXTEENTH = new BeatUnit(1 / 16, "SIXTEENTH");
    static readonly DOTTED_SIXTEENTH = new BeatUnit(3 / 32, "DOTTED SIXTEENTH");
    static readonly THIRTY_SECOND = new BeatUnit(1 / 32, "THIRTY-SECOND");
    static readonly SIXTY_FOURTH = new BeatUnit(1 / 64, "64TH");
    /** An array of all supported beat units */
    static readonly ALL = [
        BeatUnit.WHOLE,
        BeatUnit.HALF,
        BeatUnit.DOTTED_HALF,
        BeatUnit.QUARTER,
        BeatUnit.DOTTED_QUARTER,
        BeatUnit.EIGHTH,
        BeatUnit.DOTTED_EIGHTH,
        BeatUnit.SIXTEENTH,
        BeatUnit.DOTTED_SIXTEENTH,
        BeatUnit.THIRTY_SECOND,
        BeatUnit.SIXTY_FOURTH,
    ];

    /**
     * Returns the string representation of the beat unit.
     */
    toString() {
        return this.name;
    }

    /**
     * Returns the fraction representation in a string.
     *
     * E.g. Half -> 1/2, dotted quarter -> 3/8
     */
    toFractionString() {
        switch (this.name) {
            case "WHOLE":
                return "1/1";
            case "HALF":
                return "1/2";
            case "DOTTED HALF":
                return "3/4";
            case "QUARTER":
                return "1/4";
            case "DOTTED QUARTER":
                return "3/8";
            case "EIGHTH":
                return "1/8";
            case "DOTTED_EIGHTH":
                return "3/16";
            case "SIXTEENTH":
                return "1/16";
            case "DOTTED_SIXTEENTH":
                return "3/32";
            case "THIRTY_SECOND":
                return "1/32";
            case "SIXTY_FOURTH":
                return "1/64";
            default:
                throw new Error(`Invalid beat unit name: ${this.name}`);
        }
    }

    /**
     * @param other The other beat unit to compare to.
     * @returns True if the other beat unit is equal to this beat unit.
     */
    equals(other: BeatUnit): boolean {
        return this.value === other.value && this.name === other.name;
    }

    /**
     * Returns the beat unit from the string representation.
     * @param name The name of the beat unit. (e.g. "DOTTED HALF")
     * @returns The beat unit object.
     */
    static fromName(name: string): BeatUnit {
        switch (name) {
            case "WHOLE":
                return BeatUnit.WHOLE;
            case "HALF":
                return BeatUnit.HALF;
            case "DOTTED HALF":
                return BeatUnit.DOTTED_HALF;
            case "QUARTER":
                return BeatUnit.QUARTER;
            case "DOTTED QUARTER":
                return BeatUnit.DOTTED_QUARTER;
            case "EIGHTH":
                return BeatUnit.EIGHTH;
            case "DOTTED_EIGHTH":
                return BeatUnit.DOTTED_EIGHTH;
            case "SIXTEENTH":
                return BeatUnit.SIXTEENTH;
            case "DOTTED_SIXTEENTH":
                return BeatUnit.DOTTED_SIXTEENTH;
            case "THIRTY_SECOND":
                return BeatUnit.THIRTY_SECOND;
            case "SIXTY_FOURTH":
                return BeatUnit.SIXTY_FOURTH;
            default:
                throw new Error(`Invalid beat unit name: ${name}`);
        }
    }

    /**
     * @param beatUnitString A string representation of the beat unit's value. (e.g. "1/4")
     * @returns BeatUnit object representing the beat unit
     */
    static fromString(beatUnitString: string): BeatUnit {
        let value = 0;
        if (beatUnitString.includes("/"))
            value =
                parseInt(beatUnitString.split("/")[0]) /
                parseInt(beatUnitString.split("/")[1]);
        else value = parseInt(beatUnitString);

        switch (value) {
            case 1:
                return BeatUnit.WHOLE;
            case 1 / 2:
                return BeatUnit.HALF;
            case 3 / 4:
                return BeatUnit.DOTTED_HALF;
            case 1 / 4:
                return BeatUnit.QUARTER;
            case 3 / 8:
                return BeatUnit.DOTTED_QUARTER;
            case 1 / 8:
                return BeatUnit.EIGHTH;
            case 3 / 16:
                return BeatUnit.DOTTED_EIGHTH;
            case 1 / 16:
                return BeatUnit.SIXTEENTH;
            case 3 / 32:
                return BeatUnit.DOTTED_SIXTEENTH;
            case 1 / 32:
                return BeatUnit.THIRTY_SECOND;
            case 1 / 64:
                return BeatUnit.SIXTY_FOURTH;
            default:
                throw new Error(`Invalid beat unit string: ${beatUnitString}`);
        }
    }
}

/**
 * A class representing a time signature ensuring valid numerator and denominator.
 */
class TimeSignature {
    readonly numerator: number;
    static readonly validDenominators = [1, 2, 4, 8, 16, 32, 64] as const;
    readonly denominator: (typeof TimeSignature.validDenominators)[number];

    constructor(timeSignature: {
        numerator: number;
        denominator: (typeof TimeSignature.validDenominators)[number];
    }) {
        const numerator = timeSignature.numerator;
        if (numerator <= 0 || !Number.isInteger(numerator))
            throw new Error(
                "Invalid time signature numerator. Must be a positive integer.",
            );
        this.numerator = timeSignature.numerator;
        this.denominator = timeSignature.denominator;
    }

    /**
     * Creates a new TimeSignature from a string representation of a time signature.
     *
     * @param timeSignature A string representation of a time signature. E.g. "4/4"
     * @returns
     */
    static fromString(timeSignature: string): TimeSignature {
        const split = timeSignature.split("/");
        if (split.length !== 2)
            throw new Error(
                "Invalid time signature string. Must be in the form of '4/4'",
            );
        const numerator = parseInt(split[0]);
        const denominator = parseInt(split[1]);
        const validDenominators = [1, 2, 4, 8, 16, 32, 64];
        if (!validDenominators.includes(denominator))
            throw new Error(
                "Invalid time signature denominator. Must be 1, 2, 4, 8, 16, 32, or 64",
            );

        return new TimeSignature({
            numerator,
            denominator: denominator as 1 | 2 | 4 | 8 | 16 | 32 | 64,
        });
    }

    /**
     * @param other The other TimeSignature to compare to.
     * @returns true if the other TimeSignature is equal to this TimeSignature.
     */
    equals(other: TimeSignature): boolean {
        return (
            this.numerator === other.numerator &&
            this.denominator === other.denominator
        );
    }

    /**
     * Checks if an object is an instance of TimeSignature.
     *
     * @param obj The object to check if it is a TimeSignature.
     * @returns True if the object is a TimeSignature, false otherwise.
     */
    static instanceOf(obj: any): obj is TimeSignature {
        try {
            return obj.numerator !== undefined && obj.denominator !== undefined;
        } catch (TypeError) {
            return false;
        }
    }

    /**
     * @returns a string representation of the time signature. E.g. "4/4"
     */
    toString(): string {
        return `${this.numerator}/${this.denominator}`;
    }

    /**
     *
     * @returns The beat unit of the time signature's denominator. E.g. 4/4 has a beat unit of 1/4
     */
    getBeatUnit(): BeatUnit {
        return BeatUnit.fromString(`1/${this.denominator.toString()}`);
    }
}
