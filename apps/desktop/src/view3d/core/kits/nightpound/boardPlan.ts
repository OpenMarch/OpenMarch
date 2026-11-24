// cspell:ignore Daktronics
import { ft } from "../../environment/units";
import { SCOREBOARD_BOTTOM } from "./frame";
import { ARENA_CENTER_Z } from "./plan";

/**
 * The center-hung video board, kit-root space (`frame.ts`). The display
 * sizes and the 32 ft clearance are published (Daktronics, 2017, and WGI's
 * packets); the tilt and the cabinet are read off photos.
 */
export const BOARD = {
    /** The board hangs over the arena's center, not the competition area's. */
    x: 0,
    z: ARENA_CENTER_Z,
    /** The lower LED ring: 3 ft high, 75 ft around, square. */
    ringBottom: SCOREBOARD_BOTTOM,
    ringHeight: ft(3),
    ringSide: ft(75) / 4,
    /** The four main displays: 13.5 ft high by 20 ft wide. */
    faceWidth: ft(20),
    faceHeight: ft(13.5),
    faceBottom: 11,
    /**
     * A face's bottom edge is this far from the board's center, and its top
     * edge `faceLean` further out. Scaled off the 2025 packet photo against
     * the ring below: the board is 6.6 m across at the faces' feet and 7.7 m
     * at their heads, which leaves narrow wedges at the corners.
     */
    faceReach: 3.3,
    faceLean: 0.55,
} as const;

/** How far a face rises (its height is measured along the lean). */
export const BOARD_FACE_RISE = Math.sqrt(
    BOARD.faceHeight ** 2 - BOARD.faceLean ** 2,
);
export const BOARD_FACE_TOP = BOARD.faceBottom + BOARD_FACE_RISE;

/**
 * The auxiliary board in the back corner at the entry end: about 6 m by 3 m,
 * turned toward the front stand.
 */
export const AUX_BOARD = {
    x: 26,
    y: 12.5,
    z: -20,
    width: 6,
    height: 3,
    yaw: Math.atan2(-26, 30),
} as const;

/**
 * Where the textures put each screen: `u0, v0, u1, v1` in the board atlas
 * (V up). The main faces share the top half; a corner wedge and the
 * auxiliary board share the bottom half. A wedge is as wide as its top edge.
 */
const wedgeTop =
    Math.SQRT2 * (BOARD.faceReach + BOARD.faceLean - BOARD.faceWidth / 2);
const wedgeBottom = Math.SQRT2 * (BOARD.faceReach - BOARD.faceWidth / 2);
export const BOARD_WEDGE = { top: wedgeTop, bottom: wedgeBottom };
export const BOARD_ATLAS = {
    face: { u0: 0, v0: 0.5, u1: 1, v1: 1 },
    wedge: { u0: 0, v0: 0, u1: wedgeTop / BOARD.faceWidth, v1: 0.5 },
    aux: { u0: 0.42, v0: 0, u1: 1, v1: 0.5 },
} as const;
