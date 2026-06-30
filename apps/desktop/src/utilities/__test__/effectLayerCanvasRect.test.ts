import { createFieldTheme } from "@openmarch/core";
import { describe, expect, it } from "vitest";
import {
    createEffectLayerCanvasRect,
    getEffectLayerRectStyles,
    isLightingEffectLayerRect,
    resolveEffectLayerRectColor,
} from "../effectLayerCanvasRect";

describe("resolveEffectLayerRectColor", () => {
    const fallback = createFieldTheme().shape;

    it("uses solid effect color when available", () => {
        expect(
            resolveEffectLayerRectColor(
                fallback,
                "solid",
                JSON.stringify({ color: "#ff0000" }),
            ),
        ).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("falls back to field theme shape color", () => {
        expect(resolveEffectLayerRectColor(fallback, "fade", "{}")).toBe(
            fallback,
        );
    });
});

describe("getEffectLayerRectStyles", () => {
    const color = { r: 10, g: 20, b: 30, a: 1 };

    it("uses higher fill opacity for draft rects", () => {
        expect(getEffectLayerRectStyles(color, "draft").fill).toBe(
            "rgba(10, 20, 30, 0.2)",
        );
    });

    it("uses lower fill opacity for persisted rects", () => {
        expect(getEffectLayerRectStyles(color, "persisted").fill).toBe(
            "rgba(10, 20, 30, 0.15)",
        );
    });

    it("uses full-opacity stroke", () => {
        expect(getEffectLayerRectStyles(color, "persisted").stroke).toBe(
            "rgba(10, 20, 30, 1)",
        );
    });
});

describe("createEffectLayerCanvasRect", () => {
    it("creates a non-interactive tagged rect with geometry", () => {
        const rect = createEffectLayerCanvasRect({
            left: 20,
            top: 30,
            width: 40,
            height: 50,
            strokeColor: { r: 1, g: 2, b: 3, a: 1 },
            style: "persisted",
        });

        expect(rect.left).toBe(20);
        expect(rect.top).toBe(30);
        expect(rect.width).toBe(40);
        expect(rect.height).toBe(50);
        expect(rect.selectable).toBe(false);
        expect(rect.evented).toBe(false);
        expect(rect.isLightingEffectLayer).toBe(true);
        expect(isLightingEffectLayerRect(rect)).toBe(true);
    });
});
