/**
 * Drives the 3D View's marchers from the drill (ADR 0010 D-7) and the
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
    type FieldProperties,
    type PerformerCarry,
    pixelsToWorld,
} from "@openmarch/core";
import type { Manifest } from "@/view3d/render/step-blend.js";
import type { ShowPositions } from "@/view3d/positions";
import {
    secondsPerCount as countSeconds,
    type CountClock,
} from "@/view3d/core/marchers/countClock";
import {
    crossfadeWeight,
    planMarcher,
    REST_EPS,
    eventRows,
    headingAt,
} from "@/view3d/core/marchers/planner";
import type { MarcherPlan } from "@/view3d/core/marchers/planner";
import { bodyAt, eventIndexAt } from "@/view3d/core/marchers/planner";
import type { HeightClass } from "@/view3d/core/marchers/looks";
import { marcherCueInputs } from "@/view3d/core/marchers/cueInputs";
import type {
    DirectionChange,
    DotMode,
    Foot,
} from "@/view3d/core/marchers/planner";
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
        dotMode: DotMode | readonly DotMode[] | null;
        crabs: readonly boolean[] | null;
        directionChange: DirectionChange | readonly DirectionChange[] | null;
    };
}

/** What the window's compile reads besides the marchers and beats. */
export interface WindowCueInputs {
    /** Each section's usual equipment, for the Carry default (`performers/cueSections`). */
    sections?: CompileInput["sections"];
    /**
     * 1 for each count on which any performer travels (`bandMovingCounts`),
     * for the Feet default: marchers mark time while the band moves.
     */
    bandMoving?: ArrayLike<number> | null;
    /** The Feet default on those counts (Show settings); mark time when omitted. */
    holdWhileBandMoves?: NonNullable<
        CompileInput["showDefaults"]
    >["holdWhileBandMoves"];
    /**
     * What each marcher carries, which decides the Horn/Equipment default.
     * Marchers carry nothing when it is left out.
     */
    carries?: (marcherId: number) => PerformerCarry;
}

/**
 * Compiles the 3D View's performer behavior from the marchers and the timed
 * beats (in the count clock's order) with no stored cues: the show defaults
 * only (ADR 0004; cue storage is parked). `stepOffFoot` is the show's saved
 * default.
 */
