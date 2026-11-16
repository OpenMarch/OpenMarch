import { ft } from "../environment";
import type { KitBuilder } from "../types";
import { HS_GRASS } from "./hs";
import { schoolDress } from "./hs/dress";
import type { SiteLayout } from "./hs/site";
import { buildStandsKit } from "./stands";

/**
 * The suburban campus: paved lots with lamps and planted islands, a big
 * multi-wing school, an entry plaza, tennis courts and a retention pond.
 */
export const BIGHS_SITE: SiteLayout = {
    size: 760,
    grass: "#587a3c",
    lots: [
        { dx: -20, dz: 170, w: 280, d: 74 },
        { dx: 235, dz: 40, w: 60, d: 130 },
        { dx: -40, dz: -152, w: 180, d: 56 },
    ],
    grassLots: [],
    pads: [
        // concourses behind the stands and the entry plaza
        { dx: 0, dz: 98, w: 160, d: 18 },
        { dx: 0, dz: -74, w: 130, d: 10 },
        { dx: -112, dz: 0, w: 36, d: 76 },
    ],
    walks: [
        {
            points: [
                [-116, 55],
                [-116, 110],
                [-50, 124],
            ],
            width: 5,
        },
        {
            points: [
                [0, 107],
                [0, 124],
            ],
            width: 6,
        },
        {
            points: [
                [66, -74],
                [140, -110],
            ],
            width: 3,
        },
        {
            points: [
                [-40, -124],
                [-40, -180],
            ],
            width: 4,
        },
    ],
    roads: [
        {
            points: [
                [-400, 228],
                [400, 228],
            ],
            width: 10,
        },
        {
            points: [
                [285, 228],
                [285, -340],
            ],
            width: 8,
        },
        {
            points: [
                [-400, -290],
                [400, -290],
            ],
            width: 8,
        },
    ],
    fields: [{ dx: 170, dz: -130, w: 110, d: 55 }],
    bandLots: [{ dx: 150, dz: -48, w: 52, d: 32 }],
    courts: [
        { dx: -240, dz: -80, w: 36, d: 18 },
        { dx: -240, dz: -60, w: 36, d: 18 },
        { dx: -240, dz: -40, w: 36, d: 18 },
    ],
    ponds: [{ dx: -250, dz: 190, w: 90, d: 50 }],
    diamonds: [{ dx: -245, dz: 80, angle: (3 * Math.PI) / 4 }],
    buildings: [
        // field house and gates in the plaza
        { dx: -134, dz: 0, w: 16, d: 46, h: 6.5, trim: true },
        { dx: -98, dz: 46, w: 9, d: 7, h: 3.4, trim: true },
        { dx: -98, dz: -46, w: 11, d: 8, h: 3.8, awning: 1 },
        // the school beyond the visitor side
        { dx: -60, dz: -232, w: 210, d: 32, h: 8, canopy: 1, tint: 0xd8c8b6 },
        { dx: -120, dz: -262, w: 60, d: 28, h: 6, tint: 0xd8c8b6 },
        { dx: 88, dz: -226, w: 56, d: 48, h: 12, gable: true, tint: 0xd8c8b6 },
        { dx: 184, dz: -232, w: 70, d: 34, h: 8, tint: 0xd8c8b6 },
        { dx: 184, dz: -196, w: 40, d: 18, h: 5, tint: 0xd8c8b6, trim: true },
    ],
    clear: [
        { dx: 0, dz: 8, w: 210, d: 200 },
        { dx: 96, dz: 0, w: 20, d: 40 },
        { dx: 0, dz: 228, w: 820, d: 16 },
        { dx: 285, dz: -50, w: 14, d: 700 },
        { dx: 0, dz: -290, w: 820, d: 14 },
    ],
    trees: { ring: 170, clusters: 14, perCluster: 7 },
    flagpole: { dx: -108, dz: 52 },
    buses: { dx: 120, dz: -78, count: 6 },
    treeRows: [
        { dx0: -72, dx1: 72, dz: 112, n: 10 },
        { dx0: -130, dx1: -130, dz: 48, n: 1 },
    ],
    lampRows: [{ dx0: -60, dx1: 60, dz: 89, h: 4.5, n: 9 }],
    washes: [
        { dx: 0, dz: 0, w: 280, d: 220, k: 0.28 },
        { dx: 0, dz: 98, w: 160, d: 30, k: 0.7 },
        { dx: 0, dz: -74, w: 130, d: 22, k: 0.5 },
        { dx: -112, dz: 0, w: 46, d: 80, k: 0.45 },
        { dx: -60, dz: -212, w: 170, d: 24, k: 0.35 },
    ],
    cars: 0.5,
    seed: 57,
};

/**
 * Big high school kit (design.md section 6, P2.3): the hs track with concrete
 * stands, a three-story press box, a video board behind the side-2 end zone,
 * an entry plaza and field house behind the side-1 end zone, big lots and six
 * poles. Default night.
 */
export const buildBighs: KitBuilder = (input) =>
    buildStandsKit(
        {
            id: "bighs",
            groundColor: HS_GRASS,
            track: true,
            front: {
                gap: ft(52),
                spec: {
                    length: ft(340),
                    rows: 44,
                    depth: ft(2.7),
                    rise: ft(1.1),
                    base: ft(8),
                    pressBox: {
                        width: ft(180),
                        height: ft(36),
                        lift: ft(4),
                        stories: 3,
                    },
                },
            },
            back: {
                gap: ft(52),
                spec: {
                    length: ft(300),
                    rows: 30,
                    depth: ft(2.7),
                    rise: ft(1.05),
                    base: ft(6),
                },
            },
            board: {
                w: ft(126),
                h: ft(68),
                legs: ft(34),
                dx: ft(138),
                y: ft(68),
            },
            podium: true,
            poles: {
                height: ft(120),
                spots: [
                    { sx: -1, dx: ft(25), front: true, dz: ft(48) },
                    { sx: 1, dx: ft(25), front: true, dz: ft(48) },
                    { sx: -1, dx: ft(25), front: false, dz: ft(48) },
                    { sx: 1, dx: ft(25), front: false, dz: ft(48) },
                    { sx: -1, dx: ft(120), front: true, dz: ft(10) },
                    { sx: -1, dx: ft(120), front: false, dz: ft(10) },
                ],
            },
            cameras: {
                pressTargetBack: ft(16),
                endZone: { sx: -1, dx: ft(150), y: ft(40), dz: 5 },
                topDownHeight: ft(700),
            },
            crowdDensity: 0.75,
            defaultLighting: "night",
            dress: (ctx) =>
                schoolDress({ kind: "concrete", site: BIGHS_SITE }, ctx),
        },
        input,
    );
