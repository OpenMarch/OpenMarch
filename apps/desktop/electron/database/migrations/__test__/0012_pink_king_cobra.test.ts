import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Migration 0012_pink_king_cobra", () => {
    let db: Database.Database;
    let tempDbPath: string;

    beforeEach(() => {
        // Create a temporary database file path
        tempDbPath = path.join(__dirname, `temp_test_${Date.now()}.dots`);

        // Create a new database
        db = new Database(tempDbPath);
        db.pragma("foreign_keys = ON");

        // Create the minimal schema needed for this migration
        // Based on migration 0012, we need: beats, pages, and measures tables
        db.exec(`
            CREATE TABLE \`beats\` (
                \`id\` integer PRIMARY KEY,
                \`duration\` real NOT NULL CHECK (duration >= 0),
                \`position\` integer NOT NULL UNIQUE CHECK (position >= 0),
                \`include_in_measure\` integer NOT NULL DEFAULT 1 CHECK (include_in_measure IN (0, 1)),
                \`notes\` text,
                \`created_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE \`pages\` (
                \`id\` integer PRIMARY KEY,
                \`is_subset\` integer NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
                \`notes\` text,
                \`created_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`start_beat\` integer NOT NULL UNIQUE,
                FOREIGN KEY (\`start_beat\`) REFERENCES \`beats\`(\`id\`)
            );

            CREATE TABLE \`measures\` (
                \`id\` integer PRIMARY KEY,
                \`start_beat\` integer NOT NULL UNIQUE,
                \`rehearsal_mark\` text,
                \`notes\` text,
                \`created_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (\`start_beat\`) REFERENCES \`beats\`(\`id\`)
            );

            -- Insert initial beat and page (required by schema)
            INSERT INTO beats (id, duration, position, include_in_measure) VALUES (0, 0, 0, 1);
            INSERT INTO pages (id, start_beat, is_subset) VALUES (0, 0, 0);

            -- Trigger to prevent deletes on the first beat (id=0)
            -- Note: We allow updates for testing different starting positions
            CREATE TRIGGER prevent_delete_first_beat
            BEFORE DELETE ON beats
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Cannot delete first beat (id=0)');
            END;

            -- Triggers to prevent updates/deletes on the first page (id=0)
            CREATE TRIGGER prevent_update_first_page
            BEFORE UPDATE ON pages
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Cannot modify first page (id=0)');
            END;

            CREATE TRIGGER prevent_delete_first_page
            BEFORE DELETE ON pages
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Cannot delete first page (id=0)');
            END;
        `);
    });

    afterEach(() => {
        // Close and delete the temporary database
        if (db) {
            db.close();
        }
        if (fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath);
        }
    });

    function setupBeats(count: number, startPosition: number = 0) {
        // Ensure the first beat always exists and cannot be deleted
        // Check if there is a beat with id=0
        const firstBeat = db.prepare("SELECT id FROM beats WHERE id = 0").get();
        if (!firstBeat) {
            // Create the first beat if it doesn't exist
            // Note: The trigger prevents updating beat 0, so we must create it with the correct position
            db.exec(
                `INSERT INTO beats (id, duration, position, include_in_measure) VALUES (0, 1.0, ${startPosition}, 1)`,
            );
        }
        // Note: We cannot update beat 0's position due to the trigger, so it stays at whatever position it was created with

        // Delete all beats except the first one (id=0)
        db.exec("DELETE FROM beats WHERE id != 0");

        // Create the remaining beats starting from ID 1 up to count-1
        // Positions start from startPosition + 1
        const beats = [];
        for (let i = 1; i < count; i++) {
            beats.push(`(${i}, 1.0, ${startPosition + i}, 1)`);
        }
        if (beats.length > 0) {
            db.exec(
                `INSERT INTO beats (id, duration, position, include_in_measure) VALUES ${beats.join(", ")}`,
            );
        }
    }

    function setupPages(startBeats: number[]) {
        // The first page (id=0) must always exist and cannot be deleted.
        // Ensure the first page exists
        const firstPage = db.prepare("SELECT id FROM pages WHERE id = 0").get();
        if (!firstPage) {
            db.exec(
                `INSERT INTO pages (id, start_beat, is_subset) VALUES (0, 0, 0)`,
            );
        }

        // Delete all pages except for the first one (id=0)
        db.exec("DELETE FROM pages WHERE id != 0");

        // Always include the first page with id=0 and start_beat=0 at the start
        // Remove any duplicate or erroneous first page requests
        const filteredStartBeats = startBeats.filter(
            (beat, idx) => !(beat === 0 && idx === 0),
        );
        const pages = [];
        // Page IDs start from 1 for all pages after the first
        for (let i = 0; i < filteredStartBeats.length; i++) {
            pages.push(`(${i + 1}, ${filteredStartBeats[i]}, 0)`);
        }
        if (pages.length > 0) {
            db.exec(
                `INSERT INTO pages (id, start_beat, is_subset) VALUES ${pages.join(", ")}`,
            );
        }
    }

    function runMigration() {
        const migrationPath = path.join(
            __dirname,
            "../0012_pink_king_cobra.sql",
        );
        const migrationSql = fs.readFileSync(migrationPath, "utf-8");

        // Split by statement breakpoint and execute each statement
        const statements = migrationSql
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        for (const statement of statements) {
            try {
                db.exec(statement);
            } catch (error) {
                throw new Error(
                    `Failed to execute statement: ${statement.substring(0, 100)}... Error: ${error}`,
                );
            }
        }
    }

    describe("Golden path", () => {
        it("should successfully run migration with 50 beats and pages at (0, 1, 10, 20, 30, 40)", () => {
            // Setup: 50 beats (starting with ID 0)
            setupBeats(50);

            // Setup: pages with start beats on (0, 1, 10, 20, 30, 40)
            setupPages([0, 1, 10, 20, 30, 40]);

            // Run the migration - should not throw
            expect(() => {
                runMigration();
            }).not.toThrow();

            // Verify pages still exist and have valid start_beat values
            const pages = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(pages.length).toBeGreaterThan(0);
            pages.forEach((page) => {
                expect(page.start_beat).not.toBeNull();
                expect(typeof page.start_beat).toBe("number");
            });
        });
    });

    describe("expected fixes", () => {
        it("should correctly fix 50 beats and pages at (0, 10, 20, 30, 40)", () => {
            // Setup: 50 beats (starting with ID 0)
            setupBeats(50);

            // Setup: pages with start beats on (0, 10, 20, 30, 40)
            setupPages([0, 10, 20, 30, 40]);

            runMigration();

            // Verify pages still exist and have valid start_beat values
            const pages = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            const expectedStartBeats = [0, 1, 11, 21, 31];
            expect(pages.length).toBe(expectedStartBeats.length);
            pages.forEach((page, index) => {
                expect(page.start_beat).toBe(expectedStartBeats[index]);
            });
        });
    });

    describe("no fix needed - page 1 already at position 1", () => {
        it.each([
            { beats: 10, pages: [0, 1], expected: [0, 1] },
            { beats: 20, pages: [0, 1, 5], expected: [0, 1, 5] },
            { beats: 30, pages: [0, 1, 10, 20], expected: [0, 1, 10, 20] },
            {
                beats: 50,
                pages: [0, 1, 10, 20, 30, 40],
                expected: [0, 1, 10, 20, 30, 40],
            },
        ])(
            "should not change pages when page 1 is already at position 1 (beats: $beats, pages: $pages)",
            ({ beats, pages, expected }) => {
                setupBeats(beats);
                setupPages(pages);
                runMigration();

                const result = db
                    .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                    .all() as Array<{ id: number; start_beat: number }>;

                expect(result.length).toBe(expected.length);
                result.forEach((page, index) => {
                    expect(page.start_beat).toBe(expected[index]);
                });
            },
        );
    });

    describe("fix needed - different page 1 positions", () => {
        it.each([
            { page1Pos: 2, beats: 10, pages: [0, 2], expected: [0, 1] },
            { page1Pos: 3, beats: 10, pages: [0, 3], expected: [0, 1] },
            { page1Pos: 5, beats: 20, pages: [0, 5, 10], expected: [0, 1, 6] },
            {
                page1Pos: 10,
                beats: 50,
                pages: [0, 10, 20, 30],
                expected: [0, 1, 11, 21],
            },
            {
                page1Pos: 15,
                beats: 50,
                pages: [0, 15, 25, 35],
                expected: [0, 1, 11, 21],
            },
            {
                page1Pos: 20,
                beats: 50,
                pages: [0, 20, 30, 40],
                expected: [0, 1, 11, 21],
            },
        ])(
            "should fix when page 1 is at position $page1Pos",
            ({ page1Pos, beats, pages, expected }) => {
                setupBeats(beats);
                setupPages(pages);
                runMigration();

                const result = db
                    .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                    .all() as Array<{ id: number; start_beat: number }>;

                expect(result.length).toBe(expected.length);
                result.forEach((page, index) => {
                    expect(page.start_beat).toBe(expected[index]);
                });
            },
        );
    });

    describe("edge cases - minimal pages", () => {
        it("should handle only page 0 (no page 1)", () => {
            setupBeats(10);
            setupPages([0]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(result.length).toBe(1);
            expect(result[0].id).toBe(0);
            expect(result[0].start_beat).toBe(0);
        });

        it("should handle page 0 and page 1 only", () => {
            setupBeats(10);
            setupPages([0, 5]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(result.length).toBe(2);
            expect(result[0].start_beat).toBe(0);
            expect(result[1].start_beat).toBe(1);
        });
    });

    describe("edge cases - many pages", () => {
        it("should handle many pages with large gaps", () => {
            setupBeats(100);
            setupPages([0, 50, 60, 70, 80, 90]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            const expected = [0, 1, 11, 21, 31, 41];
            expect(result.length).toBe(expected.length);
            result.forEach((page, index) => {
                expect(page.start_beat).toBe(expected[index]);
            });
        });

        it("should handle many pages with small gaps", () => {
            setupBeats(50);
            setupPages([0, 5, 6, 7, 8, 9]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            const expected = [0, 1, 2, 3, 4, 5];
            expect(result.length).toBe(expected.length);
            result.forEach((page, index) => {
                expect(page.start_beat).toBe(expected[index]);
            });
        });
    });

    describe("edge cases - sequential position handling", () => {
        it("should handle non-sequential beat positions and still fix pages correctly", () => {
            // Create beats with non-sequential positions
            setupBeats(10);
            // Manually set some beats to have non-sequential positions
            // Use positions that are far apart and unique to avoid conflicts
            db.exec(`
                UPDATE beats SET position = 1000 WHERE id = 1;
                UPDATE beats SET position = 2000 WHERE id = 2;
                UPDATE beats SET position = 3000 WHERE id = 3;
                UPDATE beats SET position = 4000 WHERE id = 4;
                UPDATE beats SET position = 5000 WHERE id = 5;
                UPDATE beats SET position = 6000 WHERE id = 6;
                UPDATE beats SET position = 7000 WHERE id = 7;
                UPDATE beats SET position = 8000 WHERE id = 8;
                UPDATE beats SET position = 9000 WHERE id = 9;
            `);

            setupPages([0, 5]);
            runMigration();

            // The key test: pages should still be fixed correctly even with non-sequential positions
            const pages = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(pages.length).toBe(2);
            expect(pages[0].start_beat).toBe(0);
            expect(pages[1].start_beat).toBe(1);

            // Verify all page start_beats reference valid beats
            const invalidReferences = db
                .prepare(
                    `
                    SELECT p.id, p.start_beat
                    FROM pages p
                    LEFT JOIN beats b ON b.id = p.start_beat
                    WHERE b.id IS NULL
                `,
                )
                .all() as Array<{ id: number; start_beat: number }>;

            expect(invalidReferences.length).toBe(0);
        });
    });

    describe("edge cases - boundary conditions", () => {
        it("should handle page 1 at position 2 (minimal offset)", () => {
            setupBeats(10);
            setupPages([0, 2, 5, 8]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            const expected = [0, 1, 4, 7];
            expect(result.length).toBe(expected.length);
            result.forEach((page, index) => {
                expect(page.start_beat).toBe(expected[index]);
            });
        });

        it("should handle page 1 at very high position", () => {
            setupBeats(100);
            setupPages([0, 99]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(result.length).toBe(2);
            expect(result[0].start_beat).toBe(0);
            expect(result[1].start_beat).toBe(1);
        });

        it("should handle consecutive pages starting far from position 1", () => {
            setupBeats(50);
            setupPages([0, 25, 26, 27, 28]);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            const expected = [0, 1, 2, 3, 4];
            expect(result.length).toBe(expected.length);
            result.forEach((page, index) => {
                expect(page.start_beat).toBe(expected[index]);
            });
        });
    });

    describe("edge cases - view creation and timing_objects", () => {
        it("should create timing_objects view correctly", () => {
            setupBeats(10);
            setupPages([0, 5]);
            runMigration();

            // Verify the view exists and can be queried
            const viewResult = db
                .prepare("SELECT COUNT(*) as count FROM timing_objects")
                .get() as { count: number };

            expect(viewResult.count).toBeGreaterThan(0);
        });

        it("should maintain referential integrity after migration", () => {
            setupBeats(50);
            setupPages([0, 10, 20, 30, 40]);
            runMigration();

            // All page start_beats should reference valid beats
            const invalidReferences = db
                .prepare(
                    `
                    SELECT p.id, p.start_beat
                    FROM pages p
                    LEFT JOIN beats b ON b.id = p.start_beat
                    WHERE b.id IS NULL
                `,
                )
                .all() as Array<{ id: number; start_beat: number }>;

            expect(invalidReferences.length).toBe(0);
        });
    });

    describe("parametrized tests - various scenarios", () => {
        it.each([
            {
                name: "small offset with few pages",
                beats: 20,
                pages: [0, 3, 10],
                expected: [0, 1, 8],
            },
            {
                name: "medium offset with medium pages",
                beats: 40,
                pages: [0, 8, 16, 24],
                expected: [0, 1, 9, 17],
            },
            {
                name: "large offset with many pages",
                beats: 100,
                pages: [0, 30, 40, 50, 60, 70],
                expected: [0, 1, 11, 21, 31, 41],
            },
            {
                name: "offset of 1",
                beats: 10,
                pages: [0, 2, 4, 6],
                expected: [0, 1, 3, 5],
            },
            {
                name: "offset of 9",
                beats: 50,
                pages: [0, 10, 20, 30],
                expected: [0, 1, 11, 21],
            },
        ])("should handle $name correctly", ({ beats, pages, expected }) => {
            setupBeats(beats);
            setupPages(pages);
            runMigration();

            const result = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(result.length).toBe(expected.length);
            result.forEach((page, index) => {
                expect(page.start_beat).toBe(expected[index]);
            });
        });
    });

    describe("edge cases - idempotency", () => {
        it("should be idempotent - running twice should produce same result", () => {
            setupBeats(50);
            setupPages([0, 10, 20, 30, 40]);

            runMigration();
            const firstResult = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            // Drop the view before running again to simulate idempotency
            db.exec("DROP VIEW IF EXISTS timing_objects");
            runMigration();
            const secondResult = db
                .prepare("SELECT id, start_beat FROM pages ORDER BY id")
                .all() as Array<{ id: number; start_beat: number }>;

            expect(firstResult.length).toBe(secondResult.length);
            firstResult.forEach((page, index) => {
                expect(page.start_beat).toBe(secondResult[index].start_beat);
            });
        });
    });

    describe("1-indexed positions (first beat at position 1)", () => {
        // Helper to set up beats with beat 0 at position 1
        function setupBeatsWithFirstAtPosition1(count: number) {
            // Temporarily disable foreign keys and drop triggers
            db.pragma("foreign_keys = OFF");
            db.exec("DROP TRIGGER IF EXISTS prevent_delete_first_beat");
            db.exec("DROP TRIGGER IF EXISTS prevent_delete_first_page");

            // Delete all data
            db.exec("DELETE FROM pages");
            db.exec("DELETE FROM beats");

            // Re-enable foreign keys BEFORE recreating triggers and data
            // This ensures foreign key constraints are enforced
            db.pragma("foreign_keys = ON");

            // Verify foreign keys are enabled
            const fkEnabled = db.pragma("foreign_keys", { simple: true });
            if (!fkEnabled) {
                throw new Error("Failed to re-enable foreign keys");
            }

            // Recreate triggers
            db.exec(`
                CREATE TRIGGER prevent_delete_first_beat
                BEFORE DELETE ON beats
                WHEN OLD.id = 0
                BEGIN
                    SELECT RAISE(FAIL, 'Cannot delete first beat (id=0)');
                END;
            `);
            db.exec(`
                CREATE TRIGGER prevent_delete_first_page
                BEFORE DELETE ON pages
                WHEN OLD.id = 0
                BEGIN
                    SELECT RAISE(FAIL, 'Cannot delete first page (id=0)');
                END;
            `);

            // Create beat 0 at position 1
            db.exec(
                `INSERT INTO beats (id, duration, position, include_in_measure) VALUES (0, 1.0, 1, 1)`,
            );
            // Recreate page 0 pointing to beat 0
            db.exec(
                `INSERT INTO pages (id, start_beat, is_subset) VALUES (0, 0, 0)`,
            );

            // Create the remaining beats starting from position 2
            const beats = [];
            for (let i = 1; i < count; i++) {
                beats.push(`(${i}, 1.0, ${i + 1}, 1)`);
            }
            if (beats.length > 0) {
                db.exec(
                    `INSERT INTO beats (id, duration, position, include_in_measure) VALUES ${beats.join(", ")}`,
                );
            }

            // Final verification that foreign keys are still enabled
            const fkStillEnabled = db.pragma("foreign_keys", { simple: true });
            if (!fkStillEnabled) {
                throw new Error("Foreign keys were disabled after setup");
            }
        }

        it("should fail when beat 0 is at position 1 due to UNIQUE constraint", () => {
            setupBeatsWithFirstAtPosition1(10);
            setupPages([0, 5]);

            // The migration should fail due to UNIQUE constraint violation
            // because beat 0 is at position 1, and the migration tries to assign position 1 to beat 1
            // This tests that the migration assumes beat 0 is at position 0
            expect(() => {
                runMigration();
            }).toThrow(/UNIQUE constraint failed: beats.position/);
        });

        it("should fail with larger dataset when beat 0 is at position 1", () => {
            setupBeatsWithFirstAtPosition1(50);
            setupPages([0, 10, 20, 30, 40]);

            // Same issue - migration will fail because it tries to assign position 1
            // to the first non-zero beat while beat 0 is already at position 1
            expect(() => {
                runMigration();
            }).toThrow(/UNIQUE constraint failed: beats.position/);
        });
    });
});
