import { describe, expect, it, vi } from "vitest";
import {
    DIMMED_OPACITY,
    FieldDimming,
    SHAPE_FADED_OPACITY,
} from "../fieldDimming";

describe("FieldDimming", () => {
    it("dims everyone but the isolated move's marchers, and nobody without one", () => {
        const dimming = new FieldDimming();
        expect(dimming.isDimmed(1)).toBe(false);
        dimming.set(new Set([1, 2]));
        expect([1, 2, 3].map((id) => dimming.isDimmed(id))).toEqual([
            false,
            false,
            true,
        ]);
        dimming.set(null);
        expect(dimming.isDimmed(3)).toBe(false);
    });

    it("changes nothing, and asks for no frame, when the members are the same", () => {
        const dimming = new FieldDimming();
        const listener = vi.fn();
        dimming.subscribe(listener);
        dimming.set(new Set([1, 2]));
        const version = dimming.version;
        // As the window moves inside the isolated move: a new set, the same members
        dimming.set(new Set([2, 1]));
        dimming.set(null);
        dimming.set(null);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(dimming.version).toBe(version + 1);
    });

    it("an open shape fades everyone else, still readable, and hides its own marchers' dots once drawn (#417)", () => {
        const dimming = new FieldDimming();
        dimming.setFocus(new Set([1, 2]));
        expect([1, 2, 3].map((id) => dimming.opacityOf(id))).toEqual([
            1,
            1,
            SHAPE_FADED_OPACITY,
        ]);
        // Context, not gone (owner: 12% "looks empty"): clearly secondary but visible
        expect(SHAPE_FADED_OPACITY).toBeGreaterThanOrEqual(0.35);
        expect(SHAPE_FADED_OPACITY).toBeLessThanOrEqual(0.45);
        expect(dimming.labelShown(3)).toBe(true);

        dimming.setFocus(new Set([1, 2]), { hideMembers: true });
        expect([1, 2, 3].map((id) => dimming.opacityOf(id))).toEqual([
            0,
            0,
            SHAPE_FADED_OPACITY,
        ]);
        expect(dimming.labelShown(1)).toBe(false);
        // The shape's own marchers aren't dimmed for selection: they are the shape
        expect(dimming.isDimmed(1)).toBe(false);

        dimming.setFocus(null);
        expect([1, 2, 3].map((id) => dimming.opacityOf(id))).toEqual([1, 1, 1]);
        expect(dimming.labelShown(3)).toBe(true);
    });

    it("isolation alone dims as before, and a hidden-members change asks for a frame", () => {
        const dimming = new FieldDimming();
        dimming.set(new Set([1]));
        expect(dimming.opacityOf(2)).toBe(DIMMED_OPACITY);
        expect(dimming.labelShown(2)).toBe(true);
        const listener = vi.fn();
        dimming.subscribe(listener);
        dimming.setFocus(new Set([1]));
        dimming.setFocus(new Set([1]), { hideMembers: true });
        dimming.setFocus(new Set([1]), { hideMembers: true });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("hides only the shape's marchers while it's seen on its own; the faded rest keep their look (#558)", () => {
        const dimming = new FieldDimming();
        dimming.setFocus(new Set([1, 2]));
        const listener = vi.fn();
        dimming.subscribe(listener);
        dimming.setHidden(new Set([1, 2]));
        dimming.setHidden(new Set([2, 1]));
        expect(listener).toHaveBeenCalledTimes(1);
        expect([1, 2, 3].map((id) => dimming.opacityOf(id))).toEqual([
            0,
            0,
            SHAPE_FADED_OPACITY,
        ]);
        expect([1, 2, 3].map((id) => dimming.isHidden(id))).toEqual([
            true,
            true,
            false,
        ]);
        expect(dimming.labelShown(1)).toBe(false);
        expect(dimming.labelShown(3)).toBe(true);
        // Unrelated marchers stay as dimmed (for selection) as they were
        expect(dimming.isDimmed(3)).toBe(true);

        dimming.setHidden(null);
        expect([1, 2, 3].map((id) => dimming.opacityOf(id))).toEqual([
            1,
            1,
            SHAPE_FADED_OPACITY,
        ]);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
