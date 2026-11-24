import { AREA, CURTAIN_TUNNEL, DRAPE_HEIGHT, ENTRY, EXIT } from "./frame";

/**
 * Nightpound's plan in WGI trim, kit-root space (`frame.ts`): the floor
 * between the stands, the back drape and the tunnel behind it, and the
 * openings at the back corners. Numbers from the cross-section in
 * docs/3d/nightpound.md (WGI packets for the floor, tunnels and drape;
 * photos and the seating chart for the rest).
 */

/**
 * The arena's center (basketball mid-court, under the center-hung board),
 * 9 ft in front of the competition area's: for WGI the front stand's lower
 * rows stay out and the back stand's fold away, so the floor sits back.
 */
export const ARENA_CENTER_Z = 2.74;

/** The arena floor, wall to wall, in WGI trim. */
export const FLOOR = {
    /** The end stands' front walls (row A at both ends). */
    minX: -19,
    maxX: 19,
    /** The front stand's wall: row A of 110 to 115, 5 ft past the floor. */
    maxZ: 13.41,
    /** The fixed wall under the back stand's cross aisle, behind the folded 100s. */
    minZ: -16.62,
};

/** The floor's front corners: 45-degree chamfers with 3 m legs. */
export const FRONT_CHAMFER = 3;

/** The back drape's face, just behind the competition area's back edge. */
export const DRAPE_Z = -(AREA.halfZ + 0.15);

/**
 * The drape box runs between the two back-corner openings: the entry at +X,
 * the exit at -X, each between the box's end and the end wall.
 */
export const DRAPE_RUN = {
    minX: FLOOR.minX + EXIT.width,
    maxX: FLOOR.maxX - ENTRY.width,
};

/** The box truss behind the drape, 0.3 m square. */
export const DRAPE_TRUSS = 0.3;

/** The curtain tunnel behind the drape's truss: front, back and roof. */
export const TUNNEL_PLAN = {
    front: DRAPE_Z - DRAPE_TRUSS,
    back: DRAPE_Z - DRAPE_TRUSS - CURTAIN_TUNNEL.width,
    roof: CURTAIN_TUNNEL.height,
};

/** The back 100s, folded into a stack between the tunnel and the fixed wall. */
export const STACK = {
    front: TUNNEL_PLAN.back,
    back: FLOOR.minZ,
    height: 3.05,
};

/** The drape box's top: black cloth on the truss, a little above the drape. */
export const DRAPE_TOP = Math.max(DRAPE_HEIGHT, CURTAIN_TUNNEL.height) + 0.05;
