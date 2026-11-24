import type { Vector3Tuple } from "three";
import type { DieselFrame } from "./frame";

/**
 * What of the roof a camera at `camera` (kit-root space) sees cut away
 * (the cutaway in `roof.ts`'s header). `half(s)` is whether the half over
 * the side of sign `s` is hidden; the fixtures hanging under each half's
 * catwalk (`fixtures.ts`) go with it, so no lamp row floats in the air.
 * `center` is whether what hangs over the middle is hidden: from above the
 * roof, and whenever the camera is in the air over the middle of the field
 * above the speaker cluster's lowest array, where the cluster would fill the
 * view of the drill (a free camera zoomed out from the field rises right
 * through it). No seat is that close to the middle.
 */
export function dieselRoofCut(
    frame: DieselFrame,
    [x, y, z]: Vector3Tuple,
    high: boolean,
): { half(s: number): boolean; center: boolean } {
    const { ROOF, BUILDING, BOWL } = frame;
    const inside =
        Math.abs(x) <= BUILDING.halfX && Math.abs(z) <= BUILDING.halfZ;
    const above = inside
        ? y > ROOF.roofY(z) - ROOF.thickness - 1
        : y > ROOF.eaveY;
    // Over the field or beyond an end, both halves block the drill.
    const between = Math.abs(z) <= BOWL.halfZ;
    const overCluster =
        y > CLUSTER_CUT.y &&
        Math.abs(x) < CLUSTER_CUT.halfX &&
        Math.abs(z) < CLUSTER_CUT.halfZ;
    return {
        half: (s) => above && (!high || between || s * z > 0),
        center: above || overCluster,
    };
}

/**
 * The air over the middle where the speaker cluster is cut away: above its
 * lowest array (about 27 m), within about 30 m of it along the field and 25 m
 * across, inside the nearest seats.
 */
const CLUSTER_CUT = { y: 26, halfX: 30, halfZ: 25 };
