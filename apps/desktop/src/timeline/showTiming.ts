import { asc } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
// Light modules, not `@/db-functions/page`, `beat` or `Page`, so the convert-on-open worker can
// load this.
import {
    realDatabaseBeatToDatabaseBeat,
    realDatabasePageToDatabasePage,
} from "@/db-functions/rowMappers";
import type Page from "@/global/classes/Page";
import { fromDatabasePages } from "@/global/classes/Page.fromDatabase";
import type Beat from "@/global/classes/Beat";
import { calculateTimestamps, fromDatabaseBeat } from "@/global/classes/Beat";

/** `utility.last_page_counts` when the file has no utility row (the column's default). */
const DEFAULT_LAST_PAGE_COUNTS = 8;

/** The show's beats (0-based `index`, cumulative `timestamp`) and pages, as the app builds them. */
export async function readShowTiming(
    tx: DbTransaction | DbConnection,
): Promise<{ beats: Beat[]; pages: Page[] }> {
    const beatRows = await tx
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const beats = calculateTimestamps(
        beatRows.map((b, i) =>
            fromDatabaseBeat(realDatabaseBeatToDatabaseBeat(b), i),
        ),
    );
    const pageRows = await tx.select().from(schema.pages).all();
    const utility = await tx.select().from(schema.utility).get();
    const pages = fromDatabasePages({
        databasePages: pageRows.map(realDatabasePageToDatabasePage),
        allMeasures: [],
        allBeats: [...beats],
        lastPageCounts: utility?.last_page_counts ?? DEFAULT_LAST_PAGE_COUNTS,
    });
    return { beats, pages };
}
