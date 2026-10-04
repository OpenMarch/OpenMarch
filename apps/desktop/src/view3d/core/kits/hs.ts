import { ft } from "../environment";
import type { KitBuilder } from "../types";
import { buildStandsKit } from "./stands";

/**
 * High school kit (design.md section 6, P2.3): grass, a 6-lane track, a home
 * stand with a press box, a smaller visitor stand, a podium and four poles.
 * Day, dusk and night; default day.
 */
export const buildHs: KitBuilder = (input) =>
    buildStandsKit(
        {
            id: "hs",
            seed: 11,
            groundColor: 0x4a6b35,
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
                endZone: { sx: 1, dx: ft(70), y: ft(28) },
                topDownHeight: ft(620),
            },
            crowdDensity: 0.5,
            defaultLighting: "day",
        },
        input,
    );
