import { describe, expect, it } from "vitest";
import type { GeometryChange } from "@openmarch/core";
import type { PositionSource } from "@/timeline/positionBuffer";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { FieldMarchers } from "../fieldMarchers";
import { FieldItems } from "../fieldItems";

/** Marcher 1 is a performer at (0, 0); marcher 2 an item at (100, 50) */
const positions: PositionSource = {
    marcherIds: () => [1, 2],
    positionsAt(_beat, out) {
        out.set([0, 0, 100, 50]);
        return true;
    },
};

const change = (beat: number, patch: Partial<GeometryChange> = {}) =>
    ({
        beat,
        outlineType: "rectangle",
        width: 2,
        depth: 1,
        height: 0,
        rotation: 0,
        customOutline: null,
        transitionLength: 1,
        rollsOut: false,
        leadingEdge: null,
        ...patch,
    }) satisfies GeometryChange;

const setup = (
    changes: GeometryChange[] = [change(2)],
    hidden: number[] = [],
) => {
    const marchers = new FieldMarchers(positions);
    const items = new FieldItems(marchers);
    items.set({
        itemIds: new Set([2]),
        changes: new Map([[2, changes]]),
        hidden: new Set(hidden),
    });
    return { marchers, items };
};

const extent = (points: readonly { x: number; y: number }[]) => ({
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
});

describe("FieldItems", () => {
    it("draws an item's Outline at its size in meters, around where the timeline has it", () => {
        const { marchers, items } = setup();
        marchers.fill(3);
        const [outline] = items.outlines();
        expect(outline.id).toBe(2);
        const box = extent(outline.points);
        expect(box.maxX - box.minX).toBeCloseTo(2 * PIXELS_PER_METER);
        expect(box.maxY - box.minY).toBeCloseTo(PIXELS_PER_METER);
        expect((box.minX + box.maxX) / 2).toBeCloseTo(100);
        expect((box.minY + box.maxY) / 2).toBeCloseTo(50);
    });

    it("draws nothing for an item Off field, before the count it was made on", () => {
        const { marchers, items } = setup();
        marchers.fill(1);
        expect(items.outlines()).toEqual([]);
        expect(marchers.hidden[1]).toBe(1);
    });

    it("draws nothing for an item the user hid, and the field can't hit it", () => {
        const { marchers, items } = setup([change(0)], [2]);
        marchers.fill(3);
        expect(items.outlines()).toEqual([]);
        expect(marchers.hidden[1]).toBe(1);
        expect(items.itemAt({ x: 100, y: 50 })).toBeNull();
    });

    it("follows the Outline changes at the beat drawn", () => {
        const { marchers, items } = setup([change(0), change(4, { width: 6 })]);
        marchers.fill(3);
        expect(items.outlines()[0].geometry.width).toBe(2);
        marchers.fill(4);
        expect(items.outlines()[0].geometry.width).toBe(6);
    });

    it("hits an item anywhere inside its Outline, not only at its center", () => {
        const { marchers, items } = setup([change(0, { width: 4, depth: 1 })]);
        marchers.fill(1);
        const halfWidth = 2 * PIXELS_PER_METER;
        expect(items.itemAt({ x: 100 + halfWidth - 1, y: 50 })).toBe(2);
        expect(items.itemAt({ x: 100 + halfWidth + 1, y: 50 })).toBeNull();
    });

    it("draws a size and turn being dragged instead of the stored one, until it's cleared", () => {
        const { marchers, items } = setup();
        marchers.fill(3);
        const { version } = items;
        items.setPreview(2, { width: 3, depth: 3, rotation: 45 });
        expect(items.version).toBeGreaterThan(version);
        expect(items.outlines()[0].geometry).toMatchObject({
            width: 3,
            depth: 3,
            rotation: 45,
        });
        items.setPreview(2, null);
        expect(items.outlines()[0].geometry.width).toBe(2);
    });

    it("tells items from performers", () => {
        const { items } = setup();
        expect(items.isItem(2)).toBe(true);
        expect(items.isItem(1)).toBe(false);
    });

    it("draws a newly hidden item no more, even for a listener that read it as it was told", () => {
        const { marchers, items } = setup([change(0)]);
        marchers.fill(3);
        expect(items.outlines()).toHaveLength(1);
        const seen: number[] = [];
        items.subscribe(() => seen.push(items.outlines().length));
        items.set({
            itemIds: new Set([2]),
            changes: new Map([[2, [change(0)]]]),
            hidden: new Set([2]),
        });
        expect(seen).toEqual([0]);
        expect(items.outlines()).toEqual([]);
        expect(items.itemAt({ x: 100, y: 50 })).toBeNull();
    });

    it("draws an item in its own color, and others in none", () => {
        const { marchers, items } = setup([change(0)]);
        marchers.fill(3);
        expect(items.outlines()[0].color).toBeNull();
        const red = { r: 220, g: 38, b: 38, a: 1 };
        items.set({
            itemIds: new Set([2]),
            changes: new Map([[2, [change(0)]]]),
            hidden: new Set(),
            colors: new Map([[2, red]]),
        });
        expect(items.outlines()[0].color).toEqual(red);
    });
});

describe("FieldItems for the front ensemble", () => {
    it("draws a locked pit instrument with its lock and its playing spot on the field side", () => {
        const marchers = new FieldMarchers(positions);
        const items = new FieldItems(marchers);
        items.set({
            itemIds: new Set([2]),
            changes: new Map([[2, [change(0)]]]),
            hidden: new Set(),
            locked: new Set([2]),
            models: new Map([[2, "pit/marimba-5.0"]]),
        });
        marchers.fill(1);
        const [outline] = items.outlines();
        expect(items.isLocked(2)).toBe(true);
        expect(items.isLocked(1)).toBe(false);
        expect(outline.locked).toBe(true);
        // Centered, toward the field (up the screen) from the item at (100, 50)
        expect(outline.playingSpot!.x).toBeCloseTo(100);
        expect(outline.playingSpot!.y).toBeLessThan(50 - PIXELS_PER_METER / 2);
    });

    it("gives no playing spot to an item with no model, or a speaker", () => {
        for (const models of [
            new Map<number, string>(),
            new Map([[2, "pit/speaker-tall"]]),
        ]) {
            const marchers = new FieldMarchers(positions);
            const items = new FieldItems(marchers);
            items.set({
                itemIds: new Set([2]),
                changes: new Map([[2, [change(0)]]]),
                hidden: new Set(),
                models,
            });
            marchers.fill(1);
            expect(items.outlines()[0].playingSpot).toBeNull();
            expect(items.outlines()[0].locked).toBe(false);
        }
    });
});
