/**
 * A show full of names and notes for the bug-report copy's tests (fork #801):
 * `reportCopy.test.ts` (desktop) and `web/worker/__test__/reportCopy.test.ts`.
 */
import { DatabaseSync } from "node:sqlite";
import { getOrm } from "../db";
import { createNewTimelineShow } from "./convertOnOpenFixtures";

/** Every name and note in the show; none may be left in a scrubbed copy */
export const SECRETS = [
    "Sarah's squad",
    "Seniors only",
    "Opener mix v3 for Mr. Hayes",
    "Count off from Jordan",
    "Mr. Hayes solo",
    "Jordan Quill",
    "Avery Morrison",
    "Needs braces check",
    "Talk to Avery's parents",
    "/Users/student/Music",
];
export const AUDIO = Uint8Array.from(
    { length: 4096 },
    (_, i) => (i * 37) % 251,
);

/** A show with names, notes, a tag, an unknown table, history and music in it */
export async function makeShowWithSecrets(showPath: string) {
    await createNewTimelineShow(showPath);
    const db = new DatabaseSync(showPath);
    try {
        // The renderer creates the undo triggers on every open.
        const { createAllUndoTriggers } =
            await import("@/db-functions/history");
        await createAllUndoTriggers(getOrm(db) as never);
        db.exec(`
            INSERT INTO marchers (name, section, notes, drill_prefix, drill_order)
            VALUES ('Jordan Quill', 'Trumpet', 'Needs braces check', 'T', 1),
                   ('Avery Morrison', 'Snare', NULL, 'S', 1),
                   (NULL, 'Tuba', NULL, 'U', 1);
            UPDATE pages SET notes = 'Talk to Avery''s parents';
            INSERT INTO tags (name, description) VALUES ('Sarah''s squad', 'Seniors only');
            -- A table this version doesn't know (older fork files have cues, sketches, …)
            CREATE TABLE cues (id INTEGER PRIMARY KEY, name TEXT, notes TEXT);
            INSERT INTO cues (name, notes) VALUES ('Mr. Hayes solo', 'Count off from Jordan');
            INSERT INTO timeline_change_log (tbl, row_id, before, after)
            VALUES ('marchers', 1, NULL, '{"name":"Jordan Quill"}');
        `);
        db.prepare(
            "INSERT INTO audio_files (path, nickname, data) VALUES (?, 'Opener mix v3 for Mr. Hayes', ?)",
        ).run("/Users/student/Music/opener.mp3", AUDIO);
    } finally {
        db.close();
    }
}
