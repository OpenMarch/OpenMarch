// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldGeometry, rgba01 } from "../fieldGeometry";

const fp: FieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const { xPixels, yPixels } = fp.centerFrontPoint;

/** Each rectangle as { minX, minY, maxX, maxY, color }. */
const rects = (geometry: ReturnType<typeof fieldGeometry>) =>
    Array.from({ length: geometry.rects.count }, (_, i) => {
        const [minX, minY, maxX, maxY] = geometry.rects.bounds.subarray(
            i * 4,
            i * 4 + 4,
        );
        const color = Array.from(
            geometry.rects.colors.subarray(i * 4, i * 4 + 4),
        );
        return { minX, minY, maxX, maxY, color };
    });

describe("fieldGeometry", () => {
    const geometry = fieldGeometry(fp);
    const all = rects(geometry);

    it("keeps every rectangle on the field but the border, just outside it", () => {
        // The border is three grid lines wide, from 2.5 outside the edge to 0.5 inside
        for (const r of all) {
            expect(r.minX).toBeGreaterThanOrEqual(-2.5 - 1e-3);
            expect(r.minY).toBeGreaterThanOrEqual(-2.5 - 1e-3);
            expect(r.maxX).toBeLessThanOrEqual(fp.width + 2.5 + 1e-3);
            expect(r.maxY).toBeLessThanOrEqual(fp.height + 2.5 + 1e-3);
        }
        // Lines on the edges hang half a stroke over them; only the border goes further
        const over = 0.5 + 1e-3;
        const outside = all.filter(
            (r) =>
                r.minX < -over ||
                r.minY < -over ||
                r.maxX > fp.width + over ||
                r.maxY > fp.height + over,
        );
        expect(outside).toHaveLength(4);
    });

    it("draws the background under everything, over the whole field", () => {
        expect(Array.from(geometry.background.bounds)).toEqual(
            [0, 0, fp.width, fp.height].map(Math.fround),
        );
        expect(Array.from(geometry.background.colors)).toEqual(
            rgba01(fp.theme.background).map(Math.fround),
        );
    });

    it("leaves out grid lines and half lines when the settings hide them", () => {
        const color = (c: number[]) => (r: { color: number[] }) =>
            r.color.every((v, i) => Math.abs(v - c[i]) < 1e-6);
        const tertiary = color(rgba01(fp.theme.tertiaryStroke));
        const secondary = color(rgba01(fp.theme.secondaryStroke));
        const count = (gridLines: boolean, halfLines: boolean) => {
            const r = rects(fieldGeometry(fp, { gridLines, halfLines }));
            return {
                grid: r.filter(tertiary).length,
                // Half lines and the side-line hashes share the secondary color
                secondary: r.filter(secondary).length,
            };
        };
        const both = count(true, true);
        expect(both.grid).toBeGreaterThan(0);
        expect(count(false, true).grid).toBe(0);
        expect(count(false, true).secondary).toBe(both.secondary);
        expect(count(true, false).grid).toBe(both.grid);
        expect(count(true, false).secondary).toBeLessThan(both.secondary);
    });

    it("centers each yard line on its checkpoint, where a dot on it is drawn", () => {
        const primary = rgba01(fp.theme.primaryStroke);
        const fullHeight = all.filter(
            (r) =>
                r.maxY - r.minY > fp.height - 1e-3 &&
                r.maxX - r.minX < 2 &&
                r.color.every((c, i) => Math.abs(c - primary[i]) < 1e-6),
        );
        const centers = fullHeight.map((r) => (r.minX + r.maxX) / 2);
        for (const checkpoint of fp.xCheckpoints.filter((c) => c.visible)) {
            const x =
                xPixels + checkpoint.stepsFromCenterFront * fp.pixelsPerStep;
            // Lines at the field's edges are clipped to it
            if (x <= 0 || x >= fp.width) continue;
            expect(
                centers.some((center) => Math.abs(center - x) < 1e-3),
                `a yard line at x = ${x}`,
            ).toBe(true);
        }
    });

    it("triangulates the yard numbers on their yard lines, home and away", () => {
        expect(geometry.texts.filter((t) => t.font === "number")).toEqual([]);
        const { shapes } = geometry;
        expect(shapes.fillIndexCount).toBeGreaterThan(0);
        // Every fill vertex is near a labeled yard line, in one of the two bands
        const lines = fp.xCheckpoints
            .filter((c) => c.fieldLabel)
            .map((c) => xPixels + c.stepsFromCenterFront * fp.pixelsPerStep);
        // The digits and the arrow beside them
        const reach = 6 * fp.pixelsPerStep;
        const seen = new Set<number>();
        for (let i = 0; i < shapes.fillIndexCount; i++) {
            const v = shapes.indices[i]!;
            const x = shapes.positions[v * 3]!;
            const y = shapes.positions[v * 3 + 1]!;
            const line = lines.findIndex((l) => Math.abs(l - x) < reach);
            expect(line, `a vertex at x = ${x}`).toBeGreaterThanOrEqual(0);
            seen.add(line * 2 + (y > yPixels / 2 ? 1 : 0));
            expect(y).toBeGreaterThan(0);
            expect(y).toBeLessThan(yPixels);
        }
        expect(seen.size).toBe(lines.length * 2);
        const color = rgba01(fp.theme.fieldLabel);
        for (let i = 0; i < shapes.colors.length; i += 4)
            color.forEach((value, k) =>
                expect(shapes.colors[i + k]).toBeCloseTo(value, 6),
            );
    });

    it("labels the checkpoints outside the field's edges", () => {
        const labels = geometry.texts.filter((t) => t.font === "label");
        const xs = fp.xCheckpoints.filter((c) => c.visible).length;
        const ys = fp.yCheckpoints.filter((c) => c.visible).length;
        const expected =
            xs *
                (Number(fp.bottomLabelsVisible) + Number(fp.topLabelsVisible)) +
            ys * (Number(fp.leftLabelsVisible) + Number(fp.rightLabelsVisible));
        expect(labels).toHaveLength(expected);
        for (const label of labels) {
            const outside =
                label.x < 0 ||
                label.x > fp.width ||
                label.y < 0 ||
                label.y > fp.height;
            expect(outside, `${label.text} at ${label.x}, ${label.y}`).toBe(
                true,
            );
        }
    });
});

