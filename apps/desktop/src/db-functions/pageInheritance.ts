import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";

export const COORDINATE_MODE = { MANUAL: 0, HOLD: 1, MOVE: 2 } as const;

export interface TimelineRow {
    pageId: number;
    startBeatPosition: number;
    mode: number;
    x: number;
    y: number;
}

// New coordinates for each derived row in one marcher's timeline, keyed by pageId
export function computeMarcherTimeline(
    rows: TimelineRow[],
): Map<number, { x: number; y: number }> {
    const sorted = [...rows].sort(
        (a, b) => a.startBeatPosition - b.startBeatPosition,
    );
    const result = new Map<number, { x: number; y: number }>();

    for (let i = 0; i < sorted.length; i++) {
        const page = sorted[i];
        if (page.mode === COORDINATE_MODE.MANUAL) continue;

        let prev: TimelineRow | undefined;
        for (let j = i - 1; j >= 0; j--) {
            if (sorted[j].mode === COORDINATE_MODE.MANUAL) {
                prev = sorted[j];
                break;
            }
        }
        // no preceding keyframe falls back to the first page
        if (!prev) prev = sorted[0];
        if (prev === page) continue;

        let next: TimelineRow | undefined;
        for (let j = i + 1; j < sorted.length; j++) {
            if (sorted[j].mode === COORDINATE_MODE.MANUAL) {
                next = sorted[j];
                break;
            }
        }

        if (page.mode === COORDINATE_MODE.HOLD || !next) {
            result.set(page.pageId, { x: prev.x, y: prev.y });
            continue;
        }

        const span = next.startBeatPosition - prev.startBeatPosition;
        const t =
            span === 0
                ? 0
                : (page.startBeatPosition - prev.startBeatPosition) / span;
        result.set(page.pageId, {
            x: prev.x + (next.x - prev.x) * t,
            y: prev.y + (next.y - prev.y) * t,
        });
    }
    return result;
}

// Setting a page authors it and turns the held run leading up to it into a gradual move
export async function flipInterveningHoldsToMove({
    tx,
    edits,
}: {
    tx: DbTransaction;
    edits: Array<{ marcherId: number; pageId: number }>;
}): Promise<void> {
    if (edits.length === 0) return;

    const allPages = await tx.query.pages.findMany();
    const allBeats = await tx.query.beats.findMany();
    const beatPosition = new Map(allBeats.map((b) => [b.id, b.position]));
    const pageBeat = new Map(
        allPages.map((p) => [p.id, beatPosition.get(p.start_beat) ?? 0]),
    );

    for (const edit of edits) {
        await tx
            .update(schema.marcher_pages)
            .set({ coordinate_mode: COORDINATE_MODE.MANUAL })
            .where(
                and(
                    eq(schema.marcher_pages.marcher_id, edit.marcherId),
                    eq(schema.marcher_pages.page_id, edit.pageId),
                ),
            );

        const rows = await tx.query.marcher_pages.findMany({
            where: eq(schema.marcher_pages.marcher_id, edit.marcherId),
        });
        const editBeat = pageBeat.get(edit.pageId) ?? 0;
        let prevKeyframeBeat = -Infinity;
        for (const r of rows) {
            const b = pageBeat.get(r.page_id) ?? 0;
            if (
                r.coordinate_mode === COORDINATE_MODE.MANUAL &&
                b < editBeat &&
                b > prevKeyframeBeat
            ) {
                prevKeyframeBeat = b;
            }
        }

        const heldPageIds = rows
            .filter((r) => {
                const b = pageBeat.get(r.page_id) ?? 0;
                return (
                    r.coordinate_mode === COORDINATE_MODE.HOLD &&
                    b > prevKeyframeBeat &&
                    b < editBeat
                );
            })
            .map((r) => r.page_id);

        if (heldPageIds.length > 0) {
            await tx
                .update(schema.marcher_pages)
                .set({ coordinate_mode: COORDINATE_MODE.MOVE })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, edit.marcherId),
                        inArray(schema.marcher_pages.page_id, heldPageIds),
                    ),
                );
        }
    }
}

export async function getAllMarcherIdsInTransaction({
    tx,
}: {
    tx: DbTransaction;
}): Promise<number[]> {
    const marchers = await tx.query.marchers.findMany();
    return marchers.map((m) => m.id);
}

export async function recomputeMarcherCoordinates({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;

    const allPages = await tx.query.pages.findMany();
    if (allPages.length === 0) return;
    const allBeats = await tx.query.beats.findMany();
    const beatPosition = new Map(allBeats.map((b) => [b.id, b.position]));
    const pageBeat = new Map(
        allPages.map((p) => [p.id, beatPosition.get(p.start_beat) ?? 0]),
    );

    const rows = await tx.query.marcher_pages.findMany({
        where: inArray(schema.marcher_pages.marcher_id, marcherIds),
    });

    const byMarcher = new Map<number, TimelineRow[]>();
    for (const mp of rows) {
        let list = byMarcher.get(mp.marcher_id);
        if (!list) {
            list = [];
            byMarcher.set(mp.marcher_id, list);
        }
        list.push({
            pageId: mp.page_id,
            startBeatPosition: pageBeat.get(mp.page_id) ?? 0,
            mode: mp.coordinate_mode,
            x: mp.x,
            y: mp.y,
        });
    }

    const stored = new Map(
        rows.map((mp) => [
            `${mp.marcher_id}:${mp.page_id}`,
            { x: mp.x, y: mp.y },
        ]),
    );

    for (const [marcherId, timeline] of byMarcher) {
        const computed = computeMarcherTimeline(timeline);
        for (const [pageId, coord] of computed) {
            const cur = stored.get(`${marcherId}:${pageId}`);
            // skip unchanged rows so undo history stays clean
            if (cur && cur.x === coord.x && cur.y === coord.y) continue;
            await tx
                .update(schema.marcher_pages)
                .set({ x: coord.x, y: coord.y })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, marcherId),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                );
        }
    }
}
