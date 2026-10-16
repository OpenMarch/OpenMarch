import { describe, expect, it } from "vitest";
import type { PositionSource } from "@/timeline/positionBuffer";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import type { AppearanceStepsByMarcherId } from "@/services/appearance/appearanceSteps";
import { FieldMarchers } from "../fieldMarchers";

/** Marchers at (id * 10 + beat, id * 100), until `ready` turns off. */
const source = (ids: number[]) => {
    const state = { ids, ready: true };
    const positionSource: PositionSource = {
        marcherIds: () => state.ids,
        positionsAt(beat, out) {
            if (!state.ready) return false;
            state.ids.forEach((id, i) => {
                out[i * 2] = id * 10 + beat;
                out[i * 2 + 1] = id * 100;
            });
            return true;
        },
    };
    return { state, positionSource };
};

describe("FieldMarchers", () => {
    it("holds every marcher's position at the last beat filled", () => {
        const { positionSource } = source([1, 2]);
        const marchers = new FieldMarchers(positionSource);
        expect(marchers.fill(3)).toBe(true);
        expect(marchers.ids).toEqual([1, 2]);
        expect(Array.from(marchers.positions)).toEqual([13, 100, 23, 200]);
    });

    it("bumps the version on each fill, and the ids version only when the marchers change", () => {
        const { state, positionSource } = source([1, 2]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(0);
        const { version, idsVersion } = marchers;
        marchers.fill(1);
        expect(marchers.version).toBe(version + 1);
        expect(marchers.idsVersion).toBe(idsVersion);
        state.ids = [1, 2, 3];
        marchers.fill(1);
        expect(marchers.idsVersion).toBe(idsVersion + 1);
        expect(marchers.positions).toHaveLength(6);
    });

    it("keeps what's drawn when the resolver isn't ready", () => {
        const { state, positionSource } = source([1]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(2);
        const version = marchers.version;
        state.ready = false;
        expect(marchers.fill(5)).toBe(false);
        expect(marchers.version).toBe(version);
        expect(marchers.ids).toEqual([1]);
        expect(Array.from(marchers.positions)).toEqual([12, 100]);
    });

    it("marks the selected marchers, and keeps them marked when the marchers change", () => {
        const { state, positionSource } = source([1, 2, 3]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(0);
        const { selectionVersion } = marchers;
        marchers.setSelection([3, 1]);
        expect(Array.from(marchers.selected)).toEqual([1, 0, 1]);
        expect(marchers.selectionVersion).toBe(selectionVersion + 1);

        state.ids = [2, 3, 4];
        marchers.fill(0);
        expect(Array.from(marchers.selected)).toEqual([0, 1, 0]);
        expect(marchers.selectionVersion).toBe(selectionVersion + 2);
    });

    it("tells subscribers about fills and selection changes", () => {
        const { positionSource } = source([1]);
        const marchers = new FieldMarchers(positionSource);
        let calls = 0;
        const unsubscribe = marchers.subscribe(() => calls++);
        marchers.fill(0);
        marchers.setSelection([1]);
        expect(calls).toBe(2);
        unsubscribe();
        marchers.fill(1);
        expect(calls).toBe(2);
    });
});

const RED: AppearanceComponentOptional = {
    visible: true,
    label_visible: true,
    fill_color: { r: 255, g: 0, b: 0, a: 1 },
};
const HIDDEN: AppearanceComponentOptional = {
    visible: false,
    label_visible: false,
};
const PLAIN: AppearanceComponentOptional = {
    visible: true,
    label_visible: true,
};

/** Marcher 1 is red from beat 0 and hidden from the flag at beat 8; marcher 2 is plain. */
const steps: AppearanceStepsByMarcherId = new Map([
    [1, { beats: [0, 8], stacks: [[RED], [PLAIN, HIDDEN]] }],
    [2, { beats: [0], stacks: [[PLAIN]] }],
]);

describe("FieldMarchers appearance", () => {
    it("holds each marcher's appearance at the last flag crossed", () => {
        const marchers = new FieldMarchers(source([1, 2]).positionSource);
        marchers.setAppearanceSteps(steps);
        marchers.fill(4);
        expect(marchers.stacks).toEqual([[RED], [PLAIN]]);
        expect(Array.from(marchers.hidden)).toEqual([0, 0]);
        marchers.fill(8);
        expect(marchers.stacks).toEqual([[PLAIN, HIDDEN], [PLAIN]]);
        expect(Array.from(marchers.hidden)).toEqual([1, 0]);
        marchers.fill(7.5);
        expect(Array.from(marchers.hidden)).toEqual([0, 0]);
    });

    it("draws marchers with no appearance steps in the theme's default, shown", () => {
        const marchers = new FieldMarchers(source([1, 3]).positionSource);
        marchers.fill(9);
        expect(marchers.stacks).toEqual([null, null]);
        marchers.setAppearanceSteps(steps);
        expect(marchers.stacks).toEqual([[PLAIN, HIDDEN], null]);
        expect(Array.from(marchers.hidden)).toEqual([1, 0]);
    });

    it("bumps the appearance version only when an appearance can change", () => {
        const { state, positionSource } = source([1, 2]);
        const marchers = new FieldMarchers(positionSource);
        marchers.setAppearanceSteps(steps);
        marchers.fill(1);
        const version = marchers.appearanceVersion;
        marchers.fill(2);
        marchers.fill(7);
        expect(marchers.appearanceVersion).toBe(version);
        marchers.fill(8);
        expect(marchers.appearanceVersion).toBe(version + 1);
        state.ids = [2, 1];
        marchers.fill(8);
        expect(marchers.appearanceVersion).toBe(version + 2);
        expect(marchers.stacks).toEqual([[PLAIN], [PLAIN, HIDDEN]]);
        marchers.setAppearanceSteps(undefined);
        expect(marchers.appearanceVersion).toBe(version + 3);
        expect(marchers.stacks).toEqual([null, null]);
    });

    it("draws overridden marchers where the editor puts them, through every fill", () => {
        const { positionSource } = source([1, 2]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(3);
        const version = marchers.version;
        marchers.setOverrides(new Map([[2, { x: 50, y: 60 }]]));
        expect(Array.from(marchers.positions)).toEqual([13, 100, 50, 60]);
        expect(marchers.version).toBeGreaterThan(version);
        marchers.fill(4);
        expect(Array.from(marchers.positions)).toEqual([14, 100, 50, 60]);
    });

    it("draws a marcher no longer overridden where the show has it again", () => {
        const { positionSource } = source([1, 2]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(3);
        marchers.setOverrides(
            new Map([
                [1, { x: 0, y: 0 }],
                [2, { x: 50, y: 60 }],
            ]),
        );
        marchers.setOverrides(new Map([[2, { x: 55, y: 60 }]]));
        expect(Array.from(marchers.positions)).toEqual([13, 100, 55, 60]);
        marchers.setOverrides(null);
        expect(Array.from(marchers.positions)).toEqual([13, 100, 23, 200]);
    });

    it("tells subscribers when overrides change what's drawn", () => {
        const { positionSource } = source([1]);
        const marchers = new FieldMarchers(positionSource);
        marchers.fill(0);
        let calls = 0;
        marchers.subscribe(() => calls++);
        marchers.setOverrides(new Map([[1, { x: 5, y: 5 }]]));
        marchers.setOverrides(null);
        expect(calls).toBe(2);
    });
});
