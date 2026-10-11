/**
 * Drives the 3D View's marchers from the drill (ADR 0002 D-7): plans every
 * marcher's clips for the whole show once, then each frame switches clips
 * where a marcher's event changes and places its body. A crossfade rewrites
 * its blend weight and leg turn every frame; everything else is written once.
 */
import type { FieldProperties } from "@openmarch/core";
import type { Manifest } from "@/view3d/vendor/om-pose/step-blend.js";
import type { Bake } from "@/view3d/vendor/om-pose/instanced-marchers.js";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import { positionAtInto } from "@/view3d/positions";
import type { CountClock } from "@/view3d/core/marchers/countClock";
import {
    REST_EPS,
    crossfadeWeight,
    planMarcher,
    eventRows,
} from "@/view3d/core/marchers/planner";
import type { MarcherPlan } from "@/view3d/core/marchers/planner";
import { bodyAt, eventIndexAt } from "@/view3d/core/marchers/planner";
import type { HeightClass } from "@/view3d/core/marchers/looks";
import { rowKey, type MarcherBodies } from "./marcherBodies";

export interface ShowPlans {
    /** Per slot; null when the marcher has no positions. */
    plans: (MarcherPlan | null)[];
    /** How long planning took, in ms. */
    planMs: number;
    /** How many marchers were planned again (the rest were reused). */
    replanned: number;
    /** What each plan was made from, so the next call can reuse it. */
    inputs: {
        positions: (Float64Array | null)[];
        heightClasses: readonly HeightClass[];
        bandMoving: Uint8Array;
        bpm: Float64Array;
        ids: readonly number[];
    };
}

const sameArray = (
    a: ArrayLike<number> | null,
    b: ArrayLike<number> | null,
) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};

/** Each marcher's drill position at every count boundary (x, z interleaved). */
function sampleDrill(
    timelines: readonly (MarcherTimeline | null)[],
    clock: CountClock,
    fieldProperties: FieldProperties,
): (Float64Array | null)[] {
    const K = clock.counts;
    const point = { x: 0, z: 0 };
    return timelines.map((timeline) => {
        if (!timeline || K === 0) return null;
        const p = new Float64Array((K + 1) * 2);
        for (let k = 0; k <= K; k++) {
            if (
                !positionAtInto(
                    timeline,
                    clock.boundariesMs[k],
                    fieldProperties,
                    point,
                )
            )
                return null;
            p[k * 2] = point.x;
            p[k * 2 + 1] = point.z;
        }
        return p;
    });
}

/** 1 for each count on which any marcher travels. */
function bandMovingCounts(
    sampled: readonly (Float64Array | null)[],
    K: number,
): Uint8Array {
    const bandMoving = new Uint8Array(K);
    for (const p of sampled) {
        if (!p) continue;
        for (let k = 0; k < K; k++)
            if (
                !bandMoving[k] &&
                Math.hypot(
                    p[k * 2 + 2] - p[k * 2],
                    p[k * 2 + 3] - p[k * 2 + 1],
                ) > REST_EPS
            )
                bandMoving[k] = 1;
    }
    return bandMoving;
}

/**
 * Samples every marcher's drill at each count boundary and plans its clips.
 * A count is a band-moving count when any marcher travels on it.
 */
export function planShow(
    ids: readonly number[],
    timelines: readonly (MarcherTimeline | null)[],
    heightClasses: readonly HeightClass[],
    clock: CountClock,
    fieldProperties: FieldProperties,
    manifest: Manifest,
    heading: number,
    previous: ShowPlans | null = null,
): ShowPlans {
    const t0 = performance.now();
    const sampled = sampleDrill(timelines, clock, fieldProperties);
    const bandMoving = bandMovingCounts(sampled, clock.counts);
    // A drill edit usually moves a few marchers: reuse every plan whose
    // inputs are unchanged (same marcher, drill samples, class and band rests).
    const prev = previous?.inputs;
    const reuseAll =
        !!prev &&
        sameArray(prev.bandMoving, bandMoving) &&
        sameArray(prev.bpm, clock.bpm) &&
        clock.counts + 1 === (prev.positions.find((p) => p)?.length ?? 0) / 2;
    const prevIndex = new Map((prev?.ids ?? []).map((id, i) => [id, i]));
    let replanned = 0;
    const plans = sampled.map((positions, i) => {
        if (!positions) return null;
        const h = heightClasses[i] ?? 1;
        const j = prevIndex.get(ids[i]);
        if (
            reuseAll &&
            j !== undefined &&
            prev!.heightClasses[j] === h &&
            sameArray(prev!.positions[j], positions) &&
            previous!.plans[j]
        )
            return previous!.plans[j];
        replanned++;
        return planMarcher({
            manifest,
            heightClass: h,
            heading,
            positions,
            bpm: clock.bpm,
            bandMoving,
        });
    });
    return {
        plans,
        planMs: performance.now() - t0,
        replanned,
        inputs: {
            positions: sampled,
            heightClasses,
            bandMoving,
            bpm: clock.bpm,
            ids,
        },
    };
}

