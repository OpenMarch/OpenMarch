import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** Field units per 8-to-5 step. */
const STEP = 11.25;
/** Where each copy stands relative to the original, in steps. */
const OFFSETS = [
    [0, 0],
    [1.5, 0],
    [-1.5, 0],
    [0, 1.5],
    [0, -1.5],
    [1.5, 1.5],
    [-1.5, -1.5],
].map(([x, y]) => [x! * STEP, y! * STEP] as const);

type Copy = { c: number; ids: Map<number, number>; dx: number; dy: number };

/**
 * Writes the stress show of #189's parity gate to `dst`: every marcher of a
 * timeline show (the 385-marcher Daft Punk demo) cloned `copies` times, each
 * copy a step and a half off the original, with its own slots in every move.
 * 385 × 5 is the 1,925-marcher show the prototype benchmarked
 * (`proto/three-canvas`, `canvas-proto/bench/make-stress-show.mjs`; this is
 * that script). Does nothing if `dst` exists.
 */
export function makeStressShow(src: string, dst: string, copies = 5) {
    if (fs.existsSync(dst)) return;
    const tmp = `${dst}.tmp`;
    fs.copyFileSync(src, tmp);
    const db = new DatabaseSync(tmp);
    db.exec("BEGIN");
    copyMoves(db, copyMarchers(db, copies), copies);
    db.exec("COMMIT");
    // Drop the undo history the triggers wrote, so the file stays small
    const history = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'history_%' AND name <> 'history_stats'",
        )
        .all() as { name: string }[];
    for (const { name } of history) db.exec(`DELETE FROM "${name}"`);
    db.exec("VACUUM");
    db.close();
    fs.renameSync(tmp, dst);
}

/** Adds `copies - 1` copies of every marcher, and says which id each copy got. */
function copyMarchers(db: DatabaseSync, copies: number): Copy[] {
    type Marcher = {
        id: number;
        name: string | null;
        section: string;
        year: string | null;
        notes: string | null;
        drill_prefix: string;
        drill_order: number;
        home_x: number;
        home_y: number;
    };
    const marchers = db
        .prepare("SELECT * FROM marchers ORDER BY id")
        .all() as unknown as Marcher[];
    const n = marchers.length;
    const maxId = (
        db.prepare("SELECT max(id) AS m FROM marchers").get() as { m: number }
    ).m;
    const insert = db.prepare(
        "INSERT INTO marchers (id, name, section, year, notes, drill_prefix, drill_order, home_x, home_y) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    const result: Copy[] = [];
    for (let c = 1; c < copies; c++) {
        const [dx, dy] = OFFSETS[c]!;
        const ids = new Map<number, number>();
        marchers.forEach((m, k) => {
            const id = maxId + (c - 1) * n + k + 1;
            ids.set(m.id, id);
            insert.run(
                id,
                m.name,
                m.section,
                m.year,
                m.notes,
                m.drill_prefix,
                m.drill_order + c * 1000,
                m.home_x + dx,
                m.home_y + dy,
            );
        });
        result.push({ c, ids, dx, dy });
    }
    return result;
}

/** Gives each copy its own slots in every move, offset as the copy is. */
function copyMoves(db: DatabaseSync, copiesOf: Copy[], copies: number) {
    const transitions = db
        .prepare("SELECT id, slot_count FROM timeline_transitions")
        .all() as { id: number; slot_count: number }[];
    const insertSlot = db.prepare(
        "INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (?,?,?,?)",
    );
    const insertAssignment = db.prepare(
        "INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat, layer) VALUES (?,?,?,?,?,?)",
    );
    for (const t of transitions) {
        const slots = db
            .prepare(
                "SELECT slot_index, x, y FROM timeline_slot_destinations WHERE transition_id = ?",
            )
            .all(t.id) as { slot_index: number; x: number; y: number }[];
        const assignments = db
            .prepare(
                "SELECT marcher_id, slot_index, start_beat, end_beat, layer FROM timeline_assignments WHERE transition_id = ?",
            )
            .all(t.id) as {
            marcher_id: number;
            slot_index: number;
            start_beat: number;
            end_beat: number;
            layer: number;
        }[];
        db.prepare(
            "UPDATE timeline_transitions SET slot_count = ? WHERE id = ?",
        ).run(t.slot_count * copies, t.id);
        for (const { c, ids, dx, dy } of copiesOf) {
            const slotOffset = c * t.slot_count;
            for (const s of slots)
                insertSlot.run(
                    t.id,
                    s.slot_index + slotOffset,
                    s.x + dx,
                    s.y + dy,
                );
            for (const a of assignments)
                insertAssignment.run(
                    ids.get(a.marcher_id)!,
                    t.id,
                    a.slot_index + slotOffset,
                    a.start_beat,
                    a.end_beat,
                    a.layer,
                );
        }
    }
}
