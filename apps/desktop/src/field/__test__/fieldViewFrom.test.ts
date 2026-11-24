// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { planField2d, textCenterY, turnFieldPlan } from "../fieldPlan";
import {
    pointSeenFrom,
    turnedPositionSource,
    turnPathData,
} from "../fieldViewFrom";

const base: FieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const size = { width: 100, height: 50 };
const lines = { gridLines: true, halfLines: true };

describe("pointSeenFrom", () => {
    it("leaves a point alone from the audience", () => {
        const p = { x: 10, y: 20, id: 3 };
        expect(pointSeenFrom("audience", size, p)).toBe(p);
    });

    it("turns a point half a turn about the field's center from the performers' side", () => {
        expect(
            pointSeenFrom("performer", size, { x: 10, y: 20, id: 3 }),
        ).toEqual({ x: 90, y: 30, id: 3 });
    });
});

describe("turnPathData", () => {
    it("turns every point of M, L, Q and C commands and keeps Z", () => {
        expect(
            turnPathData("M 0 0 L 10 5 Q 20 10 30 15 C 1 2 3 4 5 6 Z", size),
        ).toBe("M 100 50 L 90 45 Q 80 40 70 35 C 99 48 97 46 95 44 Z");
    });

    it("turns an arc's end point and keeps its radii, angle and flags", () => {
        expect(turnPathData("M 10 10 A 5 5 0 0 1 20 10", size)).toBe(
            "M 90 40 A 5 5 0 0 1 80 40",
        );
    });

    it("comes back to the same path when turned twice", () => {
        const d = "M 1.5 2.25 L 3 4 A 2 2 0 1 0 5 6 C 7 8 9 10 11 12";
        expect(turnPathData(turnPathData(d, size), size)).toBe(d);
    });
});

describe("turnedPositionSource", () => {
    it("turns the source's positions and keeps its marcher order", () => {
        const source = {
            marcherIds: () => [1, 2],
            positionsAt: (_beat: number, out: Float64Array) => {
                out.set([10, 20, 30, 40]);
                return true;
            },
        };
        const turned = turnedPositionSource(source, size);
        const out = new Float64Array(4);
        expect(turned.positionsAt(0, out)).toBe(true);
        expect([...out]).toEqual([90, 30, 70, 10]);
        expect(turned.marcherIds()).toEqual([1, 2]);
    });

    it("leaves the buffer untouched when the source can't fill it", () => {
        const turned = turnedPositionSource(
            { marcherIds: () => [1], positionsAt: () => false },
            size,
        );
        const out = new Float64Array([1, 2]);
        expect(turned.positionsAt(0, out)).toBe(false);
        expect([...out]).toEqual([1, 2]);
    });
});

describe("planField2d from the performers' side", () => {
    const audience = planField2d(base, lines);
    const performer = planField2d(base, { ...lines, viewFrom: "performer" });
    const { width, height } = base;

    it("is the audience plan turned", () => {
        expect(performer).toEqual(turnFieldPlan(audience));
    });

    it("turns every line half a turn", () => {
        expect(performer.lines).toHaveLength(audience.lines.length);
        audience.lines.forEach((l, i) => {
            const t = performer.lines[i]!;
            expect(t.x1).toBeCloseTo(width - l.x1);
            expect(t.y1).toBeCloseTo(height - l.y1);
            expect(t.x2).toBeCloseTo(width - l.x2);
            expect(t.y2).toBeCloseTo(height - l.y2);
        });
    });

    it("keeps the labels around the field upright, their side swapped", () => {
        const labels = (plan: typeof audience) =>
            plan.texts.filter((t) => t.role === "checkpointLabel");
        const before = labels(audience);
        const after = labels(performer);
        expect(after.length).toBeGreaterThan(0);
        before.forEach((t, i) => {
            const u = after[i]!;
            expect(u.flipped).toBe(false);
            expect(u.x).toBeCloseTo(width - t.x);
            expect(textCenterY(u)).toBeCloseTo(height - textCenterY(t));
            expect(u.anchor).toBe(
                { start: "end", middle: "middle", end: "start" }[t.anchor],
            );
        });
    });

    it("turns painted yard numbers with the field", () => {
        expect(performer.shapes.length).toBe(audience.shapes.length);
        expect(performer.shapes.length).toBeGreaterThan(0);
        performer.shapes.forEach((shape, i) =>
            expect(shape.path).toBe(
                turnPathData(audience.shapes[i]!.path, base),
            ),
        );
        const numbers = (plan: typeof audience) =>
            plan.texts.filter((t) => t.role === "yardNumber");
        numbers(audience).forEach((t, i) =>
            expect(numbers(performer)[i]!.flipped).toBe(!t.flipped),
        );
    });

    it("keeps the border around the field", () => {
        expect(performer.border).toEqual(audience.border);
    });

    it("turns the field image about its center", () => {
        const fp = new FieldProperties({
            ...base,
            showFieldImage: true,
            imageFillOrFit: "fit",
        });
        const image = { width: 400, height: 100 };
        const plain = planField2d(fp, { ...lines, image });
        const turned = planField2d(fp, {
            ...lines,
            image,
            viewFrom: "performer",
        });
        expect(plain.image?.turned).toBeFalsy();
        const [a, b] = [plain.image!, turned.image!];
        expect(b.turned).toBe(true);
        expect(b.x).toBeCloseTo(fp.width - a.x - a.width);
        expect(b.y).toBeCloseTo(fp.height - a.y - a.height);
        expect([b.width, b.height, b.opacity]).toEqual([
            a.width,
            a.height,
            a.opacity,
        ]);
    });
});
