import { cleanup, render, screen } from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import type { Resolver } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { TimelineFromStartBadge } from "../TimelineIsolationBar";

/**
 * #805: the line over the field says how many of the selection are Held at the playhead when only
 * some are ("Editing Page 3's move · 1 of 2 Held"), since a drag edits each marcher by its kind.
 */

/** A page whose beats run from `first` to `last` (`pageEndBeat` is `last + 1`). */
const page = (id: number, name: string, first: number, last: number) => ({
    id,
    name,
    beats: Array.from({ length: last - first + 1 }, (_, i) => ({
        index: first + i,
    })),
});
// Flags: page 1 at 0 (home), page 2 at 9, page 3 at 17, page 4 at 25
const PAGES = [
    page(1, "1", 0, 0),
    page(2, "2", 1, 8),
    page(3, "3", 9, 16),
    page(4, "4", 17, 24),
];

const mocks = vi.hoisted(() => ({
    pages: [] as unknown[],
    marchers: [] as { id: number }[],
}));
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({ pages: mocks.pages }),
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: mocks.marchers }),
}));

const resolver = {
    marcherIds: () => [1, 2],
    spanInfos: () => [],
} as unknown as Resolver;

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    useEditorModeStore.setState({ mode: null });
});
beforeEach(() => {
    mocks.pages = PAGES;
    useEditorModeStore.setState({ mode: "expert" });
    useTimelineResolverStore.setState({ resolver, version: 1 });
    const store = useTimelineSelectionStore.getState();
    store.reset();
    store.setPageBoxes([
        { start: 1, end: 9 },
        { start: 9, end: 17 },
        { start: 17, end: 25 },
    ]);
    // Marcher 1 Held from page 2's flag through page 4
    useHeldMarksStore.setState({
        marks: [{ id: 1, marcherId: 1, start: 9, end: 25 }],
    });
    // Page 3's move
    useTimelineSelectionStore.setState({
        selection: { kind: "range", start: 9, end: 17 },
    });
});

const show = (ids: number[]) => {
    mocks.marchers = ids.map((id) => ({ id }));
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TimelineFromStartBadge />
        </TolgeeProvider>,
    );
};
const held = () => screen.queryByTestId("timeline-window-held");
const line = () => screen.getByTestId("timeline-window-line");

describe("the field's editing line, how many are Held (#805)", () => {
    it("adds · 1 of 2 Held after what a drag edits, and stands out", () => {
        show([1, 2]);
        expect(held()?.textContent).toBe("· 1 of 2 Held");
        expect(line().textContent).toMatch(/^Editing .*· 1 of 2 Held$/);
        expect(line().dataset.prominent).toBe("true");
    });

    it("says nothing about holds when all or none of the selection is Held", () => {
        show([1]);
        expect(held()).toBeNull();
        expect(line().dataset.prominent).toBeUndefined();
        cleanup();
        show([2]);
        expect(held()).toBeNull();
    });
});
