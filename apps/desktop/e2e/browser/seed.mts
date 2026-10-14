/**
 * SQL for `test.use({ seedSql })`: a show with music, pages and marchers whose
 * positions are already set, built on `_blank.dots` (beat 0 and page 0).
 *
 * Positions are stored the way the app stores them: page 0's are the
 * marchers' homes, and each later page is one timeline holding one transition
 * over the page's beats, with a destination per marcher (as convert on open
 * writes a page move).
 */

/** A marcher id with where it stands on a page, in field units. */
export type SeedPosition = readonly [id: number, x: number, y: number];

export type SeedShow = {
    /** How many beats to add after beat 0; beat `n` has id and position `n`. */
    beats: number;
    /** Each beat lasts this long, in seconds. */
    beatSeconds?: number;
    /** The first beat of each measure, if the show has measures. */
    measureStarts?: number[];
    /** The start beat of pages 1, 2, ...; page `k` gets id `k`. */
    pageStarts: number[];
    /** How many beats the last page has (`utility.last_page_counts`); default 8. */
    lastPageCounts?: number;
    /** The marchers; none for a show with music and pages only. */
    marchers?: { id: number; section: string; prefix: string; order: number }[];
    /** Positions per page, page 0 first; every page needs every marcher. */
    positions?: SeedPosition[][];
};

export function seedShowSql(show: SeedShow): string[] {
    const { beats, pageStarts } = show;
    const marchers = show.marchers ?? [];
    const positions =
        show.positions ??
        Array.from({ length: pageStarts.length + 1 }, () => []);
    const seconds = show.beatSeconds ?? 0.5;
    const lastPageCounts = show.lastPageCounts ?? 8;
    if (positions.length !== pageStarts.length + 1)
        throw new Error("Give positions for page 0 and every page added");
    const sql = [
        `INSERT INTO beats (id, duration, position) VALUES ${Array.from(
            { length: beats },
            (_, i) => `(${i + 1}, ${seconds}, ${i + 1})`,
        ).join(", ")}`,
    ];
    if (marchers.length > 0)
        sql.push(`INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y)
         VALUES ${marchers
             .map((m) => {
                 const [, x, y] = positions[0].find(([id]) => id === m.id)!;
                 return `(${m.id}, '${m.section}', '${m.prefix}', ${m.order}, ${x}, ${y})`;
             })
             .join(", ")}`);
    if (show.lastPageCounts !== undefined)
        sql.push(`UPDATE utility SET last_page_counts = ${lastPageCounts}`);
    if (show.measureStarts?.length)
        sql.push(
            `INSERT INTO measures (id, start_beat) VALUES ${show.measureStarts
                .map((beat, i) => `(${i + 1}, ${beat})`)
                .join(", ")}`,
        );
    pageStarts.forEach((start, i) => {
        const id = i + 1;
        // Beat ids are their indexes; the page's move ends where the next
        // page starts, or after the last page's counts (`pageEndBeat`)
        const end = pageStarts[i + 1] ?? start + lastPageCounts;
        if (end > beats + 1) throw new Error(`Page ${id} runs past the music`);
        const onPage = [...positions[id]].sort((a, b) => a[0] - b[0]);
        sql.push(`INSERT INTO pages (id, start_beat) VALUES (${id}, ${start})`);
        if (onPage.length === 0) return;
        sql.push(
            `INSERT INTO timelines (id, start_beat, end_beat) VALUES (${id}, ${start}, ${end})`,
            `INSERT INTO timeline_transitions (id, timeline_id, slot_count, start_beat, end_beat)
             VALUES (${id}, ${id}, ${onPage.length}, ${start}, ${end})`,
            `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y)
             VALUES ${onPage.map(([, x, y], slot) => `(${id}, ${slot}, ${x}, ${y})`).join(", ")}`,
            `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
             VALUES ${onPage
                 .map(
                     ([marcher], slot) =>
                         `(${marcher}, ${id}, ${slot}, ${start}, ${end})`,
                 )
                 .join(", ")}`,
        );
    });
    // The app drains the change log in its own writes; seeded rows are already
    // in the tables the resolver cold-builds from
    sql.push("DELETE FROM timeline_change_log");
    return sql;
}
