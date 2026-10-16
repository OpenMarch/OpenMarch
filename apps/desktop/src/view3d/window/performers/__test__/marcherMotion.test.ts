import { describe, expect, it } from "vitest";
import { pixelsToWorld, type CueInput } from "@openmarch/core";
import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "@/view3d/render/step-blend.js";
import { fakeShowPositions, type Track } from "@/view3d/__test__/fakePositions";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { buildCountClock } from "@/view3d/core/marchers/countClock";
import { eventRows } from "@/view3d/core/marchers/planner";
import {
    compileWindowCues,
    MarcherMotion,
    planShow,
    STEP_AHEAD,
} from "../marchers/marcherMotion";
import { CUE_LEAD } from "@/view3d/core/marchers/cueInputs";
import {
    hornEventAt,
    planHornChannel,
} from "@/view3d/core/marchers/hornChannel";
import { planMarcher } from "@/view3d/core/marchers/planner";
import type { MarcherBodies } from "../marchers/marcherBodies";
import type { MarcherClip } from "@/view3d/render/instanced-marchers.js";

const manifest = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/manifest.json"),
        "utf8",
    ),
) as Manifest;
const fp = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
// 16 counts at 120 bpm
const clock = buildCountClock(
    Array.from({ length: 16 }, (_, k) => ({
        timestamp: k * 0.5,
        duration: 0.5,
    })),
);

/** A marcher holding at (x, y) px, moving dy px over counts 4-12. */
function track(x: number, y: number, dy: number): Track {
    return (ms) => {
        const t = Math.min(Math.max((ms - 2000) / 4000, 0), 1);
        return { x, y: y + t * dy };
    };
}

/** The show's positions with marchers 1, 2 and 3 on these tracks. */
const show = (tracks: Track[]) =>
    fakeShowPositions(new Map(tracks.map((t, i) => [i + 1, t])));

describe("planning the show", () => {
    const ids = [1, 2, 3];
    const lines = [
        track(800, 500, 90),
        track(830, 500, 90),
        track(860, 500, 0),
    ];
    const first = planShow(
        ids,
        show(lines),
        [1, 1, 1],
        clock,
        fp,
        manifest,
        null,
    );

    it("plans every marcher the first time", () => {
        expect(first.replanned).toBe(3);
        expect(first.plans.every((p) => p !== null)).toBe(true);
    });

    // This used to expect automatic mark time while others move; stand is
    // the hold default now (performer-behavior.md section 3).
    it("stands still for the marcher who holds while others move", () => {
        const clips = first.plans[2]!.events.map((e) => e.clip);
        expect(clips).toEqual(["attention"]);
    });

    it("reuses the plans of marchers whose drill didn't change", () => {
        const edited = [lines[0], track(830, 500, 120), lines[2]];
        const next = planShow(
            ids,
            show(edited),
            [1, 1, 1],
            clock,
            fp,
            manifest,
            null,
            first,
        );
        expect(next.replanned).toBe(1);
        expect(next.plans[0]).toBe(first.plans[0]);
        expect(next.plans[1]).not.toBe(first.plans[1]);
        expect(next.plans[2]).toBe(first.plans[2]);
    });

    it("keeps a holding marcher's plan when the others stop moving", () => {
        // no more band rests: a holder's plan doesn't depend on the others
        const still = [track(800, 500, 0), track(830, 500, 0), lines[2]];
        const next = planShow(
            ids,
            show(still),
            [1, 1, 1],
            clock,
            fp,
            manifest,
            null,
            first,
        );
        expect(next.replanned).toBe(2);
        expect(next.plans[2]).toBe(first.plans[2]);
    });

    it("plans everyone again when the tempo changes", () => {
        const faster = buildCountClock(
            Array.from({ length: 16 }, (_, k) => ({
                timestamp: k * 0.4,
                duration: 0.4,
            })),
        );
        const next = planShow(
            ids,
            show(lines),
            [1, 1, 1],
            faster,
            fp,
            manifest,
            null,
            first,
        );
        expect(next.replanned).toBe(3);
    });
});

