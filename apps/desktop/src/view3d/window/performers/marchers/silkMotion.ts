/**
 * Each silk carrier's ground speed, turn rate and distance covered at a
 * count, for the silks' wave (`silkSet.ts`). Read from the drill the plans
 * were made from and from the plans' headings, at the plan clock the bodies
 * run on (`STEP_AHEAD`), so a silk lifts as its performer steps off. A
 * function of the count alone: no state carries between frames.
 */
import {
    groundDistanceAt,
    groundSpeedAt,
    groundTrack,
    turnRateAt,
    type GroundTrack,
} from "@/view3d/core/marchers/groundMotion";
import {
    msAtCount,
    type CountClock,
    secondsPerCount,
} from "@/view3d/core/marchers/countClock";
import { headingAt, type MarcherPlan } from "@/view3d/core/marchers/planner";
import type { SilkMotionFrame } from "./silkSet";
import { STEP_AHEAD, type ShowPlans } from "./marcherMotion";

export class SilkMotion {
    readonly frame: SilkMotionFrame;
    private readonly tracks: (GroundTrack | null)[];
    private readonly secondsPerCount: (k: number) => number;

    constructor(
        private readonly plans: ShowPlans,
        private readonly clock: CountClock,
        /** The slots that carry a silk. */
        private readonly slots: readonly number[],
    ) {
        const n = plans.plans.length;
        this.secondsPerCount = (k) => secondsPerCount(clock, k);
        this.tracks = new Array<GroundTrack | null>(n).fill(null);
        for (const slot of slots) {
            const positions = plans.inputs.positions[slot];
            if (positions)
                this.tracks[slot] = groundTrack(
                    positions,
                    this.secondsPerCount,
                );
        }
        this.frame = {
            seconds: 0,
            speed: new Float32Array(n),
            turn: new Float32Array(n),
            distance: new Float64Array(n),
        };
    }

    /**
     * The silks' motion at show count clock `count`. `still` is for a
     * performer standing in the closed position: no ground speed or turn, so
     * the silk hangs as it does at a halt.
     */
    update(count: number, still = false): SilkMotionFrame {
        const f = this.frame;
        f.seconds = msAtCount(this.clock, count) / 1000;
        const c = count + STEP_AHEAD;
        for (const slot of this.slots) {
            const track = this.tracks[slot];
            const plan: MarcherPlan | null = this.plans.plans[slot];
            f.speed[slot] = track && !still ? groundSpeedAt(track, c) : 0;
            f.distance[slot] = track ? groundDistanceAt(track, c) : 0;
            f.turn[slot] =
                plan && !still
                    ? turnRateAt(
                          (t) => headingAt(plan, t),
                          c,
                          this.secondsPerCount,
                      )
                    : 0;
        }
        return f;
    }
}
