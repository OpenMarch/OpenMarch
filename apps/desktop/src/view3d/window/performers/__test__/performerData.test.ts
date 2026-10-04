import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import {
    DEFAULT_FIELD_THEME,
    pixelsToWorld,
    type RgbaColor,
} from "@openmarch/core";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import {
    RING_Y,
    buildPerformerSlots,
    resolvePerformerLook,
    writePerformerLooks,
    writePerformerMatrices,
    writePerformerPositions,
    writeRingMatrices,
} from "../performerData";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const theme = DEFAULT_FIELD_THEME;

const rgba = (r: number, g: number, b: number, a = 1): RgbaColor => ({
    r,
    g,
    b,
    a,
});

/** A timeline that moves in a straight line between two sets. */
const timeline = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    startMs = 0,
    endMs = 1000,
): MarcherTimeline => ({
    pathMap: new Map([
        [startMs, from],
        [endMs, to],
    ]),
    sortedTimestamps: [startMs, endMs],
});

const appearance = (
    fields: Partial<AppearanceComponentOptional>,
): AppearanceComponentOptional =>
    ({
        fill_color: null,
        outline_color: null,
        shape_type: null,
        visible: true,
        label_visible: true,
        equipment_name: null,
        equipment_state: null,
        ...fields,
    }) as AppearanceComponentOptional;

describe("buildPerformerSlots", () => {
    it("orders by marcher ID and keeps a slot for marchers without positions", () => {
        const t2 = timeline({ x: 0, y: 0 }, { x: 10, y: 0 });
        const slots = buildPerformerSlots([3, 1, 2], new Map([[2, t2]]));
        expect(slots.ids).toEqual([1, 2, 3]);
        expect(slots.timelines).toEqual([null, t2, null]);
        expect(slots.indexById.get(3)).toBe(2);
    });
});

describe("resolvePerformerLook", () => {
    it("falls back to the field theme when there is no appearance", () => {
        expect(resolvePerformerLook(undefined, theme)).toEqual({
            fill: theme.defaultMarcher.fill,
            visible: true,
        });
    });

    it("takes the first non-null fill in priority order, like CanvasMarcher", () => {
        const look = resolvePerformerLook(
            [
                appearance({ fill_color: null }), // marcher page, no override
                appearance({ fill_color: rgba(0, 0, 255) }), // tag
                appearance({ fill_color: rgba(0, 255, 0) }), // section
                appearance({ fill_color: theme.defaultMarcher.fill }),
            ],
            theme,
        );
        expect(look.fill).toEqual(rgba(0, 0, 255));
        expect(look.visible).toBe(true);
    });

    it("hides a marcher whose section is hidden", () => {
        const look = resolvePerformerLook(
            [
                appearance({ visible: true }),
                appearance({ visible: false }),
                appearance({}),
            ],
            theme,
        );
        expect(look.visible).toBe(false);
    });
});

describe("writePerformerLooks", () => {
    it("writes sRGB fills in [0, 1] and visibility per instance", () => {
        const slots = buildPerformerSlots([5, 7], new Map());
        const rgb = new Float32Array(6);
        const visible = new Uint8Array(2);
        writePerformerLooks(
            slots,
            {
                5: [appearance({ fill_color: rgba(255, 128, 0, 0.5) })],
                7: [appearance({ visible: false })],
            },
            theme,
            rgb,
            visible,
        );
        expect([...rgb.slice(0, 3)]).toEqual(
            [1, 128 / 255, 0].map(Math.fround),
        );
        const red = theme.defaultMarcher.fill;
        expect([...rgb.slice(3)]).toEqual(
            [red.r / 255, red.g / 255, red.b / 255].map(Math.fround),
        );
        expect([...visible]).toEqual([1, 0]);
    });
});

describe("performer matrices", () => {
    const from = { x: 400, y: 300 };
    const to = { x: 600, y: 500 };
    const slots = buildPerformerSlots(
        [1, 2, 3],
        new Map([
            [1, timeline(from, to)],
            [2, timeline(to, from)],
        ]),
    );
    const visible = new Uint8Array([1, 1, 1]);

    const positionsAt = (ms: number) => {
        const xz = new Float32Array(6);
        const placed = new Uint8Array(3);
        writePerformerPositions(slots, ms, field, visible, xz, placed);
        return { xz, placed };
    };

    it("places each block at its world position, standing on the ground", () => {
        const { xz, placed } = positionsAt(1000);
        expect([...placed]).toEqual([1, 1, 0]);
        const matrices = new Float32Array(48).fill(7);
        writePerformerMatrices(3, xz, placed, matrices);

        const expected = pixelsToWorld(field, to);
        const m = new Matrix4().fromArray(matrices, 0);
        const p = new Vector3().applyMatrix4(m);
        expect(p.x).toBeCloseTo(expected.x, 4);
        expect(p.y).toBe(0);
        expect(p.z).toBeCloseTo(expected.z, 4);
        // No rotation or scale.
        expect(new Vector3(1, 1, 1).applyMatrix4(m).sub(p)).toEqual(
            new Vector3(1, 1, 1),
        );
        // A marcher with no positions draws nothing (zero matrix).
        expect([...matrices.slice(32)]).toEqual(new Array(16).fill(0));
    });

    it("follows the timeline between sets", () => {
        const { xz } = positionsAt(500);
        const a = pixelsToWorld(field, from);
        const b = pixelsToWorld(field, to);
        expect(xz[0]).toBeCloseTo((a.x + b.x) / 2, 4);
        expect(xz[1]).toBeCloseTo((a.z + b.z) / 2, 4);
    });

    it("leaves hidden marchers unplaced", () => {
        const xz = new Float32Array(6);
        const placed = new Uint8Array(3);
        writePerformerPositions(
            slots,
            0,
            field,
            new Uint8Array([0, 1, 1]),
            xz,
            placed,
        );
        expect([...placed]).toEqual([0, 1, 0]);
    });
});

describe("writeRingMatrices", () => {
    const slots = buildPerformerSlots([10, 20, 30], new Map());
    const xz = new Float32Array([1, -2, 3, -4, 5, -6]);

    it("packs one ring per selected, placed marcher at its feet", () => {
        const matrices = new Float32Array(48);
        const count = writeRingMatrices(
            slots,
            new Set([30, 10, 99]),
            xz,
            new Uint8Array([1, 1, 1]),
            matrices,
        );
        expect(count).toBe(2);
        const first = new Vector3().applyMatrix4(
            new Matrix4().fromArray(matrices, 0),
        );
        const second = new Vector3().applyMatrix4(
            new Matrix4().fromArray(matrices, 16),
        );
        expect([first.x, first.y, first.z]).toEqual([
            1,
            Math.fround(RING_Y),
            -2,
        ]);
        expect([second.x, second.z]).toEqual([5, -6]);
    });

    it("skips selected marchers that aren't placed, and empty selections", () => {
        const matrices = new Float32Array(48);
        expect(
            writeRingMatrices(
                slots,
                new Set([20]),
                xz,
                new Uint8Array([1, 0, 1]),
                matrices,
            ),
        ).toBe(0);
        expect(
            writeRingMatrices(
                slots,
                new Set(),
                xz,
                new Uint8Array([1, 1, 1]),
                matrices,
            ),
        ).toBe(0);
    });
});