describe("planning from the window's cues", () => {
    const ids = [1, 2];
    const lines = show([track(800, 500, 90), track(830, 500, 90)]);
    const beats = Array.from({ length: 16 }, (_, k) => ({
        id: 50 + k,
        timestamp: k * 0.5,
        duration: 0.5,
    }));
    const marchers = ids.map((id) => ({ id, section: "Trumpet" }));

    it("puts the cue counts and the plan clock one count apart, as the window plays them", () => {
        expect(CUE_LEAD).toBe(STEP_AHEAD);
    });

    it("steps off on the window's foot, a preview of the show default", () => {
        const right = planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            compileWindowCues(marchers, beats, "right"),
        );
        const moves = right.plans[0]!.events.filter((e) => e.kind !== "rest");
        expect(moves.length).toBeGreaterThan(0);
        expect(moves.every((e) => e.foot === "right")).toBe(true);
        const left = planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            compileWindowCues(marchers, beats, "left"),
        );
        expect(left.plans[0]!.events.every((e) => e.foot === "left")).toBe(
            true,
        );
    });

    it("plans again when the cues change", () => {
        const cues = compileWindowCues(marchers, beats, "left");
        const first = planShow(ids, lines, [1, 1], clock, fp, manifest, cues);
        const same = planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            cues,
            first,
        );
        expect(same.replanned).toBe(0);
        const next = planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            compileWindowCues(marchers, beats, "right"),
            first,
        );
        expect(next.replanned).toBe(2);
    });
});

describe("planning from the show's stored cues", () => {
    const ids = [1, 2];
    const lines = show([track(800, 500, 90), track(830, 500, 90)]);
    const beats = Array.from({ length: 16 }, (_, k) => ({
        id: 50 + k,
        timestamp: k * 0.5,
        duration: 0.5,
    }));
    const marchers = ids.map((id) => ({ id, section: "Trumpet" }));
    const facing = (
        value: string,
        extra: Partial<CueInput> = {},
    ): CueInput => ({
        id: 1,
        channel: "facing",
        kind: "state",
        target: { kind: "band" },
        // count 8
        beatId: 58,
        value,
        transitionLength: 1,
        ...extra,
    });
    const headingsOf = (cues: CueInput[], tagIds = new Map()) =>
        planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            compileWindowCues(marchers, beats, "left", { cues, tagIds }),
        ).plans.map((p) => p!.headings);

    it("turns to a stored Facing cue from its count", () => {
        const [first] = headingsOf([facing("builtin:facing.back")]);
        // the plan runs a count ahead (CUE_LEAD): the back facing is drawn from boundary 9
        expect(first![2]).toBeCloseTo(0);
        expect(Math.abs(first![12])).toBeCloseTo(Math.PI);
    });

    it("plays a stored Horn/Equipment cue on carriers' Horn channel", () => {
        const down: CueInput = {
            id: 2,
            channel: "horn_equipment",
            kind: "state",
            target: { kind: "band" },
            // count 8
            beatId: 58,
            value: "builtin:horn.down",
        };
        const cues = compileWindowCues(
            marchers,
            beats,
            "left",
            { cues: [down] },
            (id) => (id === 1 ? "winds" : "none"),
        );
        const plan = (id: number) =>
            planHornChannel(cues.segments(id, "horn_equipment"), {
                defaultState: "up",
                secondsPerCount: () => 0.5,
            });
        const carrier = plan(1);
        expect(carrier[0].state).toBe("up");
        expect(carrier[hornEventAt(carrier, 12)].state).toBe("carry");
        // a cue that doesn't fit what a marcher carries leaves the hold alone
        const bare = plan(2);
        expect(bare[hornEventAt(bare, 12)].state).toBe("up");
    });

    it("reaches tag targets through the marchers' tags", () => {
        const [tagged, other] = headingsOf(
            [
                facing("builtin:facing.back", {
                    target: { kind: "tag", tagId: 7 },
                }),
            ],
            new Map([[1, [7]]]),
        );
        expect(Math.abs(tagged![12])).toBeCloseTo(Math.PI);
        expect(other![12]).toBeCloseTo(0);
    });

    it("reads a Facing point in field coordinates, like the dots", () => {
        const point = { x: 2000, y: 545 };
        const [first] = headingsOf([
            facing("builtin:facing.point", { settings: point }),
        ]);
        const target = pixelsToWorld(fp, point);
        const at = pixelsToWorld(fp, { x: 800, y: 590 });
        expect(first![16]).toBeCloseTo(
            Math.atan2(target.x - at.x, target.z - at.z),
        );
    });

    it("plans again when the dot modes change", () => {
        const cues = compileWindowCues(marchers, beats, "left");
        const foot = planShow(ids, lines, [1, 1], clock, fp, manifest, cues);
        const body = planShow(
            ids,
            lines,
            [1, 1],
            clock,
            fp,
            manifest,
            cues,
            foot,
            new Array(16).fill("body"),
        );
        expect(body.replanned).toBe(2);
    });
});

