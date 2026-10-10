import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { TolgeeProvider } from "@tolgee/react";
import type { Resolver, SpanInfo } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "../timelineStore";
import { useKeptAssignmentsStore } from "../useKeepLaterPages";
import { useTimelineKeptMarks } from "../useTimelineKeptMarks";

/**
 * UI-18 kept marchers on the field (wp20): the hook draws a mark for each marcher kept on the
 * current page, whatever is selected; follows keep, follow again and page changes; and clears the
 * marks while playing, while a scrub is down, while a move is isolated, in page mode and on
 * unmount.
 *
 * Pages: home (1, beat 0), page 2 (0, 8], page 3 (8, 16], page 4 (16, 24]. Marchers 1 and 8 move
 * on page 2 and have kept spots (assignments 100, 101) on page 3; marcher 2 moves on page 2 only.
 */

const beats = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => ({ index: from + i }));
const PAGES = [
    { id: 1, name: "1", beats: [] },
    { id: 2, name: "2", beats: beats(0, 8) },
    { id: 3, name: "3", beats: beats(8, 16) },
    { id: 4, name: "4", beats: beats(16, 24) },
] as never[];

const span = (
    marcherId: number,
    start: number,
    end: number,
    assignmentId: number | null,
) =>
    ({
        marcherId,
        start,
        end,
        kind: assignmentId === null ? "hold" : "founding",
        assignmentId,
        transitionId: null,
        slot: null,
    }) as SpanInfo;
const SPANS: Record<number, SpanInfo[]> = {
    1: [span(1, 0, 8, 1), span(1, 8, 16, 100), span(1, 16, Infinity, null)],
    2: [span(2, 0, 8, 2), span(2, 8, Infinity, null)],
    8: [span(8, 0, 8, 8), span(8, 8, 16, 101), span(8, 16, Infinity, null)],
};
const resolver = {
    marcherIds: () => [1, 2, 8],
    spanInfos: (id: number) => SPANS[id] ?? [],
} as unknown as Resolver;

const fakeCanvas = () =>
    ({
        renderTimelineKeptMarks: vi.fn(),
        clearTimelineKeptMarks: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        timelineKeptLayer: null,
    }) as unknown as OpenMarchCanvas & {
        renderTimelineKeptMarks: ReturnType<typeof vi.fn>;
        clearTimelineKeptMarks: ReturnType<typeof vi.fn>;
    };

const wrapper = ({ children }: { children: ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

const MARCHERS = [1, 2, 8];

const mount = (canvas: OpenMarchCanvas, pageId: number) =>
    renderHook(
        (props: { pageId: number; isPlaying: boolean; enabled: boolean }) =>
            useTimelineKeptMarks({
                canvas,
                pages: PAGES,
                marcherIds: MARCHERS,
                ...props,
            }),
        {
            wrapper,
            initialProps: { pageId, isPlaying: false, enabled: true },
        },
    );

const lastMarks = (canvas: ReturnType<typeof fakeCanvas>) =>
    (
        canvas.renderTimelineKeptMarks.mock.calls.at(-1)?.[0] as
            | { marcherId: number; text: string }[]
            | undefined
    )?.map((m) => m.marcherId);

describe("useTimelineKeptMarks", () => {
    // Loaded up front, so the provider renders the hook at once
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        useTimelineResolverStore.setState({ resolver: null, version: 0 });
        useKeptAssignmentsStore.setState({ ids: new Set() });
        useTimelineSelectionStore.getState().reset();
    });

    const start = () => {
        useTimelineResolverStore.setState({ resolver, version: 1 });
        useKeptAssignmentsStore.setState({ ids: new Set([100, 101]) });
        return fakeCanvas();
    };

    it("marks the marchers kept on the current page, with nothing selected", () => {
        const canvas = start();
        mount(canvas, 3);
        expect(lastMarks(canvas)).toEqual([1, 8]);
        const marks = canvas.renderTimelineKeptMarks.mock.calls.at(-1)![0];
        expect(marks[0].text).toBe("Kept on Page 3 · won't follow Page 2");
    });

    it("marks nobody on the pages around it", () => {
        const canvas = start();
        const hook = mount(canvas, 2);
        expect(canvas.renderTimelineKeptMarks).not.toHaveBeenCalled();
        expect(canvas.clearTimelineKeptMarks).toHaveBeenCalled();
        hook.rerender({ pageId: 3, isPlaying: false, enabled: true });
        expect(lastMarks(canvas)).toEqual([1, 8]);
        canvas.clearTimelineKeptMarks.mockClear();
        hook.rerender({ pageId: 4, isPlaying: false, enabled: true });
        expect(canvas.clearTimelineKeptMarks).toHaveBeenCalled();
    });

    it("follows keep, follow again and undo through the kept store", () => {
        const canvas = start();
        mount(canvas, 3);
        // follow again (or undo the keep) for marcher 8
        act(() => useKeptAssignmentsStore.setState({ ids: new Set([100]) }));
        expect(lastMarks(canvas)).toEqual([1]);
        canvas.clearTimelineKeptMarks.mockClear();
        act(() => useKeptAssignmentsStore.setState({ ids: new Set() }));
        expect(canvas.clearTimelineKeptMarks).toHaveBeenCalled();
        act(() => useKeptAssignmentsStore.setState({ ids: new Set([101]) }));
        expect(lastMarks(canvas)).toEqual([8]);
    });

    it("hides the marks while playing, scrubbing or isolating, and in page mode", () => {
        const canvas = start();
        const hook = mount(canvas, 3);
        const hidden = (change: () => void, restore: () => void) => {
            canvas.clearTimelineKeptMarks.mockClear();
            canvas.renderTimelineKeptMarks.mockClear();
            act(change);
            expect(canvas.clearTimelineKeptMarks).toHaveBeenCalled();
            act(restore);
            expect(lastMarks(canvas)).toEqual([1, 8]);
        };
        hidden(
            () => hook.rerender({ pageId: 3, isPlaying: true, enabled: true }),
            () => hook.rerender({ pageId: 3, isPlaying: false, enabled: true }),
        );
        hidden(
            () => useTimelineSelectionStore.setState({ scrubbing: true }),
            () => useTimelineSelectionStore.setState({ scrubbing: false }),
        );
        hidden(
            () =>
                useTimelineSelectionStore.setState({
                    isolation: { timelineId: 1 } as never,
                }),
            () => useTimelineSelectionStore.setState({ isolation: null }),
        );
        hidden(
            () =>
                hook.rerender({ pageId: 3, isPlaying: false, enabled: false }),
            () => hook.rerender({ pageId: 3, isPlaying: false, enabled: true }),
        );
    });

    it("clears the marks on unmount", () => {
        const canvas = start();
        const hook = mount(canvas, 3);
        canvas.clearTimelineKeptMarks.mockClear();
        hook.unmount();
        expect(canvas.clearTimelineKeptMarks).toHaveBeenCalled();
    });
});
