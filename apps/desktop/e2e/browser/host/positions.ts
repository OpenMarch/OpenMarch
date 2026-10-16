import {
    createResolver,
    FieldProperties,
    type Resolver,
} from "@openmarch/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@om-electron/database/migrations/schema";
import { readTimelineTables } from "@/timeline/timelineRows";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/pageEndBeat";
import type { DbConnection } from "@/db-functions/types";

/**
 * Where a show file puts each marcher, read the way the app reads it: the
 * app's own `readTimelineTables` builds the resolver's input, and the
 * resolver gives each marcher's position at a page's end beat
 * (`pageEndBeat`). Bundled into the host so the app's modules resolve; the
 * tests call it through `e2e/browser/positions.mts`.
 */

/** Reads the show file: SQL and parameters in, rows as objects out. */
export type ShowQuery = <T = Record<string, unknown>>(
    sql: string,
    ...params: (string | number | null)[]
) => Promise<T[]>;

export type Position = { id: number; x: number; y: number };

/** A read-only Drizzle connection over `query`. */
const showDb = (query: ShowQuery) =>
    drizzle(
        async (sql, params, method) => {
            const rows = (
                await query(sql, ...(params as (string | number | null)[]))
            ).map((row) => Object.values(row as object));
            return { rows: method === "get" ? (rows[0] ?? []) : rows };
        },
        { schema },
    ) as unknown as DbConnection;

/** The resolver for the show file as it is now. */
export async function showResolver(query: ShowQuery): Promise<Resolver> {
    const { snapshot } = await readTimelineTables(showDb(query));
    return createResolver(snapshot);
}

/** Each page's end beat, by page id, from the app's own page timing. */
export async function pageEndBeats(
    query: ShowQuery,
): Promise<Map<number, number>> {
    const { pages } = await readShowTiming(showDb(query));
    return new Map(pages.map((page) => [page.id, pageEndBeat(page)]));
}

/** Every marcher's position at the end of page `pageId`, by marcher id. */
export async function savedPositions(
    query: ShowQuery,
    pageId: number,
): Promise<Position[]> {
    const endBeat = (await pageEndBeats(query)).get(pageId);
    if (endBeat === undefined) throw new Error(`No page ${pageId}`);
    const resolver = await showResolver(query);
    return [...resolver.marcherIds()]
        .sort((a, b) => a - b)
        .map((id) => {
            const [x, y] = resolver.positionAt(id, endBeat);
            return { id, x, y };
        });
}

/** The grid coordinate rounding measures on: steps in field units, and center front. */
export type FieldGrid = {
    pixelsPerStep: number;
    centerFront: { x: number; y: number };
};

/** The show's field grid, read through the app's `FieldProperties`. */
export async function fieldGrid(query: ShowQuery): Promise<FieldGrid> {
    const [row] = await query<{ json_data: string }>(
        "SELECT json_data FROM field_properties WHERE id = 1",
    );
    const field = new FieldProperties(JSON.parse(row.json_data));
    return {
        pixelsPerStep: field.pixelsPerStep,
        centerFront: {
            x: field.centerFrontPoint.xPixels,
            y: field.centerFrontPoint.yPixels,
        },
    };
}
