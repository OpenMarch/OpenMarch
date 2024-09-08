import { describe, it, expect } from "vitest";
import MarcherPage from "@/global/classes/MarcherPage";
import MarcherLine from "../../../../global/classes/MarcherLine";

describe("MarcherLine", () => {
    describe("distributeMarchers", () => {
        it("should evenly distribute marcherPages along the line", () => {
            const marcherLine = new MarcherLine({
                x1: 0,
                y1: 0,
                x2: 100,
                y2: 100,
            });
            const marcherPages: MarcherPage[] = [
                { x: 0, y: 0, id: 0 } as MarcherPage,
                { x: 0, y: 0, id: 1 } as MarcherPage,
                { x: 0, y: 0, id: 2 } as MarcherPage,
            ];
            const expectedMarcherPages: MarcherPage[] = [
                { x: 0, y: 0, id: 0 } as MarcherPage,
                { x: 50, y: 50, id: 1 } as MarcherPage,
                { x: 100, y: 100, id: 2 } as MarcherPage,
            ];

            const distributedMarcherPages =
                marcherLine.distributeMarchers(marcherPages);

            expect(distributedMarcherPages.length).toBe(3);
            // Check if the marcherPages are evenly distributed along the x-axis
            for (let i = 0; i < distributedMarcherPages.length; i++) {
                expect(distributedMarcherPages[i].x).toBe(
                    expectedMarcherPages[i].x
                );
                expect(distributedMarcherPages[i].y).toBe(
                    expectedMarcherPages[i].y
                );
                expect(distributedMarcherPages[i].id).toBe(
                    expectedMarcherPages[i].id
                );
            }
        });
    });
});
