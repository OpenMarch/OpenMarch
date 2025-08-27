import Marcher from "@/global/classes/Marcher";
import { getByMarcherId } from "@/global/classes/MarcherPage";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import Page from "@/global/classes/Page";
import { useMarcherVisualStore } from "@/stores/MarcherVisualStore";
import { getCoordinatesAtTime, MarcherTimeline } from "@/utilities/Keyframes";

const COLLISION_RADIUS = 10; // can probably be changed on the marcher level later on
const COLLISION_CHECK_INTERVAL = 100; //check every 100ms
const collisionCacheRef = new Map<number, CollisionData[]>();
const pageHashCacheRef = new Map<number, number>();
// Cache for velocity calculations to avoid recalculating
const velocityCacheRef = new Map<number, number>();

export interface CollisionData {
    marcher1Id: number;
    marcher2Id: number;
    label: string;
    x: number;
    y: number;
    distance: number;
}

const getPageHash = (
    page: Page,
    marchers: Marcher[],
    marcherPages: MarcherPageMap,
) => {
    // Sum all x values for marchers on this page
    const xSum = marchers.reduce((sum, m) => {
        const marcherPageData = getByMarcherId(marcherPages, m.id).find(
            (mp) => mp.page_id === page.id,
        );
        return sum + (marcherPageData?.x || 0);
    }, 0);

    // Fit the x sum into 20 bits using modulo to ensure it fits
    const xSumBits = Math.abs(Math.floor(xSum)) & 0xfffff; // 20 bits

    // 32-bit hash structure: [12 bits timestamp][20 bits xSum]
    const timestampBits = (Math.floor(page.timestamp) & 0xfff) << 20; // 12 bits shifted left by 20
    const xSumFits = xSumBits & 0xfffff; // Ensure it fits in 20 bits

    const finalHash = timestampBits | xSumFits;
    // Convert to unsigned 32-bit integer
    return finalHash >>> 0;
};

const calculateMaxVelocity = (
    page: Page,
    marcherTimelines: Map<number, MarcherTimeline>,
): number => {
    const pageStartTime = page.timestamp * 1000;
    const pageEndTime = (page.timestamp + page.duration) * 1000;
    const pageDurationMs = pageEndTime - pageStartTime;

    let maxVelocity = 0;
    for (const [marcherId, timeline] of marcherTimelines.entries()) {
        if (!timeline) continue;

        try {
            const startPos = getCoordinatesAtTime(pageStartTime, timeline);
            const endPos = getCoordinatesAtTime(pageEndTime, timeline);

            // Calculate distance traveled
            const distance = Math.sqrt(
                Math.pow(endPos.x - startPos.x, 2) +
                    Math.pow(endPos.y - startPos.y, 2),
            );

            // Calculate velocity (distance per ms)
            const velocity = distance / pageDurationMs;
            maxVelocity = Math.max(maxVelocity, velocity);
        } catch (e) {
            // Skip if marcher doesn't have valid positions
            continue;
        }
    }
    return maxVelocity;
};

const getMarcherLabels = (id1: number, id2: number) => {
    const marcherVisuals = useMarcherVisualStore.getState().marcherVisuals;
    const vis1 = marcherVisuals[id1];
    const vis2 = marcherVisuals[id2];
    if (!vis1 || !vis2) return `${id1},${id2}`;

    return `${vis1.getCanvasMarcher().textLabel.text}, ${vis2.getCanvasMarcher().textLabel.text}`;
};

