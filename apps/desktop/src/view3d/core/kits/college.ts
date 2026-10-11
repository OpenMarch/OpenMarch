import { ft } from "../environment";
import type { KitBuilder } from "../types";
import { buildStandsKit } from "./stands";

/**
 * College bowl kit (design.md section 6, P2.3): no track, 50-row home and
 * visitor stands, end stands, a video board above the side-2 end stand and
 * four 43 m poles. Default night.
 */
export const buildCollege: KitBuilder = (input) =>
    buildStandsKit(
        {
            id: "college",
            groundColor: 0x55575c,
            infield: { extraW: ft(260), extraD: ft(200) },
            track: false,
            front: {
                gap: ft(40),
                spec: {
                    length: ft(400),
                    rows: 50,
                    depth: ft(2.7),
                    rise: ft(1.05),
                    base: ft(8),
                    pressBox: { width: ft(180), height: ft(16), lift: ft(6) },
                },
            },
            back: {
                gap: ft(40),
                spec: {
                    length: ft(400),
                    rows: 50,
                    depth: ft(2.7),
                    rise: ft(1.05),
                    base: ft(8),
                },
            },
            ends: {
                gap: ft(45),
                spec: {
                    length: ft(220),
                    rows: 34,
                    depth: ft(2.7),
                    rise: ft(1.05),
                    base: ft(8),
                },
            },
            board: {
                w: ft(90),
                h: ft(34),
                legs: 0,
                dx: ft(150.8),
                y: ft(70),
                title: "SPRING SHOW",
            },
            podium: false,
            poles: {
                height: ft(140),
                spots: [
                    { sx: -1, dx: ft(90), front: true, dz: ft(140) },
                    { sx: 1, dx: ft(90), front: true, dz: ft(140) },
                    { sx: -1, dx: ft(90), front: false, dz: ft(140) },
                    { sx: 1, dx: ft(90), front: false, dz: ft(140) },
                ],
            },
            cameras: {
                pressTargetBack: ft(12),
                endZone: { sx: 1, dx: ft(120), y: ft(60) },
                topDownHeight: ft(620),
            },
            crowdDensity: 0.65,
            defaultLighting: "night",
        },
        input,
    );
