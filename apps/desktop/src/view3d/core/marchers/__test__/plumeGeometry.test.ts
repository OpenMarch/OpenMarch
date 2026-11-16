// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    PLUME_HEIGHT,
    plumeGeometryData,
} from "@/view3d/core/marchers/plumeGeometry";

describe("plume geometry", () => {
    it("builds the two tiers the owner picked: feather cards at high, one solid at low", () => {
        const high = plumeGeometryData("high");
        const low = plumeGeometryData("low");
        // a 6 × 3 core (42) and 64 two-segment cards (256)
        expect(high.triangles).toBe(298);
        // an 8 × 4 core (72), no cards
        expect(low.triangles).toBe(72);
        const cards = (d: typeof high) => d.card.reduce((n, c) => n + c, 0) / 3;
        expect(cards(high)).toBe(256);
        expect(cards(low)).toBe(0);
    });

    it("is the same shape every time", () => {
        expect(plumeGeometryData("high").position).toEqual(
            plumeGeometryData("high").position,
        );
        expect(plumeGeometryData("low").position).toEqual(
            plumeGeometryData("low").position,
        );
    });

    it("stands on the socket, about its height tall, leaning back", () => {
        for (const tier of ["high", "low"] as const) {
            const { position } = plumeGeometryData(tier);
            let minY = Infinity;
            let maxY = -Infinity;
            let topZ = 0;
            let topN = 0;
            for (let i = 0; i < position.length; i += 3) {
                const y = position[i + 1];
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                if (y > PLUME_HEIGHT * 0.8) {
                    topZ += position[i + 2];
                    topN++;
                }
                // about as wide as the shako (radius about 0.1 m), feather tips included
                expect(Math.hypot(position[i], position[i + 2])).toBeLessThan(
                    0.12,
                );
            }
            // sunk a little into the crown, never far below it
            expect(minY).toBeGreaterThan(-0.03);
            expect(maxY).toBeGreaterThan(PLUME_HEIGHT * 0.9);
            expect(maxY).toBeLessThan(PLUME_HEIGHT * 1.15);
            // +Z is the marcher's front: the top leans toward the back
            expect(topZ / topN).toBeLessThan(0);
        }
    });

    it("gives every vertex a unit normal and in-range attributes", () => {
        for (const tier of ["high", "low"] as const) {
            const d = plumeGeometryData(tier);
            for (let i = 0; i < d.normal.length; i += 3)
                expect(
                    Math.hypot(d.normal[i], d.normal[i + 1], d.normal[i + 2]),
                ).toBeCloseTo(1, 5);
            for (const h of d.height) {
                expect(h).toBeGreaterThanOrEqual(-0.1);
                expect(h).toBeLessThanOrEqual(1);
            }
            for (const s of d.shade) {
                expect(s).toBeGreaterThan(0.6);
                expect(s).toBeLessThan(1.1);
            }
        }
    });

    it("gives each card one seed, so the shader treats it as one feather", () => {
        const d = plumeGeometryData("high");
        const seeds = new Set<number>();
        // a card is two segments: four triangles in a row
        for (let i = 0; i < d.card.length; i++) {
            if (!d.card[i]) continue;
            seeds.add(d.seed[i]);
        }
        expect(seeds.size).toBe(64);
    });
});
