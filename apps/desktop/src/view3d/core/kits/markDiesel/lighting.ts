// cspell:ignore superframe superframes
import { dieselRoofCut } from "./cutaway";
import { Group, PointLight, SpotLight, type Vector3Tuple } from "three";
import {
    lightingValues,
    setLightIntensity,
    type LightingValues,
} from "../../environment";
import type { LightingPreset } from "../../types";
import { buildDieselFixtures } from "./fixtures";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";

/**
 * How the Mark Diesel kit is lit.
 *
 * The look, from photos of a championship night with the roof shut: the
 * field is bright, even and a little cool; the lights are banks of hot
 * points with soft halos on each catwalk; everything above them is dark,
 * with the roof panels glowing a faint pale yellow from the field's bounce;
 * the upper deck and the drape fall off to near black.
 *
 * - Five spots light the field, none per fixture: two on the back catwalk,
 *   two at the ends of the front one, and a wide key at the middle of the
 *   front one. Their cones overlap into a field that is even to within a
 *   tenth and end at the lower bowl, so the upper deck and the roof get
 *   nothing from them. They don't dim with distance.
 * - The key casts the one shadow map (high quality only): the sun is off
 *   under a closed roof, so it takes the sun's place in the budget. It
 *   carries about a quarter of the field's light, so shadows are faint and
 *   fall away from the audience, as under a real row of fixtures.
 * - The field's bounce is a few point lights under the turf's edges
 *   (`dieselBounceLights`). They light nothing that faces up; what faces
 *   the field gets the field's light from below, strongly near the
 *   field and less with distance: the foot of the drape and its folds, the
 *   field wall, the lower bowl's seat fronts, the undersides of the horns.
 *   That falloff is what a hemisphere light can't give, and it is why the
 *   drape's top, the upper deck and the roof steel stay near black.
 * - What is left for the shared hemisphere (`lightingValues(preset,
 *   DIESEL_VENUE)`) is the little light that reaches everything.
 * - The fixtures themselves are `fixtures.ts`; their halos and the lens
 *   ghosts are the post pass (`core/post`), set by `bloom` in this venue's
 *   lighting values. The roof panels and LED ribbons are other parts'
 *   meshes, which read their levels from `dieselRoofGlow` and
 *   `dieselLighting`.
 */

/** The key for this venue's own values in `environment/lighting.ts`. */
export const DIESEL_VENUE = "markDiesel";

/**
 * A preset's values as this venue lights it. Every Mark Diesel part reads its
 * levels from here, and the scene passes the same venue to the environment.
 */
export function dieselLighting(preset: LightingPreset): LightingValues {
    return lightingValues(preset, DIESEL_VENUE);
}

/**
 * The glow of the sliding roof panels' underside: the field's light coming
 * back up through pale translucent sheets, so it is a pale warm gray, far
 * dimmer than anything the lamps touch. `intensity` scales the roof part's
 * own panel material (`roof.ts`, which bakes the falloff from the middle of
 * the field outward and multiplies by `DIESEL_PANEL_GAIN`).
 */
export function dieselRoofGlow(preset: LightingPreset): {
    color: number;
    intensity: number;
} {
    return {
        color: 0xf5e6c8,
        intensity: dieselLighting(preset).kit.panelEmissive,
    };
}

/** The spots' white: 5700 K LED, a little cool against the warm suites. */
const FIELD_WHITE = 0xf3f6ff;
/** The spots hang with the fixtures, just under the catwalk. */
const SPOT_DROP = 0.8;
/** The field the layout below was tuned on: 360 ft by 160 ft, in meters. */
const TUNED_HALF_LENGTH = 54.86;
const TUNED_HALF_WIDTH = 24.38;

interface SpotSpec {
    name: string;
    position: Vector3Tuple;
    target: Vector3Tuple;
    /** Half-angle of the cone, radians. */
    angle: number;
    penumbra: number;
    /** Intensity at `roofSpotIntensity` 1. */
    intensity: number;
    shadow?: boolean;
}

/**
 * The five field spots, in kit-root space. The numbers come from a search
 * for the most even light on the field's plane (0.93 to 1.07 of the mean,
 * tuned again for the 50.3 m light row)
 * that leaves the upper deck dark and puts about a quarter of the field's
 * level on the drape and half of it on the lower bowl.
 */
