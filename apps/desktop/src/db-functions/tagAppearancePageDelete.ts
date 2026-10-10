import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";

/** The tags that already start on one of `pageIds`, as `${tag}:${page}`. */
async function tagsStartingOn(
    tx: DbTransaction,
    pageIds: readonly number[],
): Promise<Set<string>> {
    if (pageIds.length === 0) return new Set();
    const rows = await tx
        .select({
            tag_id: schema.tag_appearances.tag_id,
            start_page_id: schema.tag_appearances.start_page_id,
        })
        .from(schema.tag_appearances)
        .where(
            inArray(schema.tag_appearances.start_page_id, [
                ...new Set(pageIds),
            ]),
        )
        .all();
    return new Set(rows.map((a) => `${a.tag_id}:${a.start_page_id}`));
}

/**
 * Keeps tag appearances when their start page is deleted (defined coordinates, owner decision 3).
 * A tag appearance applies from its start page onward, so a deleted page's appearance moves to the
 * next page that isn't being deleted: that page and everything after it look as they did. If that
 * page already has an appearance for the same tag (`UNIQUE(tag_id, start_page_id)`), the deleted
 * page's one is dropped, since the next page's own one was already in effect there. After the last
 * page there is no page for it to apply to, so it is dropped.
 *
 * Call it in the delete's transaction, before the page rows go: `start_page_id` cascades on page
 * delete, so afterwards there is nothing left to move. One undo then restores both.
 */
export async function moveTagAppearancesOffPagesInTransaction({
    tx,
    pageIds,
}: {
    tx: DbTransaction;
    pageIds: ReadonlySet<number>;
}): Promise<void> {
    if (pageIds.size === 0) return;
    const onDeleted = await tx
        .select({
            id: schema.tag_appearances.id,
            tag_id: schema.tag_appearances.tag_id,
            start_page_id: schema.tag_appearances.start_page_id,
        })
        .from(schema.tag_appearances)
        .where(inArray(schema.tag_appearances.start_page_id, [...pageIds]))
        .all();
    if (onDeleted.length === 0) return;

    const order = (
        await tx
            .select({ id: schema.pages.id })
            .from(schema.pages)
            .innerJoin(
                schema.beats,
                eq(schema.beats.id, schema.pages.start_beat),
            )
            .orderBy(asc(schema.beats.position))
            .all()
    ).map((p) => p.id);
    const nextKept = (pageId: number): number | undefined => {
        const index = order.indexOf(pageId);
        if (index === -1) return undefined;
        for (let i = index + 1; i < order.length; i++)
            if (!pageIds.has(order[i]!)) return order[i];
        return undefined;
    };

    const taken = await tagsStartingOn(
        tx,
        onDeleted
            .map((a) => nextKept(a.start_page_id))
            .filter((id) => id !== undefined),
    );

    // Latest deleted page first: of several deleted pages with the same tag, the one nearest the
    // next page is the one that was in effect there
    const position = new Map(order.map((id, i) => [id, i]));
    onDeleted.sort(
        (a, b) =>
            (position.get(b.start_page_id) ?? 0) -
            (position.get(a.start_page_id) ?? 0),
    );
    const dropped: number[] = [];
    for (const appearance of onDeleted) {
        const target = nextKept(appearance.start_page_id);
        const key = `${appearance.tag_id}:${target}`;
        if (target === undefined || taken.has(key)) {
            dropped.push(appearance.id);
            continue;
        }
        taken.add(key);
        await tx
            .update(schema.tag_appearances)
            .set({ start_page_id: target })
            .where(eq(schema.tag_appearances.id, appearance.id));
    }
    if (dropped.length > 0)
        await tx
            .delete(schema.tag_appearances)
            .where(inArray(schema.tag_appearances.id, dropped));
}
