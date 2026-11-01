// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scrollLeftForPage } from "../pageScroll";

describe("scrollLeftForPage", () => {
    it("centres a page that fits", () => {
        expect(
            scrollLeftForPage({
                pageLeft: 1000,
                pageWidth: 200,
                viewWidth: 600,
                scrollLeft: 0,
                keepIfVisible: false,
            }),
        ).toBe(800);
    });

    it("leaves a fully visible page alone when asked", () => {
        expect(
            scrollLeftForPage({
                pageLeft: 100,
                pageWidth: 200,
                viewWidth: 600,
                scrollLeft: 50,
                keepIfVisible: true,
            }),
        ).toBeNull();
    });

    it("still scrolls to a partly hidden page when keeping visible ones", () => {
        expect(
            scrollLeftForPage({
                pageLeft: 500,
                pageWidth: 200,
                viewWidth: 600,
                scrollLeft: 0,
                keepIfVisible: true,
            }),
        ).toBe(300);
    });

    it("shows the start edge of a page wider than the view", () => {
        expect(
            scrollLeftForPage({
                pageLeft: 2000,
                pageWidth: 3000,
                viewWidth: 600,
                scrollLeft: 0,
                keepIfVisible: false,
                margin: 48,
            }),
        ).toBe(1952);
    });

    it("never scrolls before the start", () => {
        expect(
            scrollLeftForPage({
                pageLeft: 10,
                pageWidth: 100,
                viewWidth: 600,
                scrollLeft: 300,
                keepIfVisible: false,
            }),
        ).toBe(0);
    });
});
