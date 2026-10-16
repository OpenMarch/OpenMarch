import { describe, expect, it, vi } from "vitest";
import { FieldDimming } from "../fieldDimming";

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
});
