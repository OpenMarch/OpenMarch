// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FieldPlanShape } from "@/field/fieldPlan";
import { yardNumberPath } from "@/field/fieldNumbers";
import {
    fieldShapeMesh,
    groupHoles,
    shapePathContours,
    signedArea2,
    type FieldShapeMesh,
} from "../fieldShapes";

const color = { r: 255, g: 255, b: 255, a: 1 };

/** A number 60 units tall on the line x = 100, read from the front (home) or the back (away). */
const numberShape = (label: string, side: "home" | "away"): FieldPlanShape => ({
    role: "yardNumber",
    color,
    path: yardNumberPath({
        label,
        lineX: 100,
        insideY: side === "home" ? 100 : 200,
        outsideY: side === "home" ? 160 : 140,
        arrowDirection: label.length === 2 ? 1 : 0,
    })!,
});

/** The fill's area: its triangles, which the zoom never moves. */
function fillArea(mesh: FieldShapeMesh): number {
    const p = mesh.positions;
    let area = 0;
    for (let i = 0; i < mesh.fillIndexCount; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[i + k]! * 3) as [
            number,
            number,
            number,
        ];
        area +=
            Math.abs(
                (p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) -
                    (p[c]! - p[a]!) * (p[b + 1]! - p[a + 1]!),
            ) / 2;
    }
    return area;
}

/** Inside the filled region: inside an odd number of outlines (even-odd, as the holes nest). */
function filled(contours: [number, number][][], x: number, y: number) {
    let inside = false;
    for (const c of contours)
        for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
            const [xi, yi] = c[i]!;
            const [xj, yj] = c[j]!;
            if (
                (yi > y ? yj <= y : yj > y) &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            )
                inside = !inside;
        }
    return inside;
}

describe("shapePathContours", () => {
    it("closes each subpath, flattening curves and dropping repeated points", () => {
        const contours = shapePathContours(
            "M0 0L0 0L10 0Q10 10 0 10ZM20 20L30 20L30 30Z",
            4,
        );
        expect(contours).toHaveLength(2);
        expect(contours[0]).toHaveLength(2 + 4);
        expect(contours[0]![contours[0]!.length - 1]).toEqual([0, 10]);
        expect(contours[1]).toEqual([
            [20, 20],
            [30, 20],
            [30, 30],
        ]);
    });
});

describe("fieldShapeMesh", () => {
    // Digits with counters, alone and as yard numbers, from both sidelines
    const cases = ["0", "4", "6", "8", "9", "40", "80", "100"].flatMap(
        (label) => (["home", "away"] as const).map((side) => ({ label, side })),
    );

    it.each(cases)(
        "keeps the counters of $label ($side) as holes",
        ({ label, side }) => {
            const shape = numberShape(label, side);
            const contours = shapePathContours(shape.path);
            const groups = groupHoles(contours);
            const holes = groups.flatMap((g) => g.holes);
            expect(holes.length).toBeGreaterThan(0);
            const area = (c: [number, number][]) =>
                Math.abs(signedArea2(c)) / 2;
            const outlines = groups.reduce(
                (sum, g) => sum + area(g.outline),
                0,
            );
            const counters = holes.reduce((sum, h) => sum + area(h), 0);

            const mesh = fieldShapeMesh([shape]);
            // The fill covers the outlines less the counters, so they show through
            // (to float precision: the mesh stores 32-bit positions)
            const expected = outlines - counters;
            expect(Math.abs(fillArea(mesh) - expected) / expected).toBeLessThan(
                1e-5,
            );
            expect(fillArea(mesh)).toBeLessThan(outlines - 0.5 * counters);
        },
    );

    it('leaves the "0" open in the middle', () => {
        const mesh = fieldShapeMesh([numberShape("0", "away")]);
        const [outline] = shapePathContours(numberShape("0", "away").path);
        const outer = Math.abs(signedArea2(outline!)) / 2;
        expect(fillArea(mesh)).toBeLessThan(outer * 0.6);
    });

    it.each(cases)(
        "never moves the fill of $label ($side), so its triangles can't flip",
        ({ label, side }) => {
            const mesh = fieldShapeMesh([numberShape(label, side)]);
            for (let i = 0; i < mesh.fillIndexCount; i++)
                expect(mesh.edges[mesh.indices[i]!]).toBe(0);
        },
    );

    it.each(cases)(
        "points every edge strip of $label ($side) away from the fill",
        ({ label, side }) => {
            const shape = numberShape(label, side);
            const contours = shapePathContours(shape.path);
            const mesh = fieldShapeMesh([shape]);
            const vertices = mesh.positions.length / 3;
            const eps = 0.05;
            let checked = 0;
            for (let v = 0; v < vertices; v++) {
                if (mesh.edges[v] !== 1) continue;
                const x = mesh.positions[v * 3]!;
                const y = mesh.positions[v * 3 + 1]!;
                const ox = mesh.offsets[v * 2]!;
                const oy = mesh.offsets[v * 2 + 1]!;
                expect(Math.hypot(ox, oy)).toBeGreaterThanOrEqual(1 - 1e-6);
                expect(Math.hypot(ox, oy)).toBeLessThanOrEqual(2 + 1e-6);
                // Skip the sharpest corners, where a short step can cross another edge
                if (Math.hypot(ox, oy) > 1.5) continue;
                expect(filled(contours, x + ox * eps, y + oy * eps)).toBe(
                    false,
                );
                expect(filled(contours, x - ox * eps, y - oy * eps)).toBe(true);
                checked++;
            }
            expect(checked).toBeGreaterThan(vertices / 4);
        },
    );

    it("colors every vertex with its shape's color", () => {
        const mesh = fieldShapeMesh([
            {
                ...numberShape("1", "home"),
                color: { r: 255, g: 0, b: 51, a: 0.5 },
            },
        ]);
        for (let i = 0; i < mesh.colors.length; i += 4)
            [1, 0, 0.2, 0.5].forEach((value, k) =>
                expect(mesh.colors[i + k]).toBeCloseTo(value, 6),
            );
    });

    it("is empty without shapes", () => {
        const mesh = fieldShapeMesh([]);
        expect(mesh.indices.length).toBe(0);
        expect(mesh.positions.length).toBe(0);
    });
});
