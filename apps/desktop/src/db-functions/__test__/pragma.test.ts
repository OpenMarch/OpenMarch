import Database from "libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Pragma", () => {
    let db: Database.Database;
    beforeEach(() => {
        db = new Database(":memory:");
    });

    afterEach(() => {
        db.close();
    });
    describe("user-version", () => {
        it("should be able to get the user version", async () => {
            const result = (
                db.prepare("PRAGMA user_version").get() as {
                    user_version: number;
                }
            ).user_version;

            expect(result).toBe(0);
        });

        it("should be able to set the user version", async () => {
            db.prepare("PRAGMA user_version = 1").run();
            const result = (
                db.prepare("PRAGMA user_version").get() as {
                    user_version: number;
                }
            ).user_version;
            expect(result).toBe(1);

            db.prepare("PRAGMA user_version = 2").run();
            const result2 = (
                db.prepare("PRAGMA user_version").get() as {
                    user_version: number;
                }
            ).user_version;
            expect(result2).toBe(2);
        });
    });

    describe("foreign_keys", () => {
        it("should be able to get the foreign keys status", async () => {
            const result = (
                db.prepare("PRAGMA foreign_keys").get() as {
                    foreign_keys: string;
                }
            ).foreign_keys;
            expect(result).toBe(1);
        });

        it("should be able to set the foreign keys status", async () => {
            db.prepare("PRAGMA foreign_keys = OFF").run();
            const result = (
                db.prepare("PRAGMA foreign_keys").get() as {
                    foreign_keys: string;
                }
            ).foreign_keys;
            expect(result).toBe(0);

            db.prepare("PRAGMA foreign_keys = ON").run();
            const result2 = (
                db.prepare("PRAGMA foreign_keys").get() as {
                    foreign_keys: string;
                }
            ).foreign_keys;
            expect(result2).toBe(1);
        });
    });
});
