import { describe, it, expect } from "vitest";
import MarcherPage from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import MarcherLine from "../MarcherLine";

describe("MarcherLine", () => {
    describe("distributeMarchers", () => {
        it("should evenly distribute marcherPages along the line", () => {
            const marcherLine = new MarcherLine({
                x1: 0,
                y1: 0,
                x2: 100,
                y2: 100,
                startPageId: 0,
                endPageId: 2,
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

    describe("getMarcherLinesForPage", () => {
        const mockMarcherLines = [
            new MarcherLine({
                x1: 1,
                y1: 1,
                x2: 1,
                y2: 1,
                startPageId: 0,
                endPageId: 4,
            }),
            // This page should never be returned as the startPage comes after the endPage
            new MarcherLine({
                x1: 2,
                y1: 2,
                x2: 2,
                y2: 2,
                startPageId: 2, // order 2
                endPageId: 4, // order 1
            }),
            new MarcherLine({
                x1: 3,
                y1: 3,
                x2: 3,
                y2: 3,
                startPageId: 4,
                endPageId: 2,
            }),
            new MarcherLine({
                x1: 4,
                y1: 4,
                x2: 4,
                y2: 4,
                startPageId: 0,
                endPageId: 2,
            }),
        ];
        // Switch the IDs and orders of the page to ensure id isn't what determines the order
        const mockPages = [
            { id: 0, order: 0 },
            { id: 4, order: 1 },
            { id: 2, order: 2 },
        ] as Page[];
        it("should return all marcherLines for the first page id", () => {
            const marcherLinesForPage = MarcherLine.getMarcherLinesForPage({
                marcherLines: mockMarcherLines,
                page: mockPages[0],
                allPages: mockPages,
            });

            expect(marcherLinesForPage.length).toBe(2);
            expect(marcherLinesForPage[0].x1).toBe(1);
            expect(marcherLinesForPage[1].x1).toBe(4);
        });

        it("should return all marcherLines for the second page id", () => {
            const marcherLinesForPage = MarcherLine.getMarcherLinesForPage({
                marcherLines: mockMarcherLines,
                page: mockPages[1],
                allPages: mockPages,
            });

            expect(marcherLinesForPage.length).toBe(3);
            expect(marcherLinesForPage[0].x1).toBe(1);
            expect(marcherLinesForPage[1].x1).toBe(3);
            expect(marcherLinesForPage[2].x1).toBe(4);
        });

        it("should return all marcherLines for the third page id", () => {
            const marcherLinesForPage = MarcherLine.getMarcherLinesForPage({
                marcherLines: mockMarcherLines,
                page: mockPages[2],
                allPages: mockPages,
            });

            expect(marcherLinesForPage.length).toBe(2);
            expect(marcherLinesForPage[0].x1).toBe(3);
            expect(marcherLinesForPage[1].x1).toBe(4);
        });
    });
});
