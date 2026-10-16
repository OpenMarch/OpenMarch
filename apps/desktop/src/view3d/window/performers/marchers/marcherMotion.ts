/**
 * Drives the 3D View's marchers from the drill (ADR 0002 D-7) and the
 * compiled cues (performer-behavior.md sections 8.2 and 8.3): plans every
 * marcher's clips for the whole show once, then each frame switches clips
 * where a marcher's event changes, places its body and turns it to its
 * heading, and switches its Horn/Equipment channel where its horn event
 * changes. A crossfade rewrites its blend weight and leg turn every frame;
 * everything else is written once.
 */
import {
    compileCues,
    type CompileInput,
    type CompiledCues,
    type CueInput,
    type FieldProperties,
    type PerformerCarry,
    pixelsToWorld,
    type ShowPhraseAsset,
} from "@openmarch/core";
import type { Manifest } from "@/view3d/render/step-blend.js";
import type { ShowPositions } from "@/view3d/positions";
import type { CountClock } from "@/view3d/core/marchers/countClock";
import {
    crossfadeWeight,
    planMarcher,
    eventRows,
    headingAt,
} from "@/view3d/core/marchers/planner";
import type { MarcherPlan } from "@/view3d/core/marchers/planner";
import { bodyAt, eventIndexAt } from "@/view3d/core/marchers/planner";
import type { HeightClass } from "@/view3d/core/marchers/looks";
import { marcherCueInputs } from "@/view3d/core/marchers/cueInputs";
import type { DotMode, Foot } from "@/view3d/core/marchers/planner";
import type { MarcherBodies } from "./marcherBodies";
import type { HoldFamily } from "@/view3d/core/instruments/holds";
import {
    hornEventAt,
    type HornEvent,
} from "@/view3d/core/marchers/hornChannel";
import { hornPlay } from "./hornRows";

/** One slot's Horn/Equipment channel over the show. */
export interface HornSlot {
    family: HoldFamily;
    events: readonly HornEvent[];
}

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
        bpm: Float64Array;
        ids: readonly number[];
        cues: CompiledCues | null;
        dotModes: readonly DotMode[] | null;
    };
}

/** The show's stored cues and what compile needs to place them (ADR 0004 D-1 to D-3). */
export interface WindowStoredCues {
    /** The stored cues (`getCues`); a deleted beat's cues are dropped by compile. */
    cues?: readonly CueInput[];
    /** Each marcher's tag ids, for tag targets. */
    tagIds?: ReadonlyMap<number, readonly number[]>;
    phraseAssets?: readonly ShowPhraseAsset[];
    /** Where a marcher stands at a count's click, for positional ripple orders. */
    positionAt?: CompileInput["positionAt"];
}

/**
 * Compiles the show's cues for the 3D View from the marchers and the timed
 * beats (in the count clock's order). `stepOffFoot` is the show's saved
 * default, or the window's unsaved preview override of it. `carries` says
 * what each marcher carries, which decides the Horn/Equipment cues that fit.
 */
