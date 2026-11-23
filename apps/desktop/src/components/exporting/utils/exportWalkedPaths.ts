import {
    createWalkedPaths,
    walkedPathPointAt,
    walkedPathToSvg,
    type TimelineSnapshot,
    type WalkedPath,
    type WalkResolver,
} from "@openmarch/core";
import { pageEndBeat } from "@/timeline/pageEndBeat";

/**
 * The walked paths a drill chart draws between pages (pathways step 18, spec R-20 item 10): the
 * path a marcher actually walks from one page's end beat to another's, from the core's drawable
 * walked path. A walk that is one straight run has no entry, so the chart draws the straight
 * line it always has, and a show with no curves, bends or stops on the way exports the same
 * bytes as before.
 */

/** A walked path between two pages, ready to draw. */
export interface ExportWalk {
    /** SVG path data in field pixels, as the dots are */
    d: string;
    /** Where the marcher is halfway through the beats between the two pages */
    mid: { x: number; y: number };
}

/**
 * The walk of `marcherId` from page `fromPageId`'s end beat to page `toPageId`'s, or undefined
 * when it is a straight line between the two positions (or either page is unknown).
 */
export type ExportWalkedPaths = (
    marcherId: number,
    fromPageId: number,
    toPageId: number,
) => ExportWalk | undefined;

/** What the walked paths are read from: a resolver and the tables it was built from. */
export interface ExportWalkSource {
    host: TimelineSnapshot;
    resolver: WalkResolver;
}

/** How far a walk may stray from the straight line and still be drawn as it, in field pixels. */
const STRAIGHT_TOLERANCE = 1e-6;

/**
 * Whether the path is one straight run from its start to its end: only lines, every corner on
 * the chord and none walked backward. The chart's own straight line draws the same thing.
 */
export function isStraightWalk(path: WalkedPath): boolean {
    const { segments } = path;
    if (segments.length === 0) return true;
    const [ax, ay] = segments[0]!.from;
    const [bx, by] = segments[segments.length - 1]!.to;
    const length = Math.hypot(bx - ax, by - ay);
    let along = 0;
    for (const segment of segments) {
        if (segment.kind !== "line") return false;
        const [x, y] = segment.to;
        if (length < STRAIGHT_TOLERANCE) {
            // out and back to the same spot is not a straight run
            if (Math.hypot(x - ax, y - ay) > STRAIGHT_TOLERANCE) return false;
            continue;
        }
        const off = ((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / length;
        const at = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length;
        if (Math.abs(off) > STRAIGHT_TOLERANCE) return false;
        if (at < along - STRAIGHT_TOLERANCE) return false;
        along = at;
    }
    return true;
}

/** The walked paths between the pages of one snapshot; each is worked out once, when first asked for. */
export function exportWalkedPaths(
    { host, resolver }: ExportWalkSource,
    pages: readonly {
        readonly id: number;
        readonly beats: readonly { readonly index: number }[];
    }[],
): ExportWalkedPaths {
    const endBeats = new Map(pages.map((page) => [page.id, pageEndBeat(page)]));
    const known = new Set(host.marchers.map((marcher) => marcher.id));
    // one batch for the whole export: what a move's marchers share is worked out once
    const walked = createWalkedPaths(host, resolver);
    const cache = new Map<string, ExportWalk | undefined>();
    return (marcherId, fromPageId, toPageId) => {
        const key = `${marcherId}:${fromPageId}:${toPageId}`;
        if (cache.has(key)) return cache.get(key);
        const from = endBeats.get(fromPageId);
        const to = endBeats.get(toPageId);
        let walk: ExportWalk | undefined;
        if (
            from !== undefined &&
            to !== undefined &&
            to > from &&
            known.has(marcherId)
        ) {
            try {
                const path = walked.path(marcherId, from, to);
                if (!isStraightWalk(path)) {
                    const mid = walkedPathPointAt(path, (from + to) / 2)!;
                    walk = {
                        d: walkedPathToSvg(path),
                        mid: { x: mid[0], y: mid[1] },
                    };
                }
            } catch (error) {
                // The chart still exports, with the straight line it drew before
                console.error(
                    `Couldn't work out the walked path of marcher ${marcherId}`,
                    error,
                );
            }
        }
        cache.set(key, walk);
        return walk;
    };
}
