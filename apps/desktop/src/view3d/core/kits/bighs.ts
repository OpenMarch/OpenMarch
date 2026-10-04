import { ft } from "../environment";
import type { KitBuilder } from "../types";
import { buildStandsKit } from "./stands";

/**
 * Big high school kit (design.md section 6, P2.3): the hs track with taller
 * stands, a three-story press box, a video board behind the side-2 end zone,
 * a plaza behind the side-1 end zone and six poles. Default night.
 */
export const buildBighs: KitBuilder = (input) =>
    buildStandsKit(
        {
            id: "bighs",
            groundColor: 0x55575c,
            infield: { extraW: ft(280), extraD: ft(170) },
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
                w: ft(96),
                h: ft(52),
                legs: ft(34),
                dx: ft(138),
                y: ft(60),
                title: "SPRING SHOW",
            },
            plaza: { dx: ft(180), w: ft(160), d: ft(300) },
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
                endZone: { sx: -1, dx: ft(150), y: ft(40) },
                topDownHeight: ft(700),
            },
            crowdDensity: 0.56,
            defaultLighting: "night",
        },
        input,
    );