const sweepNPruneCollision = (
    page: Page,
    marcherTimelines: Map<number, MarcherTimeline>,
) => {
    const collisionPairs = new Set<string>();
    const collisions: CollisionData[] = [];
    const pageStartTime = page.timestamp * 1000; //convert to ms for more precision
    const pageEndTime = (page.timestamp + page.duration) * 1000;

    // Get cached velocity or calculate it
    let maxVelocity = velocityCacheRef.get(page.id);
    if (maxVelocity === undefined) {
        maxVelocity = calculateMaxVelocity(page, marcherTimelines);
        velocityCacheRef.set(page.id, maxVelocity);
    }

    // Calculate dynamic interval based on max velocity and collision radius
    // Rule: Check often enough that fastest marcher can't move more than COLLISION_RADIUS/4 between checks
    const minCheckDistance = COLLISION_RADIUS / 2;
    let dynamicInterval =
        maxVelocity > 0
            ? minCheckDistance / maxVelocity
            : COLLISION_CHECK_INTERVAL;

    // Clamp the interval to reasonable bounds (10ms to 500ms)
    dynamicInterval = Math.max(50, Math.min(500, dynamicInterval));

    // pre calculate positions
    for (
        let time = pageStartTime;
        time < pageEndTime;
        time += dynamicInterval
    ) {
        const marcherPositionsAtTime: Array<{
            id: number;
            x: number;
            y: number;
        }> = [];

        for (const [marcherId, timeline] of marcherTimelines.entries()) {
            if (!timeline) continue;

            try {
                const position = getCoordinatesAtTime(time, timeline);
                marcherPositionsAtTime.push({
                    id: marcherId,
                    x: position.x,
                    y: position.y,
                });
            } catch (e) {
                // Skip if marcher doesn't have position at this time
                console.warn(`Marcher ${marcherId} has no position at ${time}`);
                continue;
            }
        }

        // Precompute x-intervals (or just sort by x)
        const pts = marcherPositionsAtTime.map((p) => ({
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
                const collisionStr = [a.id, b.id].sort().join(",");
                if (dx > 2 * COLLISION_RADIUS) break; // beyond possible overlap in x
                if (collisionPairs.has(collisionStr)) continue; // we have seen this pair before we only want the first instance

                // Exact check in 2D (squared distance, no sqrt)
                const dy = b.y - a.y;
                const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
                if (distance <= COLLISION_RADIUS) {
                    collisionPairs.add(collisionStr);
                    const label = getMarcherLabels(a.id, b.id);
                    collisions.push({
                        distance: distance,
                        label,
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

export const getCollisionsForSelectedPage = (
    selectedPage: Page | null,
    pageCollisions: Map<number, CollisionData[]>,
) => {
    if (!selectedPage) {
        return [];
    }

    // this looks stupid but empty array if nothing is returned
    const collisions = selectedPage.nextPageId
        ? pageCollisions.get(selectedPage.nextPageId)
        : [];

    return collisions ?? [];
};

const getPageCollisions = (
    marchers: Marcher[],
    marcherTimelines: Map<number, MarcherTimeline>,
    pages: Page[],
    marcherPages: MarcherPageMap | undefined,
) => {
    if (
        !marchers.length ||
        !pages.length ||
        marcherTimelines.size === 0 ||
        !marcherPages
    ) {
        collisionCacheRef.clear();
        pageHashCacheRef.clear();
        velocityCacheRef.clear();
        return new Map<number, CollisionData[]>();
    }

    const collisionsMap = new Map<number, CollisionData[]>();

    for (const page of pages) {
        const currentHash = getPageHash(page, marchers, marcherPages);
        const cachedHash = pageHashCacheRef.get(page.id);

        // Check if we can use cached collision data
        if (cachedHash === currentHash && collisionCacheRef.has(page.id)) {
            // Use cached collision data
            const cachedCollisions = collisionCacheRef.get(page.id)!;
            collisionsMap.set(page.id, cachedCollisions);
        } else {
            // Recalculate collisions for this page AND the next page
            // Clear velocity cache when page data changes
            velocityCacheRef.delete(page.id);
            const collisions = sweepNPruneCollision(page, marcherTimelines);
            collisionsMap.set(page.id, collisions);

            // Update cache
            collisionCacheRef.set(page.id, collisions);
            pageHashCacheRef.set(page.id, currentHash);

            if (page.nextPageId) {
                const n = pages.filter((p) => p.id === page.nextPageId);
                const nextPage = n[0];
                const nextHash = getPageHash(nextPage, marchers, marcherPages);
                const nextCollisions = sweepNPruneCollision(
                    nextPage,
                    marcherTimelines,
                );

                collisionCacheRef.set(nextPage.id, nextCollisions);
                pageHashCacheRef.set(nextPage.id, nextHash);
            }
        }
    }

    // Clean up cache for pages that no longer exist in case user deletes page
    const existingPageIds = new Set(pages.map((p) => p.id));
    for (const cachedPageId of collisionCacheRef.keys()) {
        if (!existingPageIds.has(cachedPageId)) {
            collisionCacheRef.delete(cachedPageId);
            pageHashCacheRef.delete(cachedPageId);
            velocityCacheRef.delete(cachedPageId);
        }
    }

    return collisionsMap;
};

export default getPageCollisions;
