import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createFieldTheme } from "@openmarch/core";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import type { FieldMarchers } from "../fieldMarchers";
import { useMarcherShapeOf } from "../useMarcherShapes";

const theme = createFieldTheme({});
const shown = { visible: true, label_visible: true };

/** One marcher whose appearance can change, telling subscribers as `FieldMarchers` does. */
function oneMarcher(shape_type: string) {
    const listeners = new Set<() => void>();
    const marchers = {
        ids: [7],
        stacks: [[{ ...shown, shape_type }]] as AppearanceComponentOptional[][],
        appearanceVersion: 0,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    const look = (next: string) =>
        act(() => {
            marchers.stacks = [[{ ...shown, shape_type: next }]];
            marchers.appearanceVersion++;
            listeners.forEach((listener) => listener());
        });
    return { marchers: marchers as unknown as FieldMarchers, look };
}

describe("useMarcherShapeOf", () => {
    it("sees a marcher go from a circle to an X, which start with the same letter", () => {
        const { marchers, look } = oneMarcher("circle");
        const { result } = renderHook(() => useMarcherShapeOf(marchers, theme));
        expect(result.current(7)).toBe("circle");
        look("x");
        expect(result.current(7)).toBe("cross");
    });

    it("keeps the same lookup when an appearance changes but no shape does", () => {
        const { marchers, look } = oneMarcher("square");
        const { result } = renderHook(() => useMarcherShapeOf(marchers, theme));
        const before = result.current;
        look("square");
        expect(result.current).toBe(before);
    });
});
