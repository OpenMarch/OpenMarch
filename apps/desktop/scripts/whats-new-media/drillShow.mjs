// The timeline clip's show, built the way a user would build it in Expert mode: one move for
// the whole line, and a separate move for each end group nested under it.
//
//   node scripts/whats-new-media/drillShow.mjs <out .dots>
//
// The drill (2-step intervals, 120 bpm, 4-count pages: a move that exactly fills one page is
// drawn as that page's box rather than as a clip of its own, so no move here does):
// - 20 trumpets (T1–T20) stand side by side, 26 steps behind the front sideline and 24 left of
//   the 50, and march straight forward for 16 counts ("Line forward", counts 1–16, every
//   marcher), finishing 10 steps behind the front sideline. (Near the front and left, the
//   drill sits right above the timeline's clips in the recorded frame.)
// - On count 8 the five marchers at each end split off ("Left gate", "Right gate"). Each group
//   swings 90° backward around its inner marcher (T5 on the left, T16 on the right) over counts
//   9–12 while that pivot keeps marching with the middle, so the line opens into a wide U facing
//   the back sideline. The middle ten keep marching forward.
// - Over counts 13–16 the arms swing forward again, and all 20 finish in one straight line.
// Paths are direct (straight from spot to spot), so each arm turns along chords. The last page is
// a 16-count hold: the timeline opens fitted to the show, so the move fills about half of it.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLANK = path.resolve(
    HERE,
    "../../electron/database/migrations/_blank.dots",
);

const COUNTS = 16;
const BEAT_SECONDS = 0.5;
const INTERVAL = 2; // steps between neighbors
const START_DEPTH = 26; // steps behind the front sideline
const LEFT = 24; // steps left of the 50
const MARCHERS = 20;
const GROUP = 5;
const ARM_TURN_COUNTS = 4;

/** Where marcher i (0-based) stands in the line, in steps: x across from the 50, depth behind the front. */
const lineSpot = (i, depth) => ({
    x: (i - (MARCHERS - 1) / 2) * INTERVAL - LEFT,
    depth,
});
const depthAt = (count) => START_DEPTH - count; // one step forward per count

/**
 * The U: an end group's arm points backward from its pivot (the group's inner marcher), which
 * stands in the line at `depth`. `side` is -1 for the left group, 1 for the right.
 */
function armSpot(i, side, depth) {
    const pivot = side < 0 ? GROUP - 1 : MARCHERS - GROUP;
    const fromPivot = Math.abs(i - pivot); // 0 at the pivot, 4 at the outer end
    return { x: lineSpot(pivot, depth).x, depth: depth + fromPivot * INTERVAL };
}

// eslint-disable-next-line max-lines-per-function
export function makeDrillShow(output) {
    fs.rmSync(output, { force: true });
    fs.copyFileSync(BLANK, output);
    const db = new DatabaseSync(output);
    const run = (sql, ...args) => db.prepare(sql).run(...args);
    const fp = JSON.parse(
        db.prepare("select json_data from field_properties").get().json_data,
    );
    const pps = fp.width / 160;
    const px = ({ x, depth }) => [
        Math.round((fp.centerFrontPoint.xPixels + x * pps) * 100) / 100,
        Math.round((fp.centerFrontPoint.yPixels - depth * pps) * 100) / 100,
    ];

    db.exec("BEGIN");
    // Beats 1–32 (a 16-count hold after the drill), four to a measure
    for (let b = 1; b <= 32; b++)
        run(
            "insert into beats (id, duration, position, include_in_measure) values (?, ?, ?, 1)",
            b,
            BEAT_SECONDS,
            b,
        );
    for (let m = 0; m < 8; m++)
        run(
            "insert into measures (id, start_beat) values (?, ?)",
            m + 1,
            1 + m * 4,
        );
    for (let p = 0; p < 5; p++)
        run(
            "insert into pages (id, is_subset, start_beat) values (?, 0, ?)",
            p + 1,
            1 + p * 4,
        );

    // The last page (from count 17) is the 16-count hold
    run("update utility set last_page_counts = 16");

    for (let i = 0; i < MARCHERS; i++) {
        const [x, y] = px(lineSpot(i, START_DEPTH));
        run(
            "insert into marchers (id, section, drill_prefix, drill_order, home_x, home_y) values (?, 'Trumpet', 'T', ?, ?, ?)",
            i + 1,
            i + 1,
            x,
            y,
        );
    }

    let timeline = 0;
    let transition = 0;
    let assignment = 0;
    let destination = 0;
    const addTimeline = (name, start, end) => {
        run(
            "insert into timelines (id, name, start_beat, end_beat) values (?, ?, ?, ?)",
            ++timeline,
            name,
            start,
            end,
        );
        return timeline;
    };
    /** One transition of `members` (0-based) to `spot(i)`, from beat `start` to `end`. */
    const addTransition = (tl, members, start, end, layer, spot) => {
        run(
            `insert into timeline_transitions (id, timeline_id, dest_shape_id, path_style, path_params, order_mode, slot_count, start_beat, end_beat)
             values (?, ?, null, 'direct', null, 'inherit', ?, ?, ?)`,
            ++transition,
            tl,
            members.length,
            start,
            end,
        );
        members.forEach((i, slot) => {
            const [x, y] = px(spot(i));
            run(
                "insert into timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat, layer) values (?, ?, ?, ?, ?, ?, ?)",
                ++assignment,
                i + 1,
                transition,
                slot,
                start,
                end,
                layer,
            );
            run(
                "insert into timeline_slot_destinations (id, transition_id, slot_index, x, y) values (?, ?, ?, ?, ?)",
                ++destination,
                transition,
                slot,
                x,
                y,
            );
        });
    };

    // Counts 1–16 are beats 1→17; count 8 ends at beat 9, count 12 at beat 13.
    const all = [...Array(MARCHERS).keys()];
    const line = addTimeline("Line forward", 1, 1 + COUNTS);
    addTransition(line, all, 1, 1 + COUNTS, 0, (i) =>
        lineSpot(i, depthAt(COUNTS)),
    );

    const split = 1 + 8;
    const turned = split + ARM_TURN_COUNTS;
    for (const [name, side, members] of [
        ["Left gate", -1, all.slice(0, GROUP)],
        ["Right gate", 1, all.slice(MARCHERS - GROUP)],
    ]) {
        const tl = addTimeline(name, split, 1 + COUNTS);
        // Out: swing back into the U while the pivot keeps marching
        addTransition(tl, members, split, turned, 1, (i) =>
            armSpot(i, side, depthAt(turned - 1)),
        );
        // In: swing forward into the line where the middle finishes
        addTransition(tl, members, turned, 1 + COUNTS, 1, (i) =>
            lineSpot(i, depthAt(COUNTS)),
        );
    }
    db.exec("COMMIT");
    db.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [output] = process.argv.slice(2);
    if (!output) {
        console.error("usage: drillShow.mjs <out .dots>");
        process.exit(2);
    }
    makeDrillShow(output);
}