export function compileWindowCues(
    marchers: readonly { id: number; section: string }[],
    beats: readonly { id: number; timestamp: number; duration: number }[],
    stepOffFoot: Foot,
    stored: WindowStoredCues = {},
    carries: (marcherId: number) => PerformerCarry = () => "none",
): CompiledCues {
    return compileCues({
        beats: beats
            .filter((b) => b.duration > 0)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((b) => ({ id: b.id, duration: b.duration })),
        marchers: marchers.map((m, i) => ({
            id: m.id,
            section: m.section,
            tagIds: [...(stored.tagIds?.get(m.id) ?? [])],
            drillOrder: i,
            carries: carries(m.id),
        })),
        cues: stored.cues ?? [],
        phraseAssets: stored.phraseAssets,
        positionAt: stored.positionAt,
        showDefaults: { stepOffFoot },
    });
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

/**
 * Each marcher's drill position at every count boundary (x, z interleaved);
 * null for a marcher without positions. Boundary by boundary, so the resolver
 * is sampled once per boundary for every marcher.
 */
function sampleDrill(
    ids: readonly number[],
    positions: ShowPositions | null,
    clock: CountClock,
    fieldProperties: FieldProperties,
): (Float64Array | null)[] {
    const K = clock.counts;
    const point = { x: 0, z: 0 };
    const sampled = ids.map((id) =>
        positions?.has(id) && K > 0 ? new Float64Array((K + 1) * 2) : null,
    );
    if (!positions) return sampled;
    for (let k = 0; k <= K; k++) {
        for (let i = 0; i < ids.length; i++) {
            const p = sampled[i];
            if (!p) continue;
            if (
                !positions.positionInto(
                    ids[i],
                    clock.boundariesMs[k],
                    fieldProperties,
                    point,
                )
            ) {
                sampled[i] = null;
                continue;
            }
            p[k * 2] = point.x;
            p[k * 2 + 1] = point.z;
        }
    }
    return sampled;
}

/**
 * Samples every marcher's drill at each count boundary and plans its clips.
 * Each marcher is planned on its own: a hold stands still whatever the rest
 * of the band does (performer-behavior.md section 3).
 */
export function planShow(
    ids: readonly number[],
    positions: ShowPositions | null,
    heightClasses: readonly HeightClass[],
    clock: CountClock,
    fieldProperties: FieldProperties,
    manifest: Manifest,
    /** The compiled cues; null plays the defaults (front facing, stand). */
    cues: CompiledCues | null,
    previous: ShowPlans | null = null,
    /** What each count's dot marks (`dotModesPerCount`); null is foot on the dot. */
    dotModes: readonly DotMode[] | null = null,
): ShowPlans {
    const t0 = performance.now();
    const sampled = sampleDrill(ids, positions, clock, fieldProperties);
    // A drill edit usually moves a few marchers: reuse every plan whose
    // inputs are unchanged (same marcher, drill samples, class and cues).
    const prev = previous?.inputs;
    const reuseAll =
        !!prev &&
        prev.cues === cues &&
        prev.dotModes === dotModes &&
        sameArray(prev.bpm, clock.bpm) &&
        clock.counts + 1 === (prev.positions.find((p) => p)?.length ?? 0) / 2;
    const prevIndex = new Map((prev?.ids ?? []).map((id, i) => [id, i]));
    const secondsPerCount = (k: number) =>
        60 / (clock.bpm[Math.min(k, clock.bpm.length - 1)] || 120);
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
        const fromCues = cues
            ? marcherCueInputs(cues, ids[i], positions, {
                  // a Facing point is in field coordinates, like the dots
                  pointToWorld: (x, y) => {
                      const w = pixelsToWorld(fieldProperties, { x, y });
                      return [w.x, w.z];
                  },
                  secondsPerCount,
              })
            : null;
        return planMarcher({
            manifest,
            heightClass: h,
            heading: fromCues?.heading ?? 0,
            turnSpan: fromCues?.turnSpan,
            feet: fromCues?.feet,
            dotMode: dotModes ?? undefined,
            positions,
            bpm: clock.bpm,
        });
    });
    return {
        plans,
        planMs: performance.now() - t0,
        replanned,
        inputs: {
            positions: sampled,
            heightClasses,
            bpm: clock.bpm,
            ids,
            cues,
            dotModes,
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
 * half a step ahead of the 2D dot. `CUE_LEAD` in `cueInputs.ts` must match.
 */
export const STEP_AHEAD = 1;

/** Per-frame state: which event each marcher plays. */
export class MarcherMotion {
    private readonly cursor: Int32Array;
    private readonly hornCursor: Int32Array;
    private readonly out = { x: 0, z: 0 };

    constructor(
        private readonly plans: readonly (MarcherPlan | null)[],
        private readonly manifest: Manifest,
        private readonly bodies: MarcherBodies,
        /** Per slot; null (or none given) leaves the slot's arms on the Feet. */
        private readonly horns: readonly (HornSlot | null)[] = [],
    ) {
        this.cursor = new Int32Array(plans.length).fill(-1);
        this.hornCursor = new Int32Array(plans.length).fill(-1);
    }

    private apply(
        slot: number,
        plan: MarcherPlan,
        index: number,
        planCount: number,
    ): void {
        const e = plan.events[index];
        const rows = this.bodies.bake.rows;
        const [clip, clip2] = eventRows(e);
        const row = rows[clip];
        if (!row) return; // not baked yet (the bake set is catching up)
        const row2 = clip2 ? (rows[clip2] ?? null) : null;
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
            // the shader plays clip time uCount * rate + phase, and uCount is
            // the show's count clock: the plan clock (uCount + STEP_AHEAD)
            // minus the event's phase start, in steps
            phase: (STEP_AHEAD - e.phaseStart) * e.rate,
            rate: e.rate,
            legYaw,
        });
    }

    /**
     * At show count clock `count`: switches clips where needed and replaces
     * each placed slot's position in `xz`, which the caller fills with the
     * drill position `STEP_AHEAD` counts later, with its body position, and
     * its heading in `headings`: the whole performer turns (Facing).
     */
    update(
        count: number,
        xz: Float32Array,
        placed: Uint8Array,
        headings?: Float32Array,
    ): void {
        const out = this.out;
        const planCount = count + STEP_AHEAD;
        this.updateHorns(count);
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
            if (headings) headings[i] = headingAt(plan, planCount);
            if (!placed[i]) continue;
            bodyAt(
                this.manifest,
                plan,
                index,
                planCount,
                xz[i * 2],
                xz[i * 2 + 1],
                out,
            );
            xz[i * 2] = out.x;
            xz[i * 2 + 1] = out.z;
        }
    }

    /**
     * Switches each slot's Horn/Equipment channel where its event changes.
     * Horn timing is the show's own clock: a state lands on its count's
     * click, not on the plan clock the feet run a count ahead on.
     */
    private updateHorns(count: number): void {
        const rows = this.bodies.bake.rows;
        for (let i = 0; i < this.horns.length; i++) {
            const h = this.horns[i];
            if (!h || h.events.length === 0) continue;
            const index = hornEventAt(h.events, count, this.hornCursor[i]);
            if (index === this.hornCursor[i]) continue;
            this.hornCursor[i] = index;
            this.bodies.setHorn(i, hornPlay(h.events[index], h.family, rows));
        }
    }
}
