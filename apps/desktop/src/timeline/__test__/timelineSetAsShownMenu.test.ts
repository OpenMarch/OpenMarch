import { describe, expect, it, vi } from "vitest";
import type { PageKeepState } from "../timelineKeepLater";
import { setAsShownMenu } from "../timelineSetAsShown";

/**
 * The page box menu's **Set as shown** entry (holds, fork #466): offered for the selected
 * marchers Not set on the page, with a reason when none is, and hidden with nothing selected.
 */

const state = (pageId: number, follows: number[]): PageKeepState => ({
    pageId,
    pageName: String(pageId),
    box: { start: pageId * 8 + 1, end: pageId * 8 + 9 },
    follows,
    fromStart: [],
    from: [],
    midMove: [],
    selected: 3,
});

describe("setAsShownMenu", () => {
    it("runs for exactly the selected marchers Not set on the page", () => {
        const run = vi.fn();
        const menu = setAsShownMenu([state(3, [1, 2]), state(4, [])], run);
        expect(menu.reasonFor(3)).toBeNull();
        expect(menu.reasonFor("3")).toBeNull();
        menu.onSet(3);
        expect(run).toHaveBeenCalledExactlyOnceWith(
            { start: 25, end: 33 },
            [1, 2],
        );
    });

    it("says why when no selected marcher is Not set there, and does nothing", () => {
        const run = vi.fn();
        const menu = setAsShownMenu([state(4, [])], run);
        expect(menu.reasonFor(4)).toContain("Page 4");
        menu.onSet(4);
        expect(run).not.toHaveBeenCalled();
    });

    it("leaves Held marchers alone, and is checked where every selected marcher is Defined", () => {
        const run = vi.fn();
        const mark = { id: 1, marcherId: 1, start: 25, end: 33 };
        const menu = setAsShownMenu([state(3, [1, 2])], run, [mark]);
        expect(menu.entryOn?.(3)).toEqual({
            checked: false,
            changes: 1,
            selected: 3,
        });
        menu.onSet(3);
        expect(run).toHaveBeenCalledExactlyOnceWith(
            { start: 25, end: 33 },
            [2],
        );
        expect(setAsShownMenu([state(4, [])], vi.fn()).entryOn?.(4)).toEqual({
            checked: true,
            changes: 0,
            selected: 3,
        });
    });

    it("sets marchers that haven't moved yet too", () => {
        const run = vi.fn();
        const notMoved = { ...state(3, [1, 4]), fromStart: [4] };
        setAsShownMenu([notMoved], run).onSet(3);
        expect(run).toHaveBeenLastCalledWith(notMoved.box, [1, 4]);
    });

    it("hides the entry when nothing is selected (no states)", () => {
        const menu = setAsShownMenu([], vi.fn());
        expect(menu.reasonFor(3)).toBeUndefined();
    });
});
