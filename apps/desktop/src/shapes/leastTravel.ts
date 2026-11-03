import { hungarianAlgorithm } from "@openmarch/core";
import { walksCross } from "./geometry/segments";
import type { XY } from "./types";

/**
 * How the "nearest" order picks who goes where: given where each marcher starts and the spots
 * of the new shape (the same count), return the spot index for each marcher, in `from` order.
 *
 * This is the one place that decides it. `assignSlots` calls `leastTravel` unless it is handed
 * another solver, so a better rule (for example one that also weighs step size or drill order)
 * can replace it without touching the shape kinds or the tool.
 */
export type LeastTravelSolver = (
    from: readonly XY[],
    spots: readonly XY[],
) => number[];

/**
 * Least total SQUARED travel (the Hungarian algorithm), then any crossing walks swapped apart.
 *
 * Squared, not plain distance: when a line slides along itself, plain distance has ties (two end
 * marchers can leapfrog the whole line for the same total), so the answer depends on the order
 * the marchers happen to be listed in. Squared distance makes everyone taking an even step
 * cheapest, so a line keeps its order because that's the least travel, not because of the old
 * order.
 */
export const leastSquaredTravel: LeastTravelSolver = (from, spots) => {
    const n = from.length;
    if (spots.length !== n)
        throw new Error("Each marcher needs exactly one spot");
    if (n === 0) return [];
    const cost = from.map((p) =>
        spots.map((s) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2),
    );
    // assignment[spot + 1] = marcher + 1
    const assignment = hungarianAlgorithm(cost, n);
    const result = new Array<number>(n);
    for (let spot = 0; spot < n; spot++)
        result[assignment[spot + 1]! - 1] = spot;
    return untangle(result, from, spots);
};

/**
 * Least travel onto at least as many spots as marchers: the spot index for each marcher, in
 * `from` order, leaving the spots no one needs empty (a placed Line with holes keeps them, #528)
 */
export function leastTravelOnto(
    from: readonly XY[],
    spots: readonly XY[],
): number[] {
    const n = spots.length;
    if (from.length > n) throw new Error("More marchers than spots");
    if (from.length === 0) return [];
    // Stand-ins for the empty spots, who cost nothing wherever they go
    const cost = spots.map((_, i) =>
        i < from.length
            ? spots.map(
                  (s) => (from[i]!.x - s.x) ** 2 + (from[i]!.y - s.y) ** 2,
              )
            : spots.map(() => 0),
    );
    // assignment[spot + 1] = marcher + 1
    const assignment = hungarianAlgorithm(cost, n);
    const result = new Array<number>(from.length);
    for (let spot = 0; spot < n; spot++) {
        const marcher = assignment[spot + 1]! - 1;
        if (marcher < from.length) result[marcher] = spot;
    }
    return untangle(result, from, spots);
}

/** The solver `assignSlots` uses for the "nearest" order unless it is given another */
export const leastTravel: LeastTravelSolver = leastSquaredTravel;

/**
 * Swaps the spots of any two marchers whose walks cross, until none do. Each swap shortens the
 * pair's total walk (the two crossing segments are the diagonals of a quadrilateral, longer
 * than either pair of its sides), so the total walk only shrinks and the loop ends with no
 * crossings left. The least-squares match it starts from rarely needs many.
 */
function untangle(
    result: number[],
    from: readonly XY[],
    spots: readonly XY[],
): number[] {
    const walk = (i: number) => ({ from: from[i]!, to: spots[result[i]!]! });
    const n = result.length;
    for (let pass = 0; pass < 4 * n + 10; pass++) {
        let swapped = false;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (walksCross(walk(i), walk(j))) {
                    [result[i], result[j]] = [result[j]!, result[i]!];
                    swapped = true;
                }
            }
        }
        if (!swapped) break;
    }
    return result;
}
