import { describe, expect, it } from "vitest";
import { boxShape } from "../box/boxShape";
import { drawBox, filesOf, type BoxParams } from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import {
    liveFiles,
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    recalculatedTargets,
    releaseLive,
} from "../placed/liveBox";
import { withoutMembers, type PlacedBox } from "../placed/placedBox";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeContext } from "../types";

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };

/** A placed 2 × 2 box, 20 apart, from (0,0) to (20,20); marchers 1..4 */
function placed(): PlacedBox<BoxParams> {
    const params = drawBox({ x: 0, y: 0 }, { x: 20, y: 20 }, 4, env)!;
    const slots = boxShape.generate(params, 4, ctx);
    return {
        recipe: {
            id: 7,
            timelineId: 3,
            kind: "block",
            kindVersion: 1,
            params: { ...params, spots: 4 },
            orderMode: "nearest",
            reverse: false,
            members: slots.map((s, i) => ({
                marcherId: i + 1,
                slot: i,
                x: s.x,
                y: s.y,
            })),
        },
        kind: boxTool,
        params,
        spots: 4,
        endBeat: 8,
    };
}

describe("a selected placed box", () => {
    it("takes presses on its handles and inside, and lets the rest through", () => {
        const live = openLive(placed());
        expect(pressLive(live, { x: 21, y: 21 }, env)?.gesture).toMatchObject({
            type: "handle",
            key: "se",
        });
        // The middle is the center dot; elsewhere inside moves it too
        expect(pressLive(live, { x: 10, y: 10 }, env)?.gesture?.type).toBe(
            "center",
        );
        expect(pressLive(live, { x: 15, y: 6 }, env)?.gesture?.type).toBe(
            "move",
        );
        expect(pressLive(live, { x: 80, y: 80 }, env)).toBe(null);
    });

    it("a handle stretches the box, each member keeping its spot in it", () => {
        let live = pressLive(openLive(placed()), { x: 20, y: 20 }, env)!;
        live = moveLive(live, { x: 40, y: 30 }, env);
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        const to = liveTargets(out.live.box, out.live.params, ctx).members;
        expect(to.map((t) => [t.marcherId, t.x, t.y])).toEqual([
            [1, 0, 0],
            [2, 40, 0],
            [3, 0, 30],
            [4, 40, 30],
        ]);
    });

    it("a drag inside moves it on the half-step grid", () => {
        let live = pressLive(openLive(placed()), { x: 10, y: 10 }, env)!;
        live = moveLive(live, { x: 21.6, y: 10 }, env);
        const out = releaseLive(live);
        // 11.6 to the right: the back-left marcher snaps from 11.6 to 10
        expect(out.live.params.center.x).toBe(20);
    });

    it("a press without a drag changes nothing", () => {
        const live = pressLive(openLive(placed()), { x: 10, y: 10 }, env)!;
        expect(releaseLive(live).changed).toBe(false);
    });

    it("keeps holes where they are", () => {
        const box = placed();
        const holed: PlacedBox<BoxParams> = {
            ...box,
            recipe: withoutMembers(box.recipe, [2]),
        };
        let live = pressLive(openLive(holed), { x: 20, y: 20 }, env)!;
        live = moveLive(live, { x: 40, y: 20 }, env);
        const to = liveTargets(
            holed,
            releaseLive(live).live.params,
            ctx,
        ).members;
        expect(to.map((t) => t.marcherId)).toEqual([1, 3, 4]);
        // Nobody stands on slot 1, the hole (40, 0)
        expect(to.some((t) => t.x === 40 && t.y === 0)).toBe(false);
    });

    it("changes the file count, keeping the intervals", () => {
        const params = liveFiles(placed(), 1, env);
        expect(filesOf(params)).toBe(3);
        expect(params.across).toBe(20);
    });

    it("a file change with holes closes them up, Nearest, instead of scattering the members", () => {
        const box = placed();
        const holed: PlacedBox<BoxParams> = {
            ...box,
            recipe: withoutMembers(box.recipe, [2]),
        };
        const params = liveFiles(holed, 1, env);
        const out = liveTargets(holed, params, ctx);
        expect(out.spots).toBe(3);
        expect(out.members).toHaveLength(3);
        // 3 files of 3 marchers: one rank, every spot taken
        expect(new Set(out.members.map((m) => m.slot))).toEqual(
            new Set([0, 1, 2]),
        );
    });
});

describe("Recalculate who goes where on a placed shape (#429)", () => {
    const own = (box: PlacedBox) =>
        new Map(
            box.recipe.members.map((m) => [m.marcherId, { x: m.x, y: m.y }]),
        );

    it("has nothing to change when everyone's spot is least travel from where they come from", () => {
        const box = placed();
        expect(recalculatedTargets(box, ctx, own(box))).toBeNull();
    });

    it("reassigns the spots by least travel from where the members come from", () => {
        const box = placed();
        // Everyone comes from the spot mirrored side to side
        const mirrored = new Map(
            box.recipe.members.map((m) => [
                m.marcherId,
                { x: 20 - m.x, y: m.y },
            ]),
        );
        const next = recalculatedTargets(box, ctx, mirrored)!;
        expect(next).not.toBeNull();
        for (const m of next) {
            const from = mirrored.get(m.marcherId)!;
            expect({ x: m.x, y: m.y }).toEqual(from);
        }
    });

    it("leaves a shape with holes to Close up", () => {
        const box = placed();
        const holed = { ...box, recipe: withoutMembers(box.recipe, [1]) };
        expect(recalculatedTargets(holed, ctx, new Map())).toBeNull();
    });
});
