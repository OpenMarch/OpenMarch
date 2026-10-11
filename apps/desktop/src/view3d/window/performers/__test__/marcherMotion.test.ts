import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "@/view3d/vendor/om-pose/step-blend.js";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { buildCountClock } from "@/view3d/core/marchers/countClock";
import { eventRows } from "@/view3d/core/marchers/planner";
import { MarcherMotion, planShow, STEP_AHEAD } from "../marchers/marcherMotion";
import { planMarcher } from "@/view3d/core/marchers/planner";
import type { MarcherBodies } from "../marchers/marcherBodies";
import type { MarcherClip } from "@/view3d/vendor/om-pose/instanced-marchers.js";

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
function timeline(x: number, y: number, dy: number): MarcherTimeline {
    return {
        sortedTimestamps: [0, 2000, 6000, 8000],
        pathMap: new Map([
            [0, { x, y }],
            [2000, { x, y }],
            [6000, { x, y: y + dy }],
            [8000, { x, y: y + dy }],
        ]),
    };
}

describe("planning the show", () => {
    const ids = [1, 2, 3];
    const lines = [
        timeline(800, 500, 90),
        timeline(830, 500, 90),
        timeline(860, 500, 0),
    ];
    const first = planShow(ids, lines, [1, 1, 1], clock, fp, manifest, 0);

    it("plans every marcher the first time", () => {
        expect(first.replanned).toBe(3);
        expect(first.plans.every((p) => p !== null)).toBe(true);
    });

    it("marks time for the marcher who holds while others move", () => {
        const clips = first.plans[2]!.events.map((e) => e.clip);
        expect(clips).toContain("stepoff_marktime");
        expect(clips).toContain("marktime");
    });

    it("reuses the plans of marchers whose drill didn't change", () => {
        const edited = [lines[0], timeline(830, 500, 120), lines[2]];
        const next = planShow(
            ids,
            edited,
            [1, 1, 1],
            clock,
            fp,
            manifest,
            0,
            first,
        );
        expect(next.replanned).toBe(1);
        expect(next.plans[0]).toBe(first.plans[0]);
        expect(next.plans[1]).not.toBe(first.plans[1]);
        expect(next.plans[2]).toBe(first.plans[2]);
    });

    it("plans everyone again when the band's rests change", () => {
        // marcher 1 and 2 stop moving: nobody moves, so marcher 3 stands at attention
        const still = [timeline(800, 500, 0), timeline(830, 500, 0), lines[2]];
        const next = planShow(
            ids,
            still,
            [1, 1, 1],
            clock,
            fp,
            manifest,
            0,
            first,
        );
        expect(next.replanned).toBe(3);
        expect(next.plans[2]!.events.map((e) => e.clip)).toEqual(["attention"]);
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
            lines,
            [1, 1, 1],
            faster,
            fp,
            manifest,
            0,
            first,
        );
        expect(next.replanned).toBe(3);
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
        bandMoving: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 0]),
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
            holdOf: () => "none",
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies, 0);
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
        bandMoving: Uint8Array.from([1, 1, 1, 1, 0]),
    });
    const rows: Record<
        string,
        { row: number; frames: number; counts: number }
    > = {};
    let r = 0;
    for (const e of plan.events) {
        rows[`${e.clip}@brass:up`] = { row: r++, frames: 60, counts: 2 };
        if (e.clip2)
            rows[`${e.clip2}@brass:up`] = { row: r++, frames: 60, counts: 2 };
    }

    function motion() {
        const writes: { slot: number; clip: MarcherClip }[] = [];
        const bodies = {
            bake: { rows },
            holdOf: () => "brass:up",
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies, 0);
        return {
            m,
            writes,
            xz: new Float32Array(2),
            placed: Uint8Array.from([1]),
        };
    }

    it("looks rows up by the slot's hold", () => {
        const { m, writes, xz, placed } = motion();
        m.update(0.5 - STEP_AHEAD, xz, placed);
        expect(writes.length).toBe(1);
        expect(writes[0].clip.row).toBe(
            rows[`${plan.events[0].clip}@brass:up`],
        );
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
        bandMoving: Uint8Array.from([0, 1, 1, 1, 1, 0, 0, 0]),
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
            holdOf: () => "none",
            setClip(slot: number, clip: MarcherClip) {
                writes.push({ slot, clip });
            },
        } as unknown as MarcherBodies;
        const m = new MarcherMotion([plan], manifest, bodies, 0);
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