describe("playing a crossfade", () => {
    // 4 counts of 12-to-5 forward, then 4 counts sliding toward the 50 (no change clip)
    const step = 4.572 / 12;
    const positions = new Float64Array(2 * 10);
    let x = 10;
    let z = -20;
    for (let k = 0; k < 10; k++) {
        positions[k * 2] = x;
        positions[k * 2 + 1] = z;
        if (k < 4) z += step;
        else if (k < 8) x -= step;
    }
    const plan = planMarcher({
        manifest,
        heightClass: 1,
        heading: 0,
        positions,
        bpm: new Float64Array(9).fill(120),
    });
    const fade = plan.events.find((e) => e.kind === "crossfade")!;

    function motion() {
        const writes: { slot: number; clip: MarcherClip }[] = [];
        const rows: Record<
            string,
            { row: number; frames: number; counts: number }
        > = {};
        for (const e of plan.events) {
            const [a, b] = eventRows(e);
            rows[a] = { row: 0, frames: 60, counts: 2 };
            if (b) rows[b] = { row: 1, frames: 60, counts: 2 };
        }
        const bodies = {
            bake: { rows },
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies);
        const xz = new Float32Array(2);
        const placed = Uint8Array.from([1]);
        return { m, writes, xz, placed };
    }

    it("ramps the blend weight and the leg turn over the fade window", () => {
        const { m, writes, xz, placed } = motion();
        const [y0, y1] = fade.legYaw as [number, number, number, number];
        // show counts: the plan runs STEP_AHEAD counts ahead of them
        const at = (planCount: number) => planCount - STEP_AHEAD;
        m.update(at(fade.fadeStart - 0.25), xz, placed); // before the window: the old loop as is
        m.update(at(fade.fadeStart + 0.25), xz, placed);
        m.update(at(fade.fadeStart + 0.5), xz, placed);
        m.update(at(fade.fadeEnd + 0.6), xz, placed); // the next event: the new loop alone
        const ws = writes.map((w) => w.clip.weight);
        expect(ws[0]).toBe(0);
        expect(writes[0].clip.legYaw).toBeCloseTo(y0, 9);
        expect(ws[1]).toBeCloseTo(0.103515625, 9); // smootherstep(0.25)
        expect(ws[2]).toBeCloseTo(0.5, 9);
        expect(writes[2].clip.legYaw).toBeCloseTo((y0 + y1) / 2, 9);
        expect(writes[3].clip.weight).toBe(0);
        expect(writes.length).toBe(4);
    });

    it("writes a loop once, not every frame", () => {
        const { m, writes, xz, placed } = motion();
        m.update(1.25 - STEP_AHEAD, xz, placed);
        m.update(1.5 - STEP_AHEAD, xz, placed);
        m.update(1.75 - STEP_AHEAD, xz, placed);
        expect(writes.length).toBe(1);
    });
});

