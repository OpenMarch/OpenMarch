// Turns the converted demo show into one that looks like real Expert-mode work: named moves
// for most sections, of varied lengths, several crossing page flags and overlapping in time,
// so the timeline stacks them into rows. Used by record.mjs for the timeline clip.
//
//   node scripts/whats-new-media/expertShow.mjs <converted demo .dots> <out .dots>
//
// The demo (web/public/demos/part1-demo.dots) has to be converted to timelines first; the app
// does that when it opens it (record.mjs keeps the converted copy). Each move ends on a page
// flag at the position its marchers already have there, so nothing jumps when it ends; it
// starts mid-page or pages earlier, so the section skips sets or arrives late.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** [name, drill prefixes, start beat, end beat (a page flag)] */
const MOVES = [
    ["Trumpet sweep", ["T"], 22, 38],
    ["Trumpet company front", ["T"], 44, 62],
    ["Clarinet curl", ["C"], 24, 28],
    ["Clarinet drift", ["C"], 30, 54],
    ["Flute ripple", ["F"], 32, 38],
    ["Flute arc", ["F"], 40, 54],
    ["Baritone push", ["B"], 21, 42],
    ["Alto fan", ["A"], 26, 38],
    ["Alto block", ["A"], 46, 62],
    ["Mello peel", ["M"], 34, 42],
    ["Guard feature", ["G"], 20, 28],
    ["Guard flag rotation", ["G"], 29, 54],
    ["Low brass drag", ["U", "L"], 36, 54],
    ["Battery shift", ["D", "S", "Q"], 25, 42],
    ["Tenor sax slide", ["E"], 48, 62],
];

export function makeExpertShow(input, output) {
    // VACUUM INTO, not a file copy: the app may have left the conversion in the -wal file.
    fs.rmSync(output, { force: true });
    const source = new DatabaseSync(input);
    source.exec(`VACUUM INTO '${output.replaceAll("'", "''")}'`);
    source.close();
    const db = new DatabaseSync(output);
    const all = (sql, ...args) => db.prepare(sql).all(...args);
    const run = (sql, ...args) => db.prepare(sql).run(...args);

    const flags = new Set(
        all("select start_beat from pages").map((p) => p.start_beat),
    );
    const marchers = all(
        "select id, drill_prefix, home_x as x, home_y as y from marchers",
    );
    /** Where a marcher stands at a page flag: its last layer-0 destination by then, or where it starts. */
    const standsAt = (marcher, beat) =>
        all(
            `select d.x, d.y from timeline_assignments a
             join timeline_slot_destinations d on d.transition_id = a.transition_id and d.slot_index = a.slot_index
             where a.marcher_id = ? and a.layer = 0 and a.end_beat <= ?
             order by a.end_beat desc limit 1`,
            marcher.id,
            beat,
        )[0] ?? { x: marcher.x, y: marcher.y };

    const next = (table) =>
        (all(`select max(id) m from ${table}`)[0].m ?? 0) + 1;
    db.exec("BEGIN");
    for (const [name, prefixes, start, end] of MOVES) {
        if (!flags.has(end))
            throw new Error(`${name}: beat ${end} isn't a page flag`);
        const members = marchers.filter((m) =>
            prefixes.includes(m.drill_prefix),
        );
        if (!members.length)
            throw new Error(`${name}: no marchers ${prefixes}`);
        const timeline = next("timelines");
        run(
            "insert into timelines (id, name, start_beat, end_beat) values (?, ?, ?, ?)",
            timeline,
            name,
            start,
            end,
        );
        const transition = next("timeline_transitions");
        run(
            `insert into timeline_transitions (id, timeline_id, dest_shape_id, path_style, path_params, order_mode, slot_count, start_beat, end_beat)
             values (?, ?, null, 'direct', null, 'inherit', ?, ?, ?)`,
            transition,
            timeline,
            members.length,
            start,
            end,
        );
        members.forEach((m, slot) => {
            const { x, y } = standsAt(m, end);
            run(
                "insert into timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat, layer) values (?, ?, ?, ?, ?, ?, 1)",
                next("timeline_assignments"),
                m.id,
                transition,
                slot,
                start,
                end,
            );
            run(
                "insert into timeline_slot_destinations (id, transition_id, slot_index, x, y) values (?, ?, ?, ?, ?)",
                next("timeline_slot_destinations"),
                transition,
                slot,
                x,
                y,
            );
        });
    }
    db.exec("COMMIT");
    db.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) {
        console.error(
            "usage: expertShow.mjs <converted demo .dots> <out .dots>",
        );
        process.exit(2);
    }
    makeExpertShow(input, output);
}
