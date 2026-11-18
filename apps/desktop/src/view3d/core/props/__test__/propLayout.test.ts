import { describe, expect, it } from "vitest";
import type { GeometryChange } from "@openmarch/core";
import {
    platformTopAt,
    propsAt,
    type PropInput,
    type PropSolid,
} from "../propLayout";
import { liftPlatforms, liftPodiums } from "../platformLift";

const box = (
    beat: number,
    width: number,
    depth: number,
    height: number,
    more: Partial<GeometryChange> = {},
): GeometryChange => ({
    beat,
    outlineType: "rectangle",
    width,
    depth,
    height,
    rotation: 0,
    customOutline: null,
    transitionLength: 1,
    rollsOut: false,
    leadingEdge: null,
    ...more,
});

const prop = (
    id: number,
    surface: PropInput["surface"],
    changes: GeometryChange[],
): PropInput => ({ id, surface, changes });

const at =
    (where: Record<number, { x: number; z: number }>) =>
    (id: number): { x: number; z: number } | null =>
        where[id] ?? null;

const byId = (solids: readonly PropSolid[]) =>
    new Map(solids.map((s) => [s.id, s]));

describe("propsAt", () => {
    it("stands a prop at its position at its real size", () => {
        const [solid] = propsAt(
            [prop(1, "obstacle", [box(0, 2, 1, 1.5)])],
            4,
            at({ 1: { x: 3, z: -2 } }),
        );
        expect(solid).toMatchObject({
            id: 1,
            surface: "obstacle",
            center: { x: 3, z: -2 },
            base: 0,
            height: 1.5,
        });
        const xs = solid!.outline.map((p) => p.x);
        const zs = solid!.outline.map((p) => p.z);
        expect(Math.min(...xs)).toBeCloseTo(2);
        expect(Math.max(...xs)).toBeCloseTo(4);
        expect(Math.min(...zs)).toBeCloseTo(-2.5);
        expect(Math.max(...zs)).toBeCloseTo(-1.5);
    });

    it("turns the outline clockwise seen from above, as the 2D field does", () => {
        const [solid] = propsAt(
            [prop(1, "obstacle", [box(0, 2, 0.5, 1, { rotation: 90 })])],
            0,
            at({ 1: { x: 0, z: 0 } }),
        );
        const xs = solid!.outline.map((p) => p.x);
        const zs = solid!.outline.map((p) => p.z);
        // two wide becomes two deep
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.5);
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2);
    });

    it("leaves out a prop before the count it was made on", () => {
        expect(
            propsAt(
                [prop(1, "obstacle", [box(8, 1, 1, 1)])],
                7,
                at({ 1: { x: 0, z: 0 } }),
            ),
        ).toEqual([]);
    });

    it("leaves out a prop with no position", () => {
        expect(
            propsAt([prop(1, "obstacle", [box(0, 1, 1, 1)])], 0, at({})),
        ).toEqual([]);
    });

    it("follows a resize through its transition", () => {
        const input = [
            prop(1, "platform", [
                box(0, 2, 2, 0.2),
                box(8, 4, 2, 0.6, { transitionLength: 4 }),
            ]),
        ];
        const where = at({ 1: { x: 0, z: 0 } });
        expect(propsAt(input, 4, where)[0]!.height).toBeCloseTo(0.2);
        expect(propsAt(input, 8, where)[0]!.height).toBeCloseTo(0.6);
        const mid = propsAt(input, 6.5, where)[0]!.height;
        expect(mid).toBeGreaterThan(0.2);
        expect(mid).toBeLessThan(0.6);
    });

    it("keeps a Floor prop flat on the Base floor", () => {
        const solids = propsAt(
            [
                prop(1, "platform", [box(0, 4, 4, 0.6)]),
                prop(2, "floor", [box(0, 2, 2, 0.3)]),
            ],
            0,
            at({ 1: { x: 0, z: 0 }, 2: { x: 0, z: 0 } }),
        );
        expect(byId(solids).get(2)).toMatchObject({ base: 0, height: 0 });
    });

    it("sits a prop on the tallest platform under its footprint center", () => {
        const solids = byId(
            propsAt(
                [
                    prop(1, "platform", [box(0, 4, 4, 0.2)]),
                    prop(2, "platform", [box(0, 2, 2, 0.6)]),
                    prop(3, "obstacle", [box(0, 1, 1, 1)]),
                    // its corner is over the platforms, its center isn't
                    prop(4, "obstacle", [box(0, 2, 2, 1)]),
                ],
                0,
                at({
                    1: { x: 0, z: 0 },
                    2: { x: 10, z: 0 },
                    3: { x: 10.5, z: 0 },
                    4: { x: 11.8, z: 0 },
                }),
            ),
        );
        expect(solids.get(3)!.base).toBeCloseTo(0.6);
        expect(solids.get(4)!.base).toBe(0);
    });

    it("stacks platforms into steps", () => {
        const solids = byId(
            propsAt(
                [
                    prop(1, "platform", [box(0, 6, 6, 0.2)]),
                    prop(2, "platform", [box(0, 4, 4, 0.2)]),
                    prop(3, "platform", [box(0, 2, 2, 0.2)]),
                ],
                0,
                at({
                    1: { x: 0, z: 0 },
                    2: { x: 0, z: 0 },
                    3: { x: 0, z: 0 },
                }),
            ),
        );
        // each one's center is over the others: the smaller stands on the larger
        const tops = [1, 2, 3].map((id) => {
            const s = solids.get(id)!;
            return s.base + s.height;
        });
        expect(tops[0]).toBeCloseTo(0.2);
        expect(tops[1]).toBeCloseTo(0.4);
        expect(tops[2]).toBeCloseTo(0.6);
    });

    it("stands a larger platform on a smaller one under its center", () => {
        // the deck's center is over the riser; the riser's center isn't under the deck
        const solids = byId(
            propsAt(
                [
                    prop(1, "platform", [box(0, 2, 2, 0.4)]),
                    prop(2, "platform", [box(0, 1.6, 6, 0.2)]),
                ],
                0,
                at({ 1: { x: 0, z: 0 }, 2: { x: 0.9, z: 0 } }),
            ),
        );
        expect(solids.get(1)!.base).toBe(0);
        expect(solids.get(2)!.base).toBeCloseTo(0.4);
    });

    it("stands the later of two same-size platforms on the earlier", () => {
        const solids = byId(
            propsAt(
                [
                    prop(7, "platform", [box(0, 2, 2, 0.2)]),
                    prop(3, "platform", [box(0, 2, 2, 0.2)]),
                ],
                0,
                at({ 3: { x: 0, z: 0 }, 7: { x: 0.5, z: 0 } }),
            ),
        );
        expect(solids.get(3)!.base).toBe(0);
        expect(solids.get(7)!.base).toBeCloseTo(0.2);
    });

    it("stands a podium at its standing height, whatever its Outline's height", () => {
        const podium: PropInput = {
            ...prop(1, "platform", [box(0, 1.2, 1.5, 0)]),
            standTop: 1.386,
            facesAcross: true,
        };
        const [solid] = propsAt([podium], 0, at({ 1: { x: 0, z: 0 } }));
        expect(solid!.height).toBe(1.386);
        expect(solid!.facesAcross).toBe(true);
        expect(platformTopAt([solid!], { x: 0.2, z: 0.2 })).toBe(1.386);
        // Performers stand on it at its stand point (`writePodiumStands`), not up a ramp
        expect(liftPlatforms([solid!])).toEqual([]);
        expect(liftPodiums([solid!])[0]!.top).toBe(1.386);
    });

    it("turns a podium's stand point with it, as its model turns", () => {
        const podium: PropInput = {
            ...prop(1, "platform", [box(0, 0.61, 0.97, 0, { rotation: 90 })]),
            standTop: 1.2192,
            facesAcross: true,
            standAt: { x: 0.1, z: 0.2 },
        };
        const [solid] = propsAt([podium], 0, at({ 1: { x: 3, z: -2 } }));
        // writePitModelMatrix at 90°: model +X toward world +Z, model +Z toward world -X
        expect(solid!.standPoint!.x).toBeCloseTo(3 - 0.2);
        expect(solid!.standPoint!.z).toBeCloseTo(-2 + 0.1);
        const [plain] = propsAt(
            [prop(2, "platform", [box(0, 1, 1, 0.2)])],
            0,
            at({ 2: { x: 0, z: 0 } }),
        );
        expect(plain!.standPoint).toBeUndefined();
    });

    it("stands an imported Platform prop at its model's top, scaled with the model", () => {
        // A 2 × 1 m model whose top over its middle is 0.5 m, drawn at twice its size
        const stage: PropInput = {
            ...prop(1, "platform", [box(0, 4, 2, 1.6)]),
            standTop: 0.5,
            modelSizeM: { width: 2, depth: 1 },
        };
        const [solid] = propsAt([stage], 0, at({ 1: { x: 0, z: 0 } }));
        expect(solid!.height).toBeCloseTo(1);
        expect(platformTopAt([solid!], { x: 0.2, z: 0.2 })).toBeCloseTo(1);
        expect(solid!.facesAcross).toBeUndefined();
    });

    it("never stands a prop on an obstacle or a Floor prop", () => {
        const solids = byId(
            propsAt(
                [
                    prop(1, "obstacle", [box(0, 4, 4, 1)]),
                    prop(2, "floor", [box(0, 4, 4, 0)]),
                    prop(3, "obstacle", [box(0, 1, 1, 1)]),
                ],
                0,
                at({
                    1: { x: 0, z: 0 },
                    2: { x: 10, z: 0 },
                    3: { x: 0, z: 0 },
                }),
            ),
        );
        expect(solids.get(3)!.base).toBe(0);
    });

    it("breaks a loop of platforms once, so one of them stands on the ground", () => {
        // A pinwheel: each center sits over the next platform, never the other way round
        const solids = byId(
            propsAt(
                [
                    prop(1, "platform", [box(0, 8, 1, 1)]),
                    prop(2, "platform", [box(0, 1, 8, 1)]),
                    prop(3, "platform", [box(0, 10, 1, 1, { rotation: 45 })]),
                ],
                0,
                at({ 1: { x: 0, z: 0 }, 2: { x: 3, z: 0 }, 3: { x: 3, z: 3 } }),
            ),
        );
        const bases = [1, 2, 3].map((id) => solids.get(id)!.base).sort();
        expect(bases).toEqual([0, 1, 2]);
    });
});

describe("platformTopAt", () => {
    const solids = propsAt(
        [
            prop(1, "platform", [box(0, 4, 4, 0.2)]),
            prop(2, "platform", [box(0, 2, 2, 0.4)]),
            prop(3, "obstacle", [box(0, 2, 2, 2)]),
            prop(4, "floor", [box(0, 2, 2, 0)]),
        ],
        0,
        at({
            1: { x: 0, z: 0 },
            2: { x: 0, z: 0 },
            3: { x: 10, z: 0 },
            4: { x: 20, z: 0 },
        }),
    );

    it("is the top of the tallest platform under a point", () => {
        expect(platformTopAt(solids, { x: 0, z: 0 })).toBeCloseTo(0.6);
        expect(platformTopAt(solids, { x: 1.5, z: 0 })).toBeCloseTo(0.2);
    });

    it("is the ground away from platforms, and on obstacles and Floor props", () => {
        expect(platformTopAt(solids, { x: 5, z: 5 })).toBe(0);
        expect(platformTopAt(solids, { x: 10, z: 0 })).toBe(0);
        expect(platformTopAt(solids, { x: 20, z: 0 })).toBe(0);
    });
});