describe("playing a slot's rows", () => {
    // 4 counts of 8-to-5 forward, then a hold
    const positions = new Float64Array(2 * 6);
    for (let k = 0; k < 6; k++) {
        positions[k * 2] = 0;
        positions[k * 2 + 1] = -20 + Math.min(k, 4) * 0.5715;
    }
    const plan = planMarcher({
        manifest,
        heightClass: 1,
        positions,
        heading: 0,
        bpm: new Float64Array(5).fill(120),
    });
    const rows: Record<
        string,
        { row: number; frames: number; counts: number }
    > = {};
    let r = 0;
    for (const e of plan.events) {
        rows[e.clip] = { row: r++, frames: 60, counts: 2 };
        if (e.clip2) rows[e.clip2] = { row: r++, frames: 60, counts: 2 };
    }

    function motion() {
        const writes: { slot: number; clip: MarcherClip }[] = [];
        const bodies = {
            bake: { rows },
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies);
        return {
            m,
            writes,
            xz: new Float32Array(2),
            placed: Uint8Array.from([1]),
        };
    }

    it("looks Feet rows up by clip, whatever the slot carries", () => {
        const { m, writes, xz, placed } = motion();
        m.update(0.5 - STEP_AHEAD, xz, placed);
        expect(writes.length).toBe(1);
        expect(writes[0].clip.row).toBe(rows[plan.events[0].clip]);
    });

    it("writes a loop once, not every frame", () => {
        const { m, writes, xz, placed } = motion();
        m.update(1.25 - STEP_AHEAD, xz, placed);
        m.update(1.5 - STEP_AHEAD, xz, placed);
        m.update(1.75 - STEP_AHEAD, xz, placed);
        expect(writes.length).toBe(1);
    });
});

describe("landing each foot on its click", () => {
    // a hold, 4 counts of 8-to-5 forward, then 3 holds: a step-off, loops, a halt
    const positions = new Float64Array(2 * 9);
    for (let k = 0; k < 9; k++) {
        positions[k * 2] = 0;
        positions[k * 2 + 1] = -20 + Math.min(Math.max(k - 1, 0), 4) * 0.5715;
    }
    const plan = planMarcher({
        manifest,
        heightClass: 1,
        positions,
        heading: 0,
        bpm: new Float64Array(8).fill(120),
    });
    const rows: Record<
        string,
        { row: number; frames: number; counts: number }
    > = {};
    let r = 0;
    for (const e of plan.events) {
        rows[e.clip] = { row: r++, frames: 60, counts: 2 };
        if (e.clip2) rows[e.clip2] = { row: r++, frames: 60, counts: 2 };
    }
    function motion() {
        const writes: { slot: number; clip: MarcherClip }[] = [];
        const bodies = {
            bake: { rows },
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies);
        return {
            m,
            writes,
            xz: new Float32Array(2),
            placed: Uint8Array.from([1]),
        };
    }

    it("steps off during the count before the move, so the first foot lands on count 1's click", () => {
        // the move is counts 1..4 (drill boundary 1 to 5); the step-off is plan count 1
        const stepoff = plan.events.find((e) => e.clip.startsWith("stepoff"))!;
        expect(stepoff.count).toBe(1);
        const { m, writes, xz, placed } = motion();
        m.update(0.5, xz, placed); // show count 0, the hold's last count
        expect(writes[0].clip.row).toBe(rows[stepoff.clip]);
        // the shader plays clip time uCount + phase: plan time minus phaseStart
        expect(writes[0].clip.phase).toBeCloseTo(
            STEP_AHEAD - stepoff.phaseStart,
            9,
        );
    });

    it("plays the loop from its time 0 at count 1's click", () => {
        const loop = plan.events.find((e) => e.kind === "loop")!;
        const { m, writes, xz, placed } = motion();
        m.update(1.01, xz, placed);
        expect(writes[0].clip.row).toBe(rows[loop.clip]);
        // clip time at the click: 1 + phase is a whole number of loops (time 0)
        expect((1 + writes[0].clip.phase) % 2).toBeCloseTo(0, 9);
    });

    it("closes during the move's last count and stands still on the hold's click", () => {
        const { m, writes, xz, placed } = motion();
        m.update(4.5, xz, placed); // the move's last count: the close
        expect(writes.at(-1)!.clip.row).toBe(
            rows[plan.events.find((e) => e.clip.startsWith("halt"))!.clip],
        );
        m.update(5.01, xz, placed); // the hold's first count
        expect(writes.at(-1)!.clip.row).toBe(rows["attention"]);
    });
});