export function dieselFieldSpots(frame: DieselFrame): SpotSpec[] {
    const { CATWALK_RUNS, CATWALK_Y } = frame;
    const kx = frame.FIELD_HALF_LENGTH / TUNED_HALF_LENGTH;
    const kz = frame.FIELD_HALF_WIDTH / TUNED_HALF_WIDTH;
    const y = CATWALK_Y - SPOT_DROP;
    const z = Math.abs(CATWALK_RUNS[0][0][2]);
    const half = Math.abs(CATWALK_RUNS[0][1][0] - CATWALK_RUNS[0][0][0]) / 2;
    const spots: SpotSpec[] = [];
    for (const sx of [-1, 1]) {
        spots.push({
            name: "markDiesel.backSpot",
            position: [sx * Math.min(half, 38.4), y, -z],
            target: [sx * 35.2 * kx, 0, -12.9 * kz],
            angle: 0.875,
            penumbra: 0.6,
            intensity: 1.47,
        });
        spots.push({
            name: "markDiesel.frontSpot",
            position: [sx * Math.min(half, 56), y, z],
            target: [sx * 57.8 * kx, 0, 12.3 * kz],
            angle: 0.77,
            penumbra: 0.92,
            intensity: 1.25,
        });
    }
    spots.push({
        name: "markDiesel.keySpot",
        // A little inside the catwalk, clear of what hangs from it.
        position: [0, y, z - 2.5],
        target: [0, 0, 18.4 * kz],
        angle: 0.97,
        penumbra: 1,
        intensity: 0.85,
        shadow: true,
    });
    return spots;
}

/**
 * The field's bounce: a near-neutral warm white. The turf is green, but the
 * photos (and the eye, white-balanced to the lamps) read the hall's
 * bounce-lit surfaces as gray; a green bounce here tints every dark surface
 * olive once the tone curve keeps its hue.
 */
const BOUNCE_COLOR = 0xeeece4;
/** Candela at `roofSpotIntensity` 1. */
const BOUNCE_INTENSITY = 150;

/**
 * Where the bounce lights sit, in kit-root space: under the turf, a little
 * inside each sideline, so what stands beside the field is lit from below
 * and in front. Four at high quality; at low quality two, deeper and on the
 * 50, which is flatter along the stands but costs half as much.
 */
export function dieselBounceLights(
    frame: DieselFrame,
    quality: "low" | "high",
): Vector3Tuple[] {
    const z = frame.FIELD_HALF_WIDTH - 3;
    const x = frame.FIELD_HALF_LENGTH * 0.55;
    return quality === "high"
        ? [
              [-x, -9, z],
              [x, -9, z],
              [-x, -9, -z],
              [x, -9, -z],
          ]
        : [
              [0, -22, z],
              [0, -22, -z],
          ];
}

export function buildDieselLighting(ctx: DieselCtx): DieselPart {
    const { frame, quality } = ctx;
    const high = quality === "high";
    const object = new Group();
    object.name = "markDiesel.lighting";

    const fixtures = buildDieselFixtures(ctx);
    object.add(fixtures.object);

    const spots = dieselFieldSpots(frame).map((spec) => {
        const spot = new SpotLight(
            FIELD_WHITE,
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
        if (spec.shadow && quality === "high") {
            spot.castShadow = true;
            spot.shadow.mapSize.set(2048, 2048);
            spot.shadow.camera.near = 18;
            spot.shadow.camera.far = 160;
            spot.shadow.bias = -0.0006;
        }
        object.add(spot, spot.target);
        return { spot, spec };
    });

    const bounceAt = dieselBounceLights(frame, quality);
    // Two lights deep under the field stand in for four near it.
    const bounceScale = quality === "high" ? 1 : 4.5;
    const bounces = bounceAt.map((position) => {
        const light = new PointLight(BOUNCE_COLOR, 0, 0, 2);
        light.name = "markDiesel.bounce";
        light.position.set(...position);
        light.visible = false;
        object.add(light);
        return light;
    });

    return {
        object,
        setLighting(preset) {
            const k = dieselLighting(preset).kit;
            fixtures.setLevel(k.barEmissive);
            spots.forEach(({ spot, spec }) =>
                setLightIntensity(spot, spec.intensity * k.roofSpotIntensity),
            );
            bounces.forEach((light) =>
                setLightIntensity(
                    light,
                    BOUNCE_INTENSITY * bounceScale * k.roofSpotIntensity,
                ),
            );
        },
        onFrame({ cameraPosition }) {
            // The lamp rows go with the roof halves they hang from.
            fixtures.setCut(dieselRoofCut(frame, cameraPosition, high).half);
        },
        dispose() {
            fixtures.dispose();
            bounces.forEach((light) => light.dispose());
            spots.forEach(({ spot }) => {
                spot.shadow.map?.dispose();
                spot.dispose();
            });
        },
    };
}
