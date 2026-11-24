import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createUsageTracker,
    installUsageEvents,
    MAX_REFUSALS,
    QUICK_UNDO_MS,
    REFUSAL_REPEAT_MS,
    reportPaletteSearchFoundNothing,
    usageTracker,
    wordsOf,
} from "../usageEvents";
import {
    registerActionHandler,
    reportRefusedAction,
    runAction,
    pressAction,
    subscribeToActionRefusals,
    subscribeToActionRuns,
} from "@/shortcuts/registry";

function setup() {
    let time = 1_000_000;
    const capture = vi.fn();
    const tracker = createUsageTracker(capture, () => time);
    return {
        capture,
        tracker,
        advance: (ms: number) => {
            time += ms;
        },
    };
}

describe("createUsageTracker", () => {
    it("sends one summary of the window's actions, then starts over", () => {
        const { capture, tracker, advance } = setup();
        tracker.actionRan("createPageAtPlayhead", "key");
        tracker.actionRan("createPageAtPlayhead", "button");
        tracker.actionRan("splitPage", "palette");
        advance(90_000);
        tracker.flush();
        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture).toHaveBeenCalledWith(
            "actions used",
            {
                actions: { createPageAtPlayhead: 2, splitPage: 1 },
                actions_by_key: { createPageAtPlayhead: 1 },
                sources: { key: 1, button: 1, palette: 1 },
                undone_quickly: {},
                total_actions: 3,
                window_seconds: 90,
            },
            { sendNow: false },
        );

        tracker.flush();
        expect(capture).toHaveBeenCalledTimes(1);
    });

    it("counts an undo right after an action as undoing that action", () => {
        const { capture, tracker, advance } = setup();
        tracker.actionRan("splitPage", "button");
        advance(QUICK_UNDO_MS - 1);
        tracker.actionRan("performUndo", "key");
        tracker.actionRan("swapMarchers", "key");
        advance(QUICK_UNDO_MS + 1);
        tracker.actionRan("performUndo", "key");
        // A second undo in a row undoes nothing new
        tracker.actionRan("performUndo", "key");
        tracker.flush();
        expect(capture.mock.calls[0][1].undone_quickly).toEqual({
            splitPage: 1,
        });
    });

    it("puts a quick undo on the last edit, not on views or playback in between", () => {
        let time = 0;
        const capture = vi.fn();
        const tracker = createUsageTracker(
            capture,
            () => time,
            (id) => id === "alignHorizontally",
        );
        tracker.actionRan("alignHorizontally", "button");
        tracker.actionRan("openCommandPalette", "key");
        tracker.actionRan("playPause", "key");
        time += 1_000;
        tracker.actionRan("performUndo", "palette");
        tracker.flush();
        expect(capture.mock.calls[0][1].undone_quickly).toEqual({
            alignHorizontally: 1,
        });
    });

    it("sends each refusal with its reason, but not the same one again right away", () => {
        const { capture, tracker, advance } = setup();
        tracker.actionRefused("swapMarchers", "key", " Select two marchers ");
        tracker.actionRefused("swapMarchers", "key", "Select two marchers");
        tracker.actionRefused("swapMarchers", "button", "Select two marchers");
        advance(REFUSAL_REPEAT_MS);
        tracker.actionRefused("swapMarchers", "key", "Select two marchers");
        expect(capture.mock.calls).toEqual([
            [
                "action refused",
                {
                    action: "swapMarchers",
                    source: "key",
                    reason: "Select two marchers",
                },
            ],
            [
                "action refused",
                {
                    action: "swapMarchers",
                    source: "button",
                    reason: "Select two marchers",
                },
            ],
            [
                "action refused",
                {
                    action: "swapMarchers",
                    source: "key",
                    reason: "Select two marchers",
                },
            ],
        ]);
    });

    it("caps refusals per window load", () => {
        const { capture, tracker } = setup();
        for (let i = 0; i < MAX_REFUSALS + 20; i++)
            tracker.actionRefused(`action${i}`, "key", "why");
        expect(capture).toHaveBeenCalledTimes(MAX_REFUSALS);
    });

    it("sends each empty palette search once, keeping only the app's own words", () => {
        const capture = vi.fn();
        const known = new Set(["rotate", "block", "mirror"]);
        const tracker = createUsageTracker(
            capture,
            () => 0,
            () => true,
            (word) => known.has(word),
        );
        tracker.paletteSearchFoundNothing("  Rotate Block 3 ");
        tracker.paletteSearchFoundNothing("rotate block 4");
        tracker.paletteSearchFoundNothing("Mirror Jake Smith");
        tracker.paletteSearchFoundNothing("x");
        expect(capture.mock.calls).toEqual([
            ["palette search found nothing", { query: "rotate block *" }],
            ["palette search found nothing", { query: "mirror * *" }],
        ]);
    });

    it("finds the words of a translation file", () => {
        expect(
            wordsOf({ a: "Rotate the block", b: { c: "Fan out: 8 × 4" } }),
        ).toEqual(new Set(["rotate", "the", "block", "fan", "out"]));
    });
});

describe("installUsageEvents", () => {
    afterEach(() => vi.useRealTimers());

    it("counts runs from the registry with how they started, and sends on hide and stop", () => {
        vi.useFakeTimers();
        const capture = vi.fn();
        const stop = installUsageEvents(capture, () => true, {
            subscribeToActionRuns,
            subscribeToActionRefusals,
        });
        const unregister = registerActionHandler("swapMarchers", {
            run: () => {},
            isEnabled: () => true,
        });
        runAction("swapMarchers", undefined, "button");
        runAction("swapMarchers", undefined, "palette");
        pressAction("swapMarchers");
        reportRefusedAction(
            "splitPage",
            "key",
            "Put the playhead inside a page",
        );
        reportPaletteSearchFoundNothing("fan out");
        expect(usageTracker()).not.toBeNull();

        window.dispatchEvent(new Event("pagehide"));
        const summary = capture.mock.calls.find(
            ([event]) => event === "actions used",
        );
        expect(summary?.[2]).toEqual({ sendNow: false });
        expect(summary?.[1]).toMatchObject({
            actions: { swapMarchers: 3 },
            actions_by_key: { swapMarchers: 1 },
            sources: { button: 1, palette: 1, key: 1 },
        });
        expect(capture).toHaveBeenCalledWith("action refused", {
            action: "splitPage",
            source: "key",
            reason: "Put the playhead inside a page",
        });
        expect(capture).toHaveBeenCalledWith("palette search found nothing", {
            query: "* *",
        });

        runAction("swapMarchers");
        stop();
        expect(capture).toHaveBeenLastCalledWith(
            "actions used",
            expect.objectContaining({ sources: { other: 1 } }),
            { sendNow: false },
        );
        expect(usageTracker()).toBeNull();
        unregister();
    });
});