describe("fieldGeometry border", () => {
    /** The border's sides: the only rectangles reaching outside the field. */
    const sides = (field: FieldProperties) =>
        rects(fieldGeometry(field)).filter(
            (r) => r.minX < -1 || r.minY < -1 || r.maxX > field.width + 1,
        );
    const left = (all: ReturnType<typeof sides>) =>
        all.find((r) => r.maxX - r.minX < 4 && r.minX < 0)!;
    const top = (all: ReturnType<typeof sides>) =>
        all.find((r) => r.maxY - r.minY < 4 && r.minY < 0)!;

    it("runs an opaque border's sides through the corners, so no antialiased seam shows", () => {
        const all = sides(fp);
        expect(left(all).minY).toBeCloseTo(top(all).minY);
    });

    it("keeps a translucent border's sides apart, so its corners aren't darker", () => {
        const translucent = new FieldProperties({
            ...fp,
            theme: {
                ...fp.theme,
                primaryStroke: { ...fp.theme.primaryStroke, a: 0.5 },
            },
        });
        const all = sides(translucent);
        expect(left(all).minY).toBeCloseTo(top(all).maxY);
    });
});

describe("fieldGeometry variants", () => {
    it("draws the y checkpoints as lines across the field without hashes", () => {
        const noHashes = new FieldProperties({ ...fp, useHashes: false });
        const lines = rects(fieldGeometry(noHashes)).filter(
            (r) => r.maxX - r.minX >= fp.width - 1e-3 && r.maxY - r.minY < 2,
        );
        const visibleYs = fp.yCheckpoints.filter((c) => c.visible).length;
        // Plus the border's top and bottom
        expect(lines.length).toBeGreaterThanOrEqual(visibleYs);
    });

    it("drops the checkpoint labels a side hides", () => {
        const hidden = new FieldProperties({
            ...fp,
            topLabelsVisible: false,
            bottomLabelsVisible: false,
            leftLabelsVisible: false,
            rightLabelsVisible: false,
        });
        expect(
            fieldGeometry(hidden).texts.filter((t) => t.font === "label"),
        ).toHaveLength(0);
    });
});

