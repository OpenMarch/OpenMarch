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
    // An imported model's name and credits (fork #1027)
    "Riley's riser",
    "Dana Morales",
    "dana-models.example",
    "Made by Dana for Riley",
];
export const AUDIO = Uint8Array.from(
    { length: 4096 },
    (_, i) => (i * 37) % 251,
);
/** An imported model's stored part: a recognizable run of bytes */
export const MODEL_PART = Uint8Array.from(
    { length: 5000 },
    (_, i) => (i * 53 + 7) % 241,
);
export const MODEL_PART_HASH = "a".repeat(64);
export const THUMBNAIL_HASH = "b".repeat(64);

/** A show with names, notes, a tag, a cue, an unknown table, history and music in it */
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
            -- A cue (ADR 0015): its label says how its performers were picked, often by a tag's name
            INSERT INTO cues (type, beat_id, value, label, notes)
            VALUES ('look', 0, 'builtin:look.guard', 'Sarah''s squad', 'Count off from Jordan');
            INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (1, 1);
            -- A table this version doesn't know (older fork files have phrase assets, sketches, …)
            CREATE TABLE phrase_assets (id INTEGER PRIMARY KEY, name TEXT, notes TEXT);
            INSERT INTO phrase_assets (name, notes) VALUES ('Mr. Hayes solo', 'Count off from Jordan');
            INSERT INTO timeline_change_log (tbl, row_id, before, after)
            VALUES ('marchers', 1, NULL, '{"name":"Jordan Quill"}');
        `);
        db.prepare(
            "INSERT INTO audio_files (path, nickname, data) VALUES (?, 'Opener mix v3 for Mr. Hayes', ?)",
        ).run("/Users/student/Music/opener.mp3", AUDIO);
        // An imported model (fork #997): its parts, sidecar and credits
        db.prepare(
            "INSERT INTO show_asset_blobs (hash, data) VALUES (?, ?), (?, ?)",
        ).run(MODEL_PART_HASH, MODEL_PART, THUMBNAIL_HASH, new Uint8Array(300));
        db.prepare(
            "INSERT INTO show_assets (id, version_hash, kind, name, parts, sidecar, credits) VALUES (?, ?, 'model', ?, ?, ?, ?)",
        ).run(
            "0b6f4a52-4f1e-4f8e-9a51-8e9c1c2b3d4e",
            "c".repeat(64),
            "Riley's riser",
            JSON.stringify({
                model: MODEL_PART_HASH,
                thumbnail: THUMBNAIL_HASH,
            }),
            JSON.stringify({
                triangles: 19_996,
                sizeM: { width: 2, height: 1, depth: 1 },
            }),
            JSON.stringify({
                license: "CC-BY-4.0",
                author: "Dana Morales",
                sourceUrl: "https://dana-models.example/riser",
                attribution: "Made by Dana for Riley",
            }),
        );
    } finally {
        db.close();
    }
}
