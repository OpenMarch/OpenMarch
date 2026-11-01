// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxBlock, filesOf, ranksOf, type BoxParams } from "../box/boxGeometry";
import { fillAhead, shapeSteps, startingParams } from "../command/shapeSteps";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { XY } from "../types";
import {
    padTool,
    rowTool,
    type PadParams,
    type RowParams,
} from "./fakeRowKind";

/** The command bar's steps (#354): Shape › kind asks the kind's declared parameters */

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
const starts = (n: number): XY[] =>
    Array.from({ length: n }, (_, i) => ({ x: 300 + i * 7, y: 300 }));
const keys = (kind: AnyToolKind, params: unknown, n: number, answers = []) =>
    shapeSteps(kind, params, n, env, answers).steps.map((s) => s.param.key);

describe("the box's steps", () => {
    const N = 12;
    const start = () => startingParams(boxTool, starts(N), N, env) as BoxParams;

    it("asks each declared parameter in order, starting from its default", () => {
        const { steps } = shapeSteps(boxTool, start(), N, env, []);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["mode", "Grid"],
            ["size", "4 × 3"],
            ["across", "2"],
            ["deep", "2"],
            ["layout", "Full 4 × 3"],
        ]);
    });

    it("starts around where the marchers stand, on the half-step grid", () => {
        const p = start();
        expect(p.center.x).toBeCloseTo(snapHalf(300 + (11 * 7) / 2));
        expect(p.center.y).toBeCloseTo(300);
    });

    it("answers change the shape, and a later step starts from the earlier answers", () => {
        const { params, steps } = shapeSteps(boxTool, start(), N, env, [
            "",
            "6x2",
            "3",
        ]);
        const p = params as BoxParams;
        expect([filesOf(p), ranksOf(p, N)]).toEqual([6, 2]);
        expect(p.across).toBeCloseTo(3 * STEP);
        expect(steps.map((s) => s.initial)).toEqual([
            "Grid",
            "4 × 3",
            "2",
            "2",
            "Full 6 × 2",
        ]);
    });

    it("an answer that isn't understood is marked and changes nothing", () => {
        const { params, steps } = shapeSteps(boxTool, start(), N, env, [
            "",
            "lots",
        ]);
        expect(steps[1]!.invalid).toBe(true);
        expect(filesOf(params as BoxParams)).toBe(4);
    });

    it("an empty answer keeps the number", () => {
        const base = start();
        expect(shapeSteps(boxTool, base, N, env, ["", "", ""]).params).toBe(
            base,
        );
    });

    it("a spacing with one marcher that way isn't asked", () => {
        expect(keys(boxTool, start(), N)).toEqual([
            "mode",
            "size",
            "across",
            "deep",
            "layout",
        ]);
        const oneRank = shapeSteps(boxTool, start(), N, env, ["", "12x1"]);
        expect(oneRank.steps.map((s) => s.param.key)).toEqual([
            "mode",
            "size",
            "across",
            "layout",
        ]);
    });
});

describe("a kind the host has never heard of gets its steps too", () => {
    const N = 5;

    it("asks the fake row's gap, from its default", () => {
        const p = startingParams(rowTool, starts(N), N, env) as RowParams;
        expect(p.gap).toBeCloseTo(2 * STEP);
        const { params, steps } = shapeSteps(rowTool, p, N, env, ["3½"]);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["gap", "2"],
        ]);
        expect((params as RowParams).gap).toBeCloseTo(3.5 * STEP);
    });
});

describe("the box's steps in Spread (#391)", () => {
    const N = 12;

    it("asks the mode, then only the spacing: a spread has no files or ranks", () => {
        const base = startingParams(boxTool, starts(N), N, env) as BoxParams;
        const { params, steps } = shapeSteps(boxTool, base, N, env, [
            "spr",
            "3",
        ]);
        expect(steps.map((s) => [s.param.key, s.invalid])).toEqual([
            ["mode", false],
            ["across", false],
        ]);
        const p = params as BoxParams;
        expect(p.distribution?.mode).toBe("spread");
        expect(p.across).toBeCloseTo(3 * STEP);
    });
});

