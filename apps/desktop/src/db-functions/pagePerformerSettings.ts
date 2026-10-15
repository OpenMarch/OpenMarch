/**
 * Per-set performer settings (ADR 0004 D-4): what each set's dot marks. No row means the show
 * default (`performerDefaults.dotMode` in the workspace settings, else foot). Deleting the page
 * deletes its row.
 */
import { asc, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";

/** What a set's dot marks: the landing foot or the body's center. */
export type DotMode = "foot" | "body";

export interface DatabasePagePerformerSettings {
    pageId: number;
    dotMode: DotMode;
}

/** A page's new dot mode; null removes the row, so the page follows the show default. */
export interface PageDotModeChange {
    pageId: number;
    dotMode: DotMode | null;
}

/** Every page's stored settings, in page id order. Pages with no row use the show default. */
export async function getPagePerformerSettings({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabasePagePerformerSettings[]> {
    const rows = await db
        .select()
        .from(schema.page_performer_settings)
        .orderBy(asc(schema.page_performer_settings.page_id))
        .all();
    return rows.map((row) => ({
        pageId: row.page_id,
        dotMode: row.dot_mode as DotMode,
    }));
}

/** Sets or clears pages' dot modes. */
export const setPageDotModesInTransaction = async ({
    tx,
    changes,
}: {
    tx: DbTransaction;
    changes: readonly PageDotModeChange[];
}): Promise<void> => {
    const cleared = changes
        .filter((c) => c.dotMode === null)
        .map((c) => c.pageId);
    if (cleared.length > 0)
        await tx
            .delete(schema.page_performer_settings)
            .where(inArray(schema.page_performer_settings.page_id, cleared))
            .run();
    for (const { pageId, dotMode } of changes) {
        if (dotMode === null) continue;
        await tx
            .insert(schema.page_performer_settings)
            .values({ page_id: pageId, dot_mode: dotMode })
            .onConflictDoUpdate({
                target: schema.page_performer_settings.page_id,
                set: { dot_mode: dotMode },
            })
            .run();
    }
};

/** Sets or clears pages' dot modes as one undoable edit. */
export async function setPageDotModes({
    db,
    changes,
}: {
    db: DbConnection;
    changes: readonly PageDotModeChange[];
}): Promise<void> {
    if (changes.length === 0) return;
    await transactionWithHistory(
        db,
        "setPageDotModes",
        async (tx) => await setPageDotModesInTransaction({ tx, changes }),
    );
}
