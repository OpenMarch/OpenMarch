import { createFieldTheme } from "@openmarch/core";
import { describe, expect, it } from "vitest";
import {
    createEffectLayerCanvasRect,
    createWipeEffectLayerCanvasRect,
    getEffectLayerRectStyles,
    getWipeFillOpacity,
    isLightingEffectLayerRect,
    isWipeEffectLayerCanvasRect,
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

    it("uses wipe effect color when available", () => {
        expect(
            resolveEffectLayerRectColor(
                fallback,
                "wipe",
                JSON.stringify({ color: "#00ff00", directionDegrees: 90 }),
            ),
        ).toEqual({ r: 0, g: 255, b: 0, a: 1 });
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

describe("createWipeEffectLayerCanvasRect", () => {
    const strokeColor = { r: 100, g: 150, b: 200, a: 1 };

    it("creates a tagged wipe rect with initial wipe state", () => {
        const rect = createWipeEffectLayerCanvasRect({
            left: 10,
            top: 20,
            width: 80,
            height: 60,
            strokeColor,
            style: "persisted",
            layerId: 5,
            wipeProgress: 0.5,
            wipeDirectionDegrees: 0,
        });

        expect(rect.isLightingEffectLayer).toBe(true);
        expect(isWipeEffectLayerCanvasRect(rect)).toBe(true);
        expect(rect.lightingEffectLayerId).toBe(5);
        expect(rect.wipeProgress).toBe(0.5);
        expect(rect.wipeDirectionDegrees).toBe(0);
    });

    it("updates wipe progress via setWipeState", () => {
        const rect = createWipeEffectLayerCanvasRect({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            strokeColor,
            style: "persisted",
            wipeProgress: 0,
            wipeDirectionDegrees: 0,
        });

        rect.setWipeState({
            progress: 0.75,
            directionDegrees: 180,
            fillColor: strokeColor,
            style: "selected",
        });

        expect(rect.wipeProgress).toBe(0.75);
        expect(rect.wipeDirectionDegrees).toBe(180);
        expect(rect.rectStyle).toBe("selected");
    });
});

describe("getWipeFillOpacity", () => {
    it("returns higher opacity than persisted base fill", () => {
        expect(getWipeFillOpacity("persisted")).toBeGreaterThan(0.15);
        expect(getWipeFillOpacity("selected")).toBeGreaterThan(
            getWipeFillOpacity("persisted"),
        );
    });
});
