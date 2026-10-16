import { describe, expect, it } from "vitest";
import { createFieldTheme } from "@openmarch/core";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import { MARCHER_SHAPE, labelsShown, writeMarcherLooks } from "../marcherLooks";

const theme = createFieldTheme({
    defaultMarcher: {
        fill: { r: 255, g: 0, b: 0, a: 1 },
        outline: { r: 0, g: 0, b: 0, a: 0 },
        label: { r: 0, g: 0, b: 0, a: 1 },
    },
});
const shown = { visible: true, label_visible: true };
const BLUE = { r: 0, g: 0, b: 255, a: 1 };
const GREEN = { r: 0, g: 255, b: 0, a: 0.5 };

/** Writes `stacks` and reads back each marcher's look. */
const looks = (stacks: (AppearanceComponentOptional[] | null)[]) => {
    const n = stacks.length;
    const out = {
        fill: new Float32Array(n * 4),
        outline: new Float32Array(n * 4),
        shape: new Float32Array(n),
    };
    writeMarcherLooks(stacks, theme, out);
    const labelShown = labelsShown(stacks, theme);
    return stacks.map((_, i) => ({
        fill: Array.from(out.fill.subarray(i * 4, i * 4 + 4)),
        outline: Array.from(out.outline.subarray(i * 4, i * 4 + 4)),
        shape: out.shape[i],
        labelShown: labelShown[i] === 1,
    }));
};

describe("writeMarcherLooks", () => {
    it("draws a marcher with no appearance in the theme's default circle", () => {
        expect(looks([null, []])).toEqual([
            {
                fill: [1, 0, 0, 1],
                outline: [0, 0, 0, 0],
                shape: MARCHER_SHAPE.circle,
                labelShown: true,
            },
            {
                fill: [1, 0, 0, 1],
                outline: [0, 0, 0, 0],
                shape: MARCHER_SHAPE.circle,
                labelShown: true,
            },
        ]);
    });

    it("takes each value from the highest-priority appearance that sets it", () => {
        const [look] = looks([
            [
                { ...shown, shape_type: "square" },
                { ...shown, fill_color: BLUE, outline_color: GREEN },
                { ...shown, fill_color: GREEN, shape_type: "triangle" },
            ],
        ]);
        expect(look).toEqual({
            fill: [0, 0, 1, 1],
            outline: [0, 1, 0, 0.5],
            shape: MARCHER_SHAPE.square,
            labelShown: true,
        });
        expect(looks([[{ ...shown, shape_type: "triangle" }]])[0]!.shape).toBe(
            MARCHER_SHAPE.triangle,
        );
    });

    it("draws an X in its outline color when that shows, else its fill", () => {
        const [outlined, plain] = looks([
            [
                {
                    ...shown,
                    shape_type: "x",
                    fill_color: BLUE,
                    outline_color: GREEN,
                },
            ],
            [{ ...shown, shape_type: "x", fill_color: BLUE }],
        ]);
        expect(outlined!.shape).toBe(MARCHER_SHAPE.cross);
        expect(outlined!.fill).toEqual([0, 1, 0, 0.5]);
        expect(plain!.fill).toEqual([0, 0, 1, 1]);
    });

    it("draws neither the dot nor the label of a hidden marcher", () => {
        const [hidden, labelHidden] = looks([
            [shown, { visible: false, label_visible: true }],
            [{ visible: true, label_visible: false }],
        ]);
        expect(hidden!.shape).toBe(MARCHER_SHAPE.hidden);
        expect(hidden!.labelShown).toBe(false);
        expect(labelHidden!.shape).toBe(MARCHER_SHAPE.circle);
        expect(labelHidden!.labelShown).toBe(false);
    });
});
