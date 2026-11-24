import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createUsageTracker,
    installUsageEvents,
    MAX_REFUSALS,
    QUICK_UNDO_MS,
    REFUSAL_REPEAT_MS,
    forgetNewShow,
    rememberNewShow,
    reportMilestone,
    reportWindowLoaded,
    resetWindowLoadForTests,
    setShowOpen,
    reportPaletteSearchFoundNothing,
    sizeBucket,
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

describe("milestones", () => {
    let capture: ReturnType<typeof vi.fn>;
    let stop: () => void;
    beforeEach(() => {
        resetWindowLoadForTests();
        sessionStorage.clear();
        capture = vi.fn();
        stop = installUsageEvents(capture, () => true, {
            subscribeToActionRuns,
            subscribeToActionRefusals,
        });
    });
    afterEach(() => stop());

    it.each([
        [0, "0"],
        [Number.NaN, "0"],
        [1, "1-9"],
        [9, "1-9"],
        [10, "10-49"],
        [49, "10-49"],
        [50, "50-149"],
        [149, "50-149"],
        [150, "150-399"],
        [399, "150-399"],
        [400, "400+"],
    ])("sizeBucket(%d) is %s", (count, bucket) => {
        expect(sizeBucket(count)).toBe(bucket);
    });

    it("sends milestones only while usage events are installed", () => {
        reportMilestone("export finished", { kind: "video", audio: true });
        expect(capture).toHaveBeenCalledWith("export finished", {
            kind: "video",
            audio: true,
        });
        stop();
        reportMilestone("export finished", { kind: "video", audio: true });
        expect(capture).toHaveBeenCalledTimes(1);
    });

    it("drops marchers and music added with no show open (the new-show wizard's draft)", () => {
        reportMilestone("music imported", { kind: "musicxml" });
        reportMilestone("marchers added", { count: 4 });
        expect(capture).not.toHaveBeenCalled();
        setShowOpen(true);
        reportMilestone("marchers added", { count: 4 });
        expect(capture).toHaveBeenCalledWith("marchers added", { count: 4 });
    });

    it("reports an opened show once per window load", () => {
        reportWindowLoaded(true);
        reportWindowLoaded(true);
        expect(capture.mock.calls).toEqual([
            ["show opened", { new_show: false }],
        ]);
    });

    it("reports nothing for the launch page", () => {
        reportWindowLoaded(false);
        expect(capture).not.toHaveBeenCalled();
    });

    it("after the new-show wizard, sends what it made, then the opened show", () => {
        rememberNewShow({
            tempo: "xml",
            audio: "audio",
            marchers: 64,
            fromPreviousShow: false,
        });
        reportWindowLoaded(true);
        expect(capture.mock.calls).toEqual([
            [
                "show created",
                {
                    tempo: "xml",
                    audio: "audio",
                    marchers: "50-149",
                    from_previous_show: false,
                },
            ],
            ["marchers added", { count: 64, source: "new_show" }],
            ["music imported", { kind: "musicxml", source: "new_show" }],
            ["music imported", { kind: "audio", source: "new_show" }],
            ["show opened", { new_show: true }],
        ]);
        // Sent once: a later load doesn't send it again
        resetWindowLoadForTests();
        capture.mockClear();
        reportWindowLoaded(true);
        expect(capture.mock.calls).toEqual([
            ["show opened", { new_show: false }],
        ]);
    });

    it("sends only show created when the new show was saved but didn't open", () => {
        rememberNewShow({
            tempo: "skip",
            audio: "skip",
            marchers: 0,
            fromPreviousShow: true,
        });
        reportWindowLoaded(false);
        expect(capture.mock.calls).toEqual([
            [
                "show created",
                {
                    tempo: "skip",
                    audio: "skip",
                    marchers: "0",
                    from_previous_show: true,
                },
            ],
        ]);
    });

    it("sends nothing for a new show that failed to save", () => {
        rememberNewShow({
            tempo: "skip",
            audio: "skip",
            marchers: 3,
            fromPreviousShow: false,
        });
        forgetNewShow();
        reportWindowLoaded(false);
        expect(capture).not.toHaveBeenCalled();
    });
});
