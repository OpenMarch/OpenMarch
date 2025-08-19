import Marcher from "@/global/classes/Marcher";
import { getByMarcherId } from "@/global/classes/MarcherPage";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import Page from "@/global/classes/Page";
import { getCoordinatesAtTime, MarcherTimeline } from "@/utilities/Keyframes";

const COLLISION_RADIUS = 10; // can probably be changed on the marcher level later on
const COLLISION_CHECK_INTERVAL = 100; //check every 100ms
const collisionCacheRef = new Map<number, CollisionData[]>();
const pageHashCacheRef = new Map<number, string>();

export interface CollisionData {
    marcher1Id: number;
    marcher2Id: number;
    x: number;
    y: number;
    distance: number;
}

const getPageHash = (
    page: Page,
    marchers: Marcher[],
    marcherPages: MarcherPageMap,
) => {
    // filter marchers that belong to this page
    const pageMarchers = marchers.filter((m) => {
        const marcherPagesForMarcher = getByMarcherId(marcherPages, m.id);
        return marcherPagesForMarcher.some((mp) => mp.page_id === page.id);
    });

    // create marcher has
    const marchersHash = pageMarchers
        .map((m) => {
            const marcherPageData = getByMarcherId(marcherPages, m.id).find(
                (mp) => mp.page_id === page.id,
            );
            return `${m.id}-${m.drill_number}-${marcherPageData?.x}-${marcherPageData?.y}-${marcherPageData?.path_data}`;
        })
        .sort()
        .join(",");

    return `${page.id}-${page.timestamp}-${page.duration}-${marchersHash}-${COLLISION_RADIUS}`;
};

const sweepNPruneCollision = (
    page: Page,
    marchers: Marcher[],
    marcherTimelines: Map<number, MarcherTimeline>,
) => {
    const collisionPairs = new Set<string>();
    const collisions: CollisionData[] = [];
    const pageStartTime = page.timestamp * 1000; //convert to ms for more precision
    const pageEndTime = (page.timestamp + page.duration) * 1000;

    // pre calculate positions
    for (
        let time = pageStartTime;
        time < pageEndTime;
        time += COLLISION_CHECK_INTERVAL
    ) {
        const marcherPositionsAtTime: Array<{
            id: number;
            x: number;
            y: number;
        }> = [];

        for (const marcher of marchers) {
            const timeline = marcherTimelines.get(marcher.id);
            if (!timeline) continue;

            try {
                const position = getCoordinatesAtTime(time, timeline);
                marcherPositionsAtTime.push({
                    id: marcher.id,
                    x: position.x,
                    y: position.y,
                });
            } catch (e) {
                // Skip if marcher doesn't have position at this time
                continue;
            }
        }

        // Precompute x-intervals (or just sort by x)
        const pts = marcherPositionsAtTime.map((p, idx) => ({
            id: p.id,
            x: p.x,
            y: p.y,
        }));
        pts.sort((a, b) => a.x - b.x);

        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            // Compare only forward while x is within 2R
            for (let j = i + 1; j < pts.length; j++) {
                const b = pts[j];
                const dx = b.x - a.x;
                const collisionStr = `${a.id},${b.id}`;
                if (dx > 2 * COLLISION_RADIUS) break; // beyond possible overlap in x
                if (collisionPairs.has(collisionStr)) continue; // we have seen this pair before we only want the first instance

                // Exact check in 2D (squared distance, no sqrt)
                const dy = b.y - a.y;
                const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
                if (distance <= COLLISION_RADIUS) {
                    collisionPairs.add(collisionStr);
                    collisions.push({
                        distance: distance,
                        marcher1Id: a.id,
                        marcher2Id: b.id,
                        x: a.x,
                        y: a.y,
                    });
                }
            }
        }
    }
    return collisions;
};
// Incremental collision calculation with caching

const getPageCollisions = (
    marchers: Marcher[],
    marcherTimelines: Map<number, MarcherTimeline>,
    pages: Page[],
    marcherPages: MarcherPageMap,
) => {
    if (!marchers.length || !pages.length || marcherTimelines.size === 0) {
        collisionCacheRef.clear();
        pageHashCacheRef.clear();
        return new Map<number, CollisionData[]>();
    }

    const startTime = performance.now();
    let pagesRecalculated = 0;
    let pagesFromCache = 0;

    const collisionsMap = new Map<number, CollisionData[]>();

    for (const page of pages) {
        const currentHash = getPageHash(page, marchers, marcherPages);
        const cachedHash = pageHashCacheRef.get(page.id);

        // Check if we can use cached collision data
        if (cachedHash === currentHash && collisionCacheRef.has(page.id)) {
            // Use cached collision data
            const cachedCollisions = collisionCacheRef.get(page.id)!;
            collisionsMap.set(page.id, cachedCollisions);
            pagesFromCache++;
        } else {
            // Recalculate collisions for this page
            const collisions = sweepNPruneCollision(
                page,
                marchers,
                marcherTimelines,
            );
            collisionsMap.set(page.id, collisions);

            // Update cache
            collisionCacheRef.set(page.id, collisions);
            pageHashCacheRef.set(page.id, currentHash);
            pagesRecalculated++;
        }
    }

    // Clean up cache for pages that no longer exist in case user deletes page
    const existingPageIds = new Set(pages.map((p) => p.id));
    for (const cachedPageId of collisionCacheRef.keys()) {
        if (!existingPageIds.has(cachedPageId)) {
            collisionCacheRef.delete(cachedPageId);
            pageHashCacheRef.delete(cachedPageId);
        }
    }

    const endTime = performance.now();
    console.log(
        `Collision calculation: ${pagesRecalculated} pages recalculated, ${pagesFromCache} pages from cache in ${(endTime - startTime).toFixed(2)}ms`,
    );

    return collisionsMap;
};

export default getPageCollisions;
