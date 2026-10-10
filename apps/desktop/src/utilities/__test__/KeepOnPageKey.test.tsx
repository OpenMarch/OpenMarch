import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import { harnessQueryClient, setUpFeature } from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { toggleKeepOnPage } from "@/timeline/timelineKeepCommands";
import { EditorActionHandlers } from "@/shortcuts/ActionHandlers";
import ShortcutDispatcher from "@/shortcuts/ShortcutDispatcher";
import { getActionDefinition } from "@/shortcuts/definitions";
import { findConflicts } from "@/shortcuts/keymap";

/**
 * **K** (UI-18 keep later pages): in timeline mode, keeps the selected marchers on the page after
 * the current one, or lets them follow again there (`toggleKeepOnPage`, tested on a database
 * in `timelineKeepCommands.test.ts`). Page mode has no K; typing in a field never presses it.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

vi.mock("@/timeline/timelineKeepCommands", () => ({
    toggleKeepOnPage: vi.fn(() => Promise.resolve(null)),
    keepOnPage: vi.fn(),
    followAgainOn: vi.fn(),
}));

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
    vi.mocked(toggleKeepOnPage).mockClear();
});

const press = (target: EventTarget = window, repeat = false) =>
    act(() => {
        target.dispatchEvent(
            new KeyboardEvent("keydown", {
                code: "KeyK",
                key: "k",
                bubbles: true,
                repeat,
            }),
        );
    });

describe("the K shortcut", () => {
    it("says what it does in its description", () => {
        expect(tolgee.t(getActionDefinition("toggleKeepOnPage").labelKey)).toBe(
            "Keep the selected marchers where they hold on this page (on the next page if they move here), or let them follow again",
        );
    });

    it("is K alone, and no other action uses it", () => {
        expect(getActionDefinition("toggleKeepOnPage").defaultBindings).toEqual(
            ["K"],
        );
        for (const isMac of [false, true])
            expect(
                findConflicts({}, undefined, isMac).filter((c) =>
                    c.actionIds.includes("toggleKeepOnPage"),
                ),
            ).toEqual([]);
    });
});

describeDbTests(
    "K toggles keep from the current page (timeline mode only)",
    (it) => {
        it("passes the current page and the selection, never from a field", async ({
            db: _,
            marchersAndPages,
        }) => {
            const ids = marchersAndPages.expectedMarchers
                .slice(0, 2)
                .map((m) => m.id);
            const { page } = await setUpFeature(
                <>
                    <ShortcutDispatcher />
                    <EditorActionHandlers />
                </>,
                2,
                ids,
            );
            press();
            if (timelineFixtureMode()) {
                await waitFor(() =>
                    expect(toggleKeepOnPage).toHaveBeenCalledTimes(1),
                );
                expect(vi.mocked(toggleKeepOnPage).mock.calls[0]![0]).toEqual(
                    expect.objectContaining({
                        currentPageId: page.id,
                        marcherIds: ids,
                    }),
                );
                // Holding K repeats the key; it toggles once (pre-merge review U6)
                press(window, true);
                press(window, true);
                await new Promise((r) => setTimeout(r, 100));
                expect(toggleKeepOnPage).toHaveBeenCalledTimes(1);
            } else {
                await new Promise((r) => setTimeout(r, 100));
                expect(toggleKeepOnPage).not.toHaveBeenCalled();
            }
            vi.mocked(toggleKeepOnPage).mockClear();
            // Typing a K in a field is typing
            const input = document.createElement("input");
            document.body.appendChild(input);
            input.focus();
            press(input);
            await new Promise((r) => setTimeout(r, 100));
            expect(toggleKeepOnPage).not.toHaveBeenCalled();
            input.remove();
        });
    },
);
