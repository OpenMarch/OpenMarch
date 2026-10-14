/**
 * Uniform part Artwork panels on the median v4u body (docs/3d/props-spec.md
 * §8 "Contents", ADR 0002 D-18): the size an Artwork means "as worn by the
 * reference body", before grading to the other body types.
 *
 * Derived from the vendored om-pose bodies (`assets/om-pose/bodies`, commit
 * in `SOURCE.json`). For each part and side, each body's panel is the X × Y
 * bounding box (glTF axes: +X performer's left, +Y up, +Z forward) of the
 * part's rest-pose vertices on that side of the body (front `z >= 0`, back
 * `z < 0`); the template takes the median width and the median height across
 * the seven body types, rounded to the millimeter. The test
 * `uniformPanels.test.ts` re-measures the bodies and checks these figures.
 *
 * The Overlay is the cape (`_PART` 12), which sits wholly behind the body, so
 * it has a back panel only.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { lengthOf, type Length } from "../sizes/units";

export type UniformArtworkPart = "top" | "bottoms" | "overlay";
export type UniformSide = "front" | "back";

/** The body's `_PART` ids each Artwork-bearing part covers (uniform-shader.js). */
export const UNIFORM_PART_IDS: Readonly<Record<UniformArtworkPart, number>> = {
    top: 1, // jacket; sleeves (2) are left out: art wraps poorly onto them
    bottoms: 3,
    overlay: 12,
};

export interface UniformPanel {
    readonly part: UniformArtworkPart;
    readonly side: UniformSide;
    readonly width: Length;
    readonly height: Length;
}

const mm = (value: number) => lengthOf(value, "mm");

export const MEDIAN_V4U_PANELS: readonly UniformPanel[] = [
    { part: "top", side: "front", width: mm(464), height: mm(568) },
    { part: "top", side: "back", width: mm(420), height: mm(601) },
    { part: "bottoms", side: "front", width: mm(416), height: mm(859) },
    { part: "bottoms", side: "back", width: mm(411), height: mm(895) },
    { part: "overlay", side: "back", width: mm(500), height: mm(430) },
];