describe("the mode step (#386)", () => {
    const N = 5;
    const start = () => startingParams(padTool, starts(N), N, env) as PadParams;

    it("comes first for a closed kind with more than one mode, typed by name", () => {
        const { steps } = shapeSteps(padTool, start(), N, env, []);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["mode", "Grid"],
            ["gap", "2"],
        ]);
        expect(steps[0]!.param.label).toBe("Fill: Grid, Outline");
    });

    it("fills the shape in the mode typed, and later steps follow it", () => {
        const { params, steps } = shapeSteps(padTool, start(), N, env, [
            "out",
            "3",
        ]);
        expect((params as PadParams).distribution?.mode).toBe("outline");
        expect((params as PadParams).gap).toBe(30);
        expect(steps.map((s) => s.invalid)).toEqual([false, false]);
    });

    it("marks a mode the kind doesn't have as not understood", () => {
        const base = start();
        const { params, steps } = shapeSteps(padTool, base, N, env, ["spread"]);
        expect(params).toBe(base);
        expect(steps[0]!.invalid).toBe(true);
    });

    it("is left as it is by a one-liner that starts with a number, and set by one that names a mode", () => {
        expect(fillAhead(boxTool, ["4x2", "3"])).toEqual(["", "4x2", "3"]);
        expect(fillAhead(boxTool, ["out", "4x2"])).toEqual(["out", "4x2"]);
        expect(fillAhead(rowTool, ["3"])).toEqual(["3"]);
    });

    it("is hidden for a kind with one mode and for open kinds", () => {
        const filesOnly: AnyToolKind = {
            ...padTool,
            closed: { ...padTool.closed!, modes: ["files"] },
        };
        expect(
            keys(filesOnly, startingParams(filesOnly, starts(N), N, env), N),
        ).not.toContain("mode");
        expect(
            keys(rowTool, startingParams(rowTool, starts(4), 4, env), 4),
        ).not.toContain("mode");
    });
});

describe("the layout step (#387)", () => {
    const N = 23;
    const start = () => startingParams(boxTool, starts(N), N, env) as BoxParams;

    it("comes after the box's numbers, shown as the picker labels it", () => {
        const { steps } = shapeSteps(boxTool, start(), N, env, []);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["mode", "Grid"],
            ["size", "6 × 4"],
            ["across", "2"],
            ["deep", "2"],
            ["layout", "Short back 6 × 4, 1 short"],
        ]);
        expect(steps[4]!.param.label).toBe(
            "Layout: Full, Stagger, Rounded, Short back, Notched",
        );
    });

    it("lays the box out in the layout typed, by the start of its name, nearest its proportions", () => {
        const { params, steps } = shapeSteps(boxTool, start(), N, env, [
            "",
            "",
            "",
            "",
            "stag",
        ]);
        expect(steps[4]!.invalid).toBe(false);
        expect(boxBlock(params as BoxParams, N).lines).toEqual([5, 4, 5, 4, 5]);
    });

    it("takes a layout with its block, or a block of the box's layout", () => {
        const typed = (answer: string) =>
            shapeSteps(boxTool, start(), N, env, ["", "", "", "", answer]);
        const wide = typed("stagger 8x3").params as BoxParams;
        expect(boxBlock(wide, N).lines).toEqual([8, 7, 8]);
        const short = typed("6 × 4").params as BoxParams;
        expect(boxBlock(short, N).layout).toMatchObject({
            family: "shortBack",
            files: 6,
        });
        expect(typed("short back").steps[4]!.invalid).toBe(false);
    });

    it("marks a layout the count can't make, or a block it has no version of, as not understood", () => {
        const base = start();
        for (const answer of ["full", "stagger 6x4", "hexagon"]) {
            const { params, steps } = shapeSteps(boxTool, base, N, env, [
                "",
                "",
                "",
                "",
                answer,
            ]);
            expect(steps[4]!.invalid).toBe(true);
            expect(params).toBe(base);
        }
    });

    it("leaves a one-liner's size and spacing where they were", () => {
        // The mode step left as it is
        const { params, steps } = shapeSteps(boxTool, start(), N, env, [
            "",
            "6x4",
            "2½",
        ]);
        expect(steps.map((s) => s.invalid)).toEqual([
            false,
            false,
            false,
            false,
            false,
        ]);
        expect(filesOf(params as BoxParams)).toBe(6);
    });

    it("is hidden for a kind without layouts", () => {
        expect(
            keys(padTool, startingParams(padTool, starts(5), 5, env), 5),
        ).not.toContain("layout");
    });
});
