import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type Page from "@/global/classes/Page";
import type { ShapePage } from "@/db-functions";
import { useRenderMarcherShapes } from "../shapes";

/**
 * P7.11: page shapes are drawn in page mode only. Turning timeline mode on clears them, even when
 * a page render is still awaiting its marchers; turning it off draws them again.
 */

const SHAPE_PAGES = [
    { id: 1, shape_id: 1, page_id: 1, svg_path: "M 0 0 L 1 1" },
] as unknown as ShapePage[];

vi.mock("@/hooks/queries", () => ({
    shapePagesQueryByPageIdOptions: (pageId: number | null) => ({
        queryKey: ["shapePages", pageId],
        queryFn: async () => SHAPE_PAGES,
        enabled: pageId != null,
    }),
    shapePageMarchersQueryByPageIdOptions: (pageId: number | null) => ({
        queryKey: ["spms", pageId],
        queryFn: async () => [],
        enabled: pageId != null,
    }),
}));

/** A canvas whose page render waits on `release` between shapes, as refreshMarchers does. */
const fakeCanvas = () => {
    let release: () => void = () => {};
    const state = { drawn: [] as ShapePage[] };
    const renderMarcherShapes = vi.fn(
        async ({
            shapePages,
            isCurrent = () => true,
        }: {
            shapePages: ShapePage[];
            isCurrent?: () => boolean;
        }) => {
            if (shapePages.length === 0) {
                state.drawn = [];
                return;
            }
            await new Promise<void>((resolve) => (release = resolve));
            if (!isCurrent()) return;
            state.drawn = shapePages;
        },
    );
    return {
        canvas: { renderMarcherShapes },
        state,
        release: () => release(),
    };
};

const PAGE = { id: 1 } as Page;

const mount = (
    canvas: ReturnType<typeof fakeCanvas>["canvas"],
    timelineMode: boolean,
) => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
        (props: { timelineMode: boolean }) =>
            useRenderMarcherShapes({
                canvas,
                selectedPage: PAGE,
                isPlaying: false,
                ...props,
            }),
        { wrapper, initialProps: { timelineMode } },
    );
};

describe("useRenderMarcherShapes", () => {
    it("page to timeline mode during a page render: the render stops and nothing stays drawn", async () => {
        const { canvas, state, release } = fakeCanvas();
        const { rerender } = mount(canvas, false);
        await waitFor(() =>
            expect(canvas.renderMarcherShapes).toHaveBeenCalledWith(
                expect.objectContaining({ shapePages: SHAPE_PAGES }),
            ),
        );
        rerender({ timelineMode: true });
        expect(canvas.renderMarcherShapes).toHaveBeenLastCalledWith({
            shapePages: [],
        });
        await act(async () => release());
        await waitFor(() => expect(state.drawn).toEqual([]));
        expect(state.drawn).toEqual([]);
    });

    it("timeline mode clears page shapes on entry, and page mode draws them again", async () => {
        const { canvas, state, release } = fakeCanvas();
        state.drawn = SHAPE_PAGES;
        const { rerender } = mount(canvas, true);
        expect(canvas.renderMarcherShapes).toHaveBeenCalledWith({
            shapePages: [],
        });
        expect(state.drawn).toEqual([]);
        rerender({ timelineMode: false });
        await waitFor(() =>
            expect(canvas.renderMarcherShapes).toHaveBeenLastCalledWith(
                expect.objectContaining({ shapePages: SHAPE_PAGES }),
            ),
        );
        await act(async () => release());
        await waitFor(() => expect(state.drawn).toEqual(SHAPE_PAGES));
    });
});
