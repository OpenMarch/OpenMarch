import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";
import { FIRST_PAGE_ID } from "./page";

export interface InheritancePage {
    id: number;
    startBeatPosition: number;
    isAnchor: boolean;
}

export type CoordMap = Map<number, Map<number, { x: number; y: number }>>;

// Coordinates for each non-anchor page, derived from its surrounding anchors
export function computeInheritedCoordinates(
    pages: InheritancePage[],
    anchorCoords: CoordMap,
): CoordMap {
    const sorted = [...pages].sort(
        (a, b) => a.startBeatPosition - b.startBeatPosition,
    );
    const result: CoordMap = new Map();

    for (let i = 0; i < sorted.length; i++) {
        const page = sorted[i];
        if (page.isAnchor) continue;

        let prev: InheritancePage | undefined;
        for (let j = i - 1; j >= 0; j--) {
            if (sorted[j].isAnchor) {
                prev = sorted[j];
                break;
            }
        }
        let next: InheritancePage | undefined;
        for (let j = i + 1; j < sorted.length; j++) {
            if (sorted[j].isAnchor) {
                next = sorted[j];
                break;
            }
        }
        if (!prev) continue;

        const prevCoords = anchorCoords.get(prev.id);
        if (!prevCoords) continue;

        const out = new Map<number, { x: number; y: number }>();
        if (!next) {
            for (const [marcherId, a] of prevCoords)
                out.set(marcherId, { x: a.x, y: a.y });
        } else {
            const nextCoords = anchorCoords.get(next.id);
            const span = next.startBeatPosition - prev.startBeatPosition;
            const t =
                span === 0
                    ? 0
                    : (page.startBeatPosition - prev.startBeatPosition) / span;
            for (const [marcherId, a] of prevCoords) {
                const b = nextCoords?.get(marcherId) ?? a;
                out.set(marcherId, {
                    x: a.x + (b.x - a.x) * t,
                    y: a.y + (b.y - a.y) * t,
                });
            }
        }
        result.set(page.id, out);
    }
    return result;
}

export async function markPagesAsAnchorsInTransaction({
    tx,
    pageIds,
}: {
    tx: DbTransaction;
    pageIds: number[];
}): Promise<void> {
    if (pageIds.length === 0) return;
    await tx
        .update(schema.pages)
        .set({ is_coordinate_anchor: 1 })
        .where(inArray(schema.pages.id, pageIds));
}

export async function recomputeInheritedPagesInTransaction({
    tx,
}: {
    tx: DbTransaction;
}): Promise<void> {
    const allPages = await tx.query.pages.findMany();
    if (allPages.length === 0) return;
    const allBeats = await tx.query.beats.findMany();
    const beatPosition = new Map(allBeats.map((b) => [b.id, b.position]));
    const allMarcherPages = await tx.query.marcher_pages.findMany();

    const pages: InheritancePage[] = allPages.map((p) => ({
        id: p.id,
        startBeatPosition: beatPosition.get(p.start_beat) ?? 0,
        isAnchor: p.is_coordinate_anchor === 1 || p.id === FIRST_PAGE_ID,
    }));
    const anchorIds = new Set(pages.filter((p) => p.isAnchor).map((p) => p.id));

    const current = new Map<string, { x: number; y: number }>();
    const anchorCoords: CoordMap = new Map();
    for (const mp of allMarcherPages) {
        current.set(`${mp.page_id}:${mp.marcher_id}`, { x: mp.x, y: mp.y });
        if (anchorIds.has(mp.page_id)) {
            let m = anchorCoords.get(mp.page_id);
            if (!m) {
                m = new Map();
                anchorCoords.set(mp.page_id, m);
            }
            m.set(mp.marcher_id, { x: mp.x, y: mp.y });
        }
    }

    const computed = computeInheritedCoordinates(pages, anchorCoords);
    for (const [pageId, marcherMap] of computed) {
        for (const [marcherId, coord] of marcherMap) {
            const cur = current.get(`${pageId}:${marcherId}`);
            // skip missing or unchanged rows so undo history stays clean
            if (!cur || (cur.x === coord.x && cur.y === coord.y)) continue;
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