/**
 * How far the marchers run ahead of the show's count clock, in counts
 * (docs/3d/technique.md, "Steps and timing"). The planner lands each step at
 * the end of the drill count it covers, but the editor's "Count C" click is
 * that count's start: playing the plan one count ahead lands each heel on
 * its click. The step-off plays during the count before a move, the left
 * foot lands on count 1, the right on count 8, and the close finishes on
 * the hold's count 1, as the 2D dot arrives. During a move the body runs
 * half a step ahead of the 2D dot.
 */
export const STEP_AHEAD = 1;

/** Per-frame state: which event each marcher plays. */
export class MarcherMotion {
    private readonly cursor: Int32Array;
    private readonly out = { x: 0, z: 0 };

    constructor(
        private readonly plans: readonly (MarcherPlan | null)[],
        private readonly manifest: Manifest,
        private readonly bodies: MarcherBodies,
        private readonly heading: number,
    ) {
        this.cursor = new Int32Array(plans.length).fill(-1);
    }

    private apply(
        slot: number,
        plan: MarcherPlan,
        index: number,
        planCount: number,
    ): void {
        const e = plan.events[index];
        const rows: Bake["rows"] = this.bodies.bake.rows;
        const hold = this.bodies.holdOf(slot);
        const [clip, clip2] = eventRows(e);
        const row = rows[rowKey(clip, hold)];
        if (!row) return; // not baked yet (the bake set is catching up)
        const row2 = clip2 ? (rows[rowKey(clip2, hold)] ?? null) : null;
        let weight = e.weight;
        let legYaw = e.legYaw;
        if (e.kind === "crossfade") {
            // the fade's progress, 0 before its window and 1 after
            const u = Math.min(
                Math.max(
                    (planCount - e.fadeStart) / (e.fadeEnd - e.fadeStart),
                    0,
                ),
                1,
            );
            const t = crossfadeWeight(u);
            weight = t;
            if (Array.isArray(legYaw))
                legYaw = legYaw[0] + (legYaw[1] - legYaw[0]) * t;
        }
        this.bodies.setClip(slot, {
            row,
            row2,
            weight: row2 ? weight : 0,
            // the shader plays clip time uCount + phase, and uCount is the
            // show's count clock: plan time minus the event's phase start
            phase: STEP_AHEAD - e.phaseStart,
            rate: 1,
            legYaw,
        });
    }

    /**
     * At show count clock `count`: switches clips where needed and replaces
     * each placed slot's position in `xz`, which the caller fills with the
     * drill position `STEP_AHEAD` counts later, with its body position.
     */
    update(count: number, xz: Float32Array, placed: Uint8Array): void {
        const out = this.out;
        const planCount = count + STEP_AHEAD;
        for (let i = 0; i < this.plans.length; i++) {
            const plan = this.plans[i];
            if (!plan || plan.events.length === 0) continue;
            const index = eventIndexAt(plan, planCount, this.cursor[i]);
            if (
                index !== this.cursor[i] ||
                plan.events[index].kind === "crossfade"
            ) {
                this.apply(i, plan, index, planCount);
                this.cursor[i] = index;
            }
            if (!placed[i]) continue;
            bodyAt(
                this.manifest,
                plan,
                index,
                planCount,
                xz[i * 2],
                xz[i * 2 + 1],
                this.heading,
                out,
            );
            xz[i * 2] = out.x;
            xz[i * 2 + 1] = out.z;
        }
    }
}
