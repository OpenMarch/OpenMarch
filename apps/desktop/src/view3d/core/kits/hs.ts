import { ft } from "../environment";
import type { KitBuilder } from "../types";
import { schoolDress } from "./hs/dress";
import type { SiteLayout } from "./hs/site";
import { buildStandsKit } from "./stands";

/** Grass of the outer ground, matched to the painted site's base color. */
export const HS_GRASS = 0x587a3c;

/**
 * The small town campus: a one-story brick school with a metal-roofed gym,
 * overflow parking on the mown grass behind the home stand, and a tree line.
 */
export const HS_SITE: SiteLayout = {
    size: 640,
    grass: "#587a3c",
    lots: [{ dx: 125, dz: -152, w: 78, d: 44 }],
    grassLots: [{ dx: -8, dz: 108, w: 220, d: 44 }],
    pads: [
        // walkway behind the home stand and the gate plaza
        { dx: 0, dz: 72, w: 96, d: 8 },
        { dx: 0, dz: 44, w: 10, d: 8 },
        { dx: 125, dz: -124, w: 78, d: 6 },
    ],
    walks: [
        {
            points: [
                [-48, 76],
                [-60, 60],
                [-66, 44],
            ],
            width: 3,
        },
        {
            points: [
                [48, 76],
                [56, 54],
            ],
            width: 3,
        },
        {
            points: [
                [-100, 0],
                [-125, 0],
                [-135, 30],
                [-135, 86],
            ],
            width: 3,
        },
        {
            points: [
                [-30, -110],
                [-30, -148],
            ],
            width: 3,
        },
    ],
    roads: [
        {
            points: [
                [-340, 138],
                [340, 138],
            ],
            width: 8,
        },
        {
            points: [
                [125, 138],
                [125, -130],
            ],
            width: 6,
        },
    ],
    fields: [{ dx: -5, dz: -96, w: 110, d: 46 }],
    bandLots: [{ dx: 128, dz: -48, w: 50, d: 30 }],
    courts: [],
    ponds: [],
    diamonds: [{ dx: 158, dz: 70, angle: Math.PI / 4 }],
    buildings: [
        // the school, its gym and an ag shop, behind the visitor side
        { dx: -30, dz: -162, w: 120, d: 22, h: 4.8, canopy: 1 },
        { dx: -30, dz: -150, w: 26, d: 8, h: 6.2, trim: true },
        { dx: 42, dz: -160, w: 30, d: 16, h: 4.2 },
        { dx: -78, dz: -188, w: 42, d: 30, h: 4.4 },
        { dx: -8, dz: -190, w: 30, d: 32, h: 5.4 },
        { dx: 72, dz: -164, w: 38, d: 34, h: 9.5, gable: true },
        {
            dx: 180,
            dz: -100,
            w: 26,
            d: 14,
            h: 5.2,
            gable: true,
            tint: 0xb0b6be,
        },
        // field house behind the side-1 end zone
        { dx: -128, dz: -4, w: 18, d: 34, h: 4.6, trim: true },
        // concession stand by the home gate
        { dx: 54, dz: 47, w: 12, d: 7, h: 3.6, awning: -1 },
    ],
    clear: [
        { dx: 0, dz: 4, w: 190, d: 150 },
        { dx: -94, dz: 0, w: 14, d: 20 },
        { dx: 0, dz: 138, w: 680, d: 14 },
        { dx: 125, dz: -40, w: 14, d: 360 },
    ],
    trees: { ring: 150, clusters: 18, perCluster: 7 },
    scoreboard: { dx: -96, dz: 0, yaw: Math.PI / 2, w: 10.4, bottom: 4 },
    flagpole: { dx: -94, dz: 16 },
    buses: { dx: 100, dz: -74, count: 4 },
    treeRows: [{ dx0: -42, dx1: 42, dz: 86, n: 6 }],
    lampRows: [{ dx0: -36, dx1: 36, dz: 64, h: 3.2, n: 7 }],
    washes: [
        { dx: 0, dz: 0, w: 230, d: 180, k: 0.26 },
        { dx: 0, dz: 58, w: 90, d: 22, k: 0.55 },
        { dx: 0, dz: -60, w: 70, d: 18, k: 0.4 },
        { dx: 54, dz: 47, w: 24, d: 18, k: 0.7 },
        { dx: -30, dz: -148, w: 120, d: 26, k: 0.3 },
    ],
    cars: 0.62,
    seed: 41,
};

/**
 * High school kit (design.md section 6, P2.3): a small town field behind a
 * school. Aluminum bleachers on steel frames, a home stand with a press box
 * and a filming deck, a smaller visitor stand, a 6-lane track inside a
 * chain-link fence, goal posts, a scoreboard, a podium and four poles. Day,
 * dusk and night; default day.
 */
export const buildHs: KitBuilder = (input) =>
    buildStandsKit(
        {
            id: "hs",
            groundColor: HS_GRASS,
            track: true,
            front: {
                gap: ft(52),
                spec: {
                    length: ft(260),
                    rows: 28,
                    depth: ft(2.6),
                    rise: ft(1),
                    base: ft(4),
                    pressBox: { width: ft(90), height: ft(12), lift: ft(8) },
                },
            },
            back: {
                gap: ft(52),
                spec: {
                    length: ft(200),
                    rows: 14,
                    depth: ft(2.6),
                    rise: ft(1),
                    base: ft(3),
                },
            },
            podium: true,
            poles: {
                height: ft(90),
                spots: [
                    { sx: -1, dx: ft(35), front: true, dz: ft(40) },
                    { sx: 1, dx: ft(35), front: true, dz: ft(40) },
                    { sx: -1, dx: ft(35), front: false, dz: ft(40) },
                    { sx: 1, dx: ft(35), front: false, dz: ft(40) },
                ],
            },
            cameras: {
                pressTargetBack: ft(12),
                endZone: { sx: 1, dx: ft(70), y: ft(28), dz: 5 },
                topDownHeight: ft(620),
            },
            crowdDensity: 0.72,
            defaultLighting: "day",
            dress: (ctx) =>
                schoolDress({ kind: "aluminum", site: HS_SITE }, ctx),
        },
        input,
    );
