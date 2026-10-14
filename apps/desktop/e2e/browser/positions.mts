import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Show } from "./fixtures.mjs";

/**
 * Where the show file puts each marcher at the end of a page, read the way
 * the app reads it (`host/positions.ts`, bundled with the host by
 * `pnpm run build:browser`, so the app's modules resolve). The file is read
 * through `show.query`, so this works for both targets without opening the
 * file a second time.
 */

export type Position = { id: number; x: number; y: number };

const hostBundle = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dist-browser-host/index.mjs",
);

let host: Promise<typeof import("./host/index")> | undefined;
const loadHost = () =>
    (host ??= import(pathToFileURL(hostBundle).href) as Promise<
        typeof import("./host/index")
    >);

/** Every marcher's position at the end of page `pageId`, by marcher id. */
export async function savedPositions(
    show: Pick<Show, "query">,
    pageId: number,
): Promise<Position[]> {
    const { savedPositions: read } = await loadHost();
    return read((sql, ...params) => show.query(sql, ...params), pageId);
}

/** One marcher's position at the end of page `pageId`. */
export async function savedPosition(
    show: Pick<Show, "query">,
    marcherId: number,
    pageId = 0,
): Promise<{ x: number; y: number }> {
    const found = (await savedPositions(show, pageId)).find(
        (position) => position.id === marcherId,
    );
    if (!found) throw new Error(`Marcher ${marcherId} has no position`);
    return { x: found.x, y: found.y };
}