export function compileWindowCues(
    marchers: readonly { id: number; section: string }[],
    beats: readonly { id: number; timestamp: number; duration: number }[],
    stepOffFoot: Foot,
    inputs: WindowCueInputs = {},
): CompiledCues {
    const { bandMoving, carries = () => "none" } = inputs;
    return compileCues({
        beats: beats
            .filter((b) => b.duration > 0)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((b) => ({ id: b.id, duration: b.duration })),
        marchers: marchers.map((m, i) => ({
            id: m.id,
            section: m.section,
            tagIds: [],
            drillOrder: i,
            carries: carries(m.id),
        })),
        cues: [],
        sections: inputs.sections,
        bandTravels: bandMoving ? (c) => bandMoving[c] === 1 : undefined,
        showDefaults: {
            stepOffFoot,
            holdWhileBandMoves: inputs.holdWhileBandMoves,
        },
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
 * 1 for each count on which any marcher's dot travels (the planner's
 * `REST_EPS`), from drill samples at each count boundary.
 */
export function bandMovingCounts(
    ids: readonly number[],
    positions: ShowPositions | null,
    clock: CountClock,
    fieldProperties: FieldProperties,
): Uint8Array {
    const K = clock.counts;
    const moving = new Uint8Array(Math.max(K, 0));
    for (const p of sampleDrill(ids, positions, clock, fieldProperties)) {
        if (!p) continue;
        for (let k = 0; k < K; k++)
            if (
                !moving[k] &&
                Math.hypot(
                    p[k * 2 + 2] - p[k * 2],
                    p[k * 2 + 3] - p[k * 2 + 1],
                ) > REST_EPS
            )
                moving[k] = 1;
    }
    return moving;
}

/**
 * Samples every marcher's drill at each count boundary and plans its clips.
 * Each marcher is planned on its own; what a hold does comes from the Feet
 * channel (marking time while the band moves, `compileWindowCues`).
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
    /** What the dot marks, for the show or per count; null is foot on the dot. */
    dotMode: DotMode | readonly DotMode[] | null = null,
    /** Per marcher: travels in a crab step (`core/marchers/crab.ts`). */
    crabs: readonly boolean[] | null = null,
    /** How direction changes go, for the show or per count; null is the default. */
    directionChange: DirectionChange | readonly DirectionChange[] | null = null,
): ShowPlans {
    const t0 = performance.now();
    const sampled = sampleDrill(ids, positions, clock, fieldProperties);
    // A drill edit usually moves a few marchers: reuse every plan whose
    // inputs are unchanged (same marcher, drill samples, class and cues).
    const prev = previous?.inputs;
    const reuseAll =
        !!prev &&
        prev.cues === cues &&
        prev.dotMode === dotMode &&
        prev.directionChange === directionChange &&
        sameArray(prev.bpm, clock.bpm) &&
        clock.counts + 1 === (prev.positions.find((p) => p)?.length ?? 0) / 2;
    const prevIndex = new Map((prev?.ids ?? []).map((id, i) => [id, i]));
    const secondsPerCount = (k: number) => countSeconds(clock, k);
    let replanned = 0;
    const plans = sampled.map((positions, i) => {
        if (!positions) return null;
        const h = heightClasses[i] ?? 1;
        const j = prevIndex.get(ids[i]);
        if (
            reuseAll &&
            j !== undefined &&
            prev!.heightClasses[j] === h &&
            (prev!.crabs?.[j] ?? false) === (crabs?.[i] ?? false) &&
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
            dotMode: dotMode ?? undefined,
            directionChange: directionChange ?? undefined,
            crab: crabs?.[i] ?? false,
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
            dotMode,
            crabs,
            directionChange,
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

/** A slot's cursor while it stands in the closed position (`updateClosed`). */
const CLOSED = -2;
/** A slot's cursor while it plays a pit instrument (`update`'s `players`). */
const PLAYING = -3;
/** A slot's cursor while it stands on a podium in its podium stance (`update`'s `podium`). */
const ON_PODIUM = -4;
/** The same, standing at attention because the podium stance isn't baked yet. */
const ON_PODIUM_ATTENTION = -5;

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
        /**
         * Per slot: the `attention` Feet row for its height class, which
         * `updateClosed` stands it in. None given leaves `updateClosed`
         * placing and turning the slots alone.
         */
        private readonly attention: readonly string[] = [],
        /**
         * Per slot: the Feet row a pit player holds (`PLAYING_CLIP` for its
         * height class). None given leaves players on their planned clips.
         */
        private readonly playing: readonly string[] = [],
        /**
         * Per slot: the Feet row it holds on a podium (`PODIUM_CLIP` for its
         * height class). None given leaves it at attention there.
         */
        private readonly podium: readonly string[] = [],
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
        if (e.kind === "crossfade" || e.handoff) {
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
     *
     * A slot playing a pit instrument (`players`, from `assignPlayers`) holds
     * its playing pose instead, still: its place and heading are the
     * instrument's, which the caller writes after (`writePlayers`).
     *
     * A slot on a podium (`onPodium`, from `writeOnPodiums`) holds its
     * podium stance (attention until that's baked) while its place and
     * heading follow the plan, for the caller to stand it on the deck
     * (`writePodiumStands`). Off the podium it plays its plan again.
     */
    update(
        count: number,
        xz: Float32Array,
        placed: Uint8Array,
        headings?: Float32Array,
        players?: Int32Array,
        onPodium?: Uint8Array,
    ): void {
        const out = this.out;
        const planCount = count + STEP_AHEAD;
        this.updateHorns(count);
        for (let i = 0; i < this.plans.length; i++) {
            const plan = this.plans[i];
            if (!plan || plan.events.length === 0) continue;
            if (players && players[i] >= 0 && this.holdPlaying(i)) continue;
            const index = eventIndexAt(plan, planCount, this.cursor[i]);
            if (onPodium && onPodium[i] && this.holdPodium(i)) {
                // stands in the podium stance; placed and turned below
            } else if (
                index !== this.cursor[i] ||
                plan.events[index].kind === "crossfade" ||
                plan.events[index].handoff
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
     * The closed position at show count clock `count`, for a paused show:
     * every marcher stands at attention, feet together, on its dot. The
     * caller fills `xz` with the drill position at `count` itself (not
     * `STEP_AHEAD` counts later), and it stays there. Each marcher faces its
     * heading at that count, on the dot it stands on; the Horn/Equipment
     * channel is what `update` would show then. A slot whose attention row
     * isn't baked yet keeps the clip it last had. The next `update` writes
     * every slot's clip again. A slot playing a pit instrument (`players`)
     * holds its playing pose, and one on a podium (`onPodium`) its podium
     * stance, as in `update`.
     */
    updateClosed(
        count: number,
        headings?: Float32Array,
        players?: Int32Array,
        onPodium?: Uint8Array,
    ): void {
        this.updateHorns(count);
        const rows = this.bodies.bake.rows;
        for (let i = 0; i < this.plans.length; i++) {
            const plan = this.plans[i];
            if (!plan || plan.events.length === 0) continue;
            // the dot's own count: the plan clock runs a count ahead
            if (headings) headings[i] = headingAt(plan, count);
            if (players && players[i] >= 0 && this.holdPlaying(i)) continue;
            if (onPodium && onPodium[i] && this.holdPodium(i)) continue;
            const row = rows[this.attention[i]];
            if (!row) continue; // not baked yet: keeps its last clip
            if (this.cursor[i] !== CLOSED)
                this.bodies.setClip(i, {
                    row,
                    row2: null,
                    weight: 0,
                    phase: 0,
                    rate: 1,
                    legYaw: 0,
                });
            // `update` finds the event again and writes its clip
            this.cursor[i] = CLOSED;
        }
    }

    /**
     * Stands slot `i` in its playing pose, if that row is baked: false
     * leaves it on its plan. The next `update` off the spot finds its event
     * again and writes its clip.
     */
    private holdPlaying(i: number): boolean {
        if (this.cursor[i] === PLAYING) return true;
        const row = this.bodies.bake.rows[this.playing[i]];
        if (!row) return false;
        this.bodies.setClip(i, {
            row,
            row2: null,
            weight: 0,
            phase: 0,
            rate: 1,
            legYaw: 0,
        });
        this.cursor[i] = PLAYING;
        return true;
    }

    /**
     * Stands slot `i` in its podium stance, or at attention while that row
     * isn't baked: false, with neither baked, leaves it on its plan. Writes
     * the clip once while it stays on the podium, and again when the stance
     * gets baked. The next `update` off the podium finds its event again and
     * writes its clip.
     */
    private holdPodium(i: number): boolean {
        if (this.cursor[i] === ON_PODIUM) return true;
        const rows = this.bodies.bake.rows;
        const stance = rows[this.podium[i]];
        if (!stance && this.cursor[i] === ON_PODIUM_ATTENTION) return true;
        const row = stance ?? rows[this.attention[i]];
        if (!row) return false;
        this.bodies.setClip(i, {
            row,
            row2: null,
            weight: 0,
            phase: 0,
            rate: 1,
            legYaw: 0,
        });
        this.cursor[i] = stance ? ON_PODIUM : ON_PODIUM_ATTENTION;
        return true;
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
