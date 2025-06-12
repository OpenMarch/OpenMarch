export type MarcherCoord = {
    coordinate: { x: number; y: number };
    id: number;
};

type CoordMap = Map<number, MarcherCoord>;

/**
 * Selects marchers within a specified radius of the currently selected marchers.
 * Uses a breadth-first search approach to find connected marchers.
 *
 * @param allMarchers - Array of all marchers on the field
 * @param selectedMarchers - Array of currently selected marchers
 * @param radius - Maximum distance to consider for nearby marchers (default: 2.0)
 * @returns Array of selected marchers including the newly found nearby ones
 */
export function selectNearbyMarchers(
    allMarchers: MarcherCoord[],
    selectedMarchers: MarcherCoord[],
    radius: number = 2.0,
): MarcherCoord[] {
    const byId: CoordMap = new Map(allMarchers.map((m) => [m.id, m]));
    const visited = new Set<number>();
    const queue: number[] = selectedMarchers.map((m) => m.id);

    while (queue.length > 0) {
        const currentId = queue.pop()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const current = byId.get(currentId);
        if (!current) continue;

        for (const marcher of allMarchers) {
            if (visited.has(marcher.id)) continue;
            const dx = marcher.coordinate.x - current.coordinate.x;
            const dy = marcher.coordinate.y - current.coordinate.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
                queue.push(marcher.id);
            }
        }
    }

    return Array.from(visited).map((id) => byId.get(id)!);
}