describe("fieldGeometry with a pit area", () => {
    // Around the 50, narrower than the field, 180 deep
    const pit = {
        left: xPixels - 300,
        right: xPixels + 300,
        top: yPixels,
        bottom: yPixels + 180,
    };
    const plain = fieldGeometry(fp);
    const withPit = fieldGeometry(fp, {
        gridLines: true,
        halfLines: true,
        strips: [pit],
    });

    it("fills it with an opaque flat tone just off the field's", () => {
        // The field, then the pit's paper, then a little ink over it
        expect(withPit.background.count).toBe(3);
        expect(Array.from(withPit.background.bounds.subarray(4, 8))).toEqual(
            [pit.left, pit.top, pit.right, pit.bottom].map(Math.fround),
        );
        expect(withPit.background.colors[7]).toBe(1);
        const ink = withPit.background.colors[11];
        expect(ink).toBeGreaterThan(0);
        expect(ink).toBeLessThan(0.15);
    });

    it("draws no lines on it: the field's own lines are unchanged", () => {
        expect(rects(withPit)).toEqual(rects(plain));
    });

    it("leaves the yard-line labels at the front sideline, over it", () => {
        const labels = (g: ReturnType<typeof fieldGeometry>) =>
            g.texts.filter((t) => t.font === "label").map((t) => t.y);
        expect(labels(withPit)).toEqual(labels(plain));
    });
});

describe("fieldGeometry with a pit area behind the field", () => {
    const back = {
        left: xPixels - 60,
        right: xPixels + 60,
        top: -180,
        bottom: 0,
    };
    const geometry = fieldGeometry(fp, {
        gridLines: true,
        halfLines: true,
        strips: [back],
    });

    it("fills it behind the back sideline", () => {
        expect(Array.from(geometry.background.bounds.subarray(4, 8))).toEqual(
            [back.left, -180, back.right, 0].map(Math.fround),
        );
    });
});

describe("fieldGeometry from the performers' side (#1265)", () => {
    const lines = { gridLines: true, halfLines: true };
    const audience = fieldGeometry(fp, lines);
    const performer = fieldGeometry(fp, { ...lines, viewFrom: "performer" });

    it("keeps the labels around the field upright, aligned to the other side", () => {
        const labels = (g: typeof audience) =>
            g.texts.filter((t) => t.font === "label");
        const swapped = {
            left: "right",
            center: "center",
            right: "left",
        } as const;
        expect(labels(performer).length).toBeGreaterThan(0);
        labels(audience).forEach((t, i) => {
            const u = labels(performer)[i]!;
            expect(u.rotation).toBe(t.rotation);
            expect(u.align).toBe(swapped[t.align]);
            expect(u.x).toBeCloseTo(fp.width - t.x);
            expect(u.y).toBeCloseTo(fp.height - t.y);
        });
    });

    it("turns yard number text half a turn with the field", () => {
        const numbers = (g: typeof audience) =>
            g.texts.filter((t) => t.font === "number");
        numbers(audience).forEach((t, i) =>
            expect(numbers(performer)[i]!.rotation).toBe(
                t.rotation === 0 ? Math.PI : 0,
            ),
        );
    });

    it("draws the same number of rectangles and shape triangles", () => {
        expect(performer.rects.count).toBe(audience.rects.count);
        expect(performer.shapes.indices.length).toBe(
            audience.shapes.indices.length,
        );
    });
});
