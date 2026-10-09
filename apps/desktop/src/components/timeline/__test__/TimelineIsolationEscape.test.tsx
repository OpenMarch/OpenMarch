import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useIsolationEscape } from "../TimelineIsolationBar";

/**
 * UI-14 round-2 review: the isolation bar says "Done (Esc)", so one Esc leaves isolation however
 * it was entered, also with marchers selected. **From start** still turns off only on an Esc with
 * nothing selected (UI-11), since that Esc first deselects.
 */

const selection = vi.hoisted(() => ({ marchers: [] as { id: number }[] }));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: selection.marchers }),
}));

function Listener() {
    useIsolationEscape();
    return null;
}

afterEach(cleanup);
beforeEach(() => {
    selection.marchers = [];
    const store = useTimelineSelectionStore.getState();
    store.reset();
    store.setPageBoxes([{ start: 0, end: 8 }]);
    store.setStoredTimelines([
        { id: 7, name: "Move 1", start: 2, end: 5, marcherIds: new Set([1]) },
    ]);
});

const isolated = () => useTimelineSelectionStore.getState().isolation;

describe("Esc in isolation (UI-14 round-2 review)", () => {
    it("leaves in one press with nobody selected", () => {
        useTimelineSelectionStore.getState().isolate(7);
        render(<Listener />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(isolated()).toBeNull();
    });

    it("leaves in one press with marchers selected too", () => {
        selection.marchers = [{ id: 1 }, { id: 2 }];
        useTimelineSelectionStore.getState().isolate(7);
        render(<Listener />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(isolated()).toBeNull();
    });

    it("turns From start off only with nobody selected, one step per press", () => {
        const store = useTimelineSelectionStore.getState();
        store.isolate(7);
        store.setPlayFromStart(true);
        selection.marchers = [{ id: 1 }];
        render(<Listener />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(isolated()).toBeNull();
        expect(useTimelineSelectionStore.getState().playFromStart).toBe(true);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(useTimelineSelectionStore.getState().playFromStart).toBe(true);
    });
});
