import { Group, SpotLight, type Vector3Tuple } from "three";
import { setLightIntensity } from "../../environment";
import type { NightpoundCtx, NightpoundPart } from "./frame";
import { nightpoundLighting } from "./lightLevels";
import { CAN } from "./roofPlan";

/**
 * How Nightpound is lit.
 *
 * The look, from WGI's packet photos: the floor is bright and even, for the
 * judges and the cameras; the stands are dimmer but every seat shows; the
 * steel overhead is black behind rows of white lamps; the boards glow.
 *
 * - A few spots light the floor, none per can: a key over the front edge,
 *   which throws the performers' shadows away from the audience, and four
 *   wide fills off the floor's corners (two at low quality, off its ends).
 *   Their cones overlap into a floor that is even to about a tenth (a fifth
 *   at low quality), spill half of that onto the lower rows, and end before
 *   the upper deck. They don't dim with distance.
 * - The key casts the one shadow map (high quality only). Nothing overhead
 *   casts into it.
 * - The stands and the steel are the shared hemisphere's, from this venue's
 *   values (`environment/lighting.ts`, key `NIGHTPOUND_VENUE`): the grid of
 *   cans over the seats.
 * - The cans themselves are the roof's (`roofCans.ts`), the boards the
 *   scoreboard's; both read their levels from `nightpoundLighting`.
 *
 * "House" runs the same lights with the floor spots down to a third and the
 * hemisphere up, so switching presets changes no light count and compiles
 * nothing.
 */

/** The spots' white: LED house lights, close to neutral. */
const FLOOR_WHITE = 0xfbf8f1;
/** The spots hang with the cans. */
const SPOT_Y = CAN.faceY - 0.2;
/** The floor's mean level (white = 1 on a white, upward surface) at scale 1. */
const FLOOR_LEVEL = 2.5;

export interface NightpoundSpot {
    name: string;
    position: Vector3Tuple;
    target: Vector3Tuple;
    /** Half-angle of the cone, radians. */
    angle: number;
    penumbra: number;
    /** Share of the floor's mean level this spot is driven at. */
    intensity: number;
    shadow?: boolean;
}

/**
 * The floor spots, in kit-root space. The numbers come from a search for
 * the most even light on the floor's plane (0.88 to 1.12 of the mean with
 * five spots, 0.79 to 1.21 with three) that puts about half the floor's
 * level on the lower rows and none on the upper deck. Intensities are
 * scaled so the floor's mean is 1.
 */
export function nightpoundFloorSpots(
    quality: "low" | "high",
): NightpoundSpot[] {
    const spots: NightpoundSpot[] = [];
    if (quality === "low") {
        spots.push({
            name: "nightpound.keySpot",
            position: [0, SPOT_Y, 8.75],
            target: [0, 0, -1.6],
            angle: 0.85,
            penumbra: 1,
            intensity: 0.39 / 1.038,
        });
        for (const sx of [-1, 1])
            spots.push({
                name: "nightpound.endSpot",
                position: [sx * 12.93, SPOT_Y, 3.47],
                target: [sx * 21.9, 0, 2.67],
                angle: 1.3,
                penumbra: 0.9,
                intensity: 0.95 / 1.038,
            });
        return spots;
    }
    spots.push({
        name: "nightpound.keySpot",
        position: [0, SPOT_Y, 14.09],
        target: [0, 0, -2.84],
        angle: 0.82,
        penumbra: 1,
        intensity: 0.52 / 1.266,
        shadow: true,
    });
    for (const sx of [-1, 1]) {
        spots.push({
            name: "nightpound.backSpot",
            position: [sx * 11.56, SPOT_Y, -12.58],
            target: [sx * 24.01, 0, -10.96],
            angle: 1.3,
            penumbra: 0.9,
            intensity: 0.45 / 1.266,
        });
        spots.push({
            name: "nightpound.frontSpot",
            position: [sx * 11.56, SPOT_Y, 20.01],
            target: [sx * 24.01, 0, 11.68],
            angle: 1.3,
            penumbra: 0.9,
            intensity: 0.99 / 1.266,
        });
    }
    return spots;
}

export function buildLighting(ctx: NightpoundCtx): NightpoundPart {
    const object = new Group();
    object.name = "nightpound.lighting";

    const spots = nightpoundFloorSpots(ctx.quality).map((spec) => {
        const spot = new SpotLight(
            FLOOR_WHITE,
            0,
            0,
            spec.angle,
            spec.penumbra,
            0,
        );
        spot.name = spec.name;
        spot.position.set(...spec.position);
        spot.target.position.set(...spec.target);
        spot.visible = false;
        if (spec.shadow) {
            spot.castShadow = true;
            spot.shadow.mapSize.set(2048, 2048);
            spot.shadow.camera.near = 8;
            spot.shadow.camera.far = 60;
            spot.shadow.bias = -0.0006;
        }
        object.add(spot, spot.target);
        return { spot, spec };
    });

    return {
        object,
        setLighting(preset) {
            const k = nightpoundLighting(preset).kit;
            spots.forEach(({ spot, spec }) =>
                setLightIntensity(
                    spot,
                    spec.intensity * FLOOR_LEVEL * k.roofSpotIntensity,
                ),
            );
        },
        dispose() {
            spots.forEach(({ spot }) => {
                spot.shadow.map?.dispose();
                spot.dispose();
            });
            object.clear();
        },
    };
}
