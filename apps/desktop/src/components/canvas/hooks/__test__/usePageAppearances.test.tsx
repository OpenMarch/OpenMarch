import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { usePageAppearances } from "../usePageAppearances";

/** Only `setAppearance` is used by the hook */
const fakeMarcher = () => ({ setAppearance: vi.fn() });

const setup = () => {
    const canvas = { requestRenderAll: vi.fn() };
    const canvasMarcher = fakeMarcher();
    const marchers = [{ id: 1 }];
    const marcherVisuals = {
        1: {
            getCanvasMarcher: () => canvasMarcher as unknown as CanvasMarcher,
        },
    };
    const pageAppearances = { 1: [{ fill_color: { r: 1, g: 2, b: 3, a: 1 } }] };
    return { canvas, canvasMarcher, marchers, marcherVisuals, pageAppearances };
};

describe("usePageAppearances", () => {
    it("skips a marcher whose appearance is what was last applied", () => {
        const {
            canvas,
            canvasMarcher,
            marchers,
            marcherVisuals,
            pageAppearances,
        } = setup();
        const { rerender } = renderHook(
            (appearances: typeof pageAppearances) =>
                usePageAppearances({
                    canvas,
                    marchers,
                    marcherVisuals,
                    marcherAppearances: appearances,
                    labelColor: undefined,
                    timelineMode: false,
                }),
            { initialProps: pageAppearances },
        );
        expect(canvasMarcher.setAppearance).toHaveBeenCalledTimes(1);
        // The next page's map, with the same appearance
        rerender({ 1: [...pageAppearances[1]] });
        expect(canvasMarcher.setAppearance).toHaveBeenCalledTimes(1);
        expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
    });

    it("styles every marcher again after timeline mode, which restyles them by beat", () => {
        const {
            canvas,
            canvasMarcher,
            marchers,
            marcherVisuals,
            pageAppearances,
        } = setup();
        const { rerender } = renderHook(
            ({
                timelineMode,
                appearances,
            }: {
                timelineMode: boolean;
                appearances: typeof pageAppearances | undefined;
            }) =>
                usePageAppearances({
                    canvas,
                    marchers,
                    marcherVisuals,
                    marcherAppearances: appearances,
                    labelColor: undefined,
                    timelineMode,
                }),
            {
                initialProps: {
                    timelineMode: false,
                    appearances: pageAppearances,
                },
            },
        );
        expect(canvasMarcher.setAppearance).toHaveBeenCalledTimes(1);
        // Timeline mode reads no page appearance; its steps restyle the same marchers
        rerender({ timelineMode: true, appearances: undefined });
        // Back to page mode on the same page: the marcher must get the page's look back
        rerender({ timelineMode: false, appearances: pageAppearances });
        expect(canvasMarcher.setAppearance).toHaveBeenCalledTimes(2);
    });
});
