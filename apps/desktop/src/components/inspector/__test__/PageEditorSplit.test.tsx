import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { splitPage } from "@/global/classes/Page";

/**
 * Split page can't cut a page of 1 count in two. The button is greyed out and the reason shows
 * under it, before anyone presses it, instead of a toast afterwards.
 */

// The switch and collapsible measure themselves; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
} as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
    beats: 4,
    playing: false,
    first: false,
}));
vi.mock("../InspectorPageContext", () => ({
    useInspectorPage: () => ({
        page: {
            id: 2,
            name: "2",
            beats: Array.from({ length: state.beats }, (_, i) => ({
                id: i + 1,
                index: i,
            })),
            counts: state.beats,
            previousPageId: state.first ? null : 1,
            nextPageId: null,
            isSubset: false,
            measures: [],
            measureBeatToStartOn: 1,
            measureBeatToEndOn: 0,
        },
        playing: state.playing,
    }),
}));
vi.mock("../PageEditorUtils", () => ({
    useSplitPage: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: [] }),
}));
vi.mock("../../../global/classes/Page", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    measureRangeString: () => "1",
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("sonner", async (importOriginal) => {
    const real = await importOriginal<typeof import("sonner")>();
    return {
        ...real,
        toast: Object.assign(toastSpy, {
            error: toastSpy,
            info: toastSpy,
            warning: toastSpy,
            success: toastSpy,
            message: toastSpy,
        }),
    };
});

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    state.beats = 4;
    state.playing = false;
    state.first = false;
});

const mount = async () => {
    const { default: PageEditor } = await import("../PageEditor");
    render(
        <QueryClientProvider client={new QueryClient()}>
            <PageEditor />
        </QueryClientProvider>,
    );
    return screen.queryByRole("button", { name: "Split page" })!;
};

describe("Split page in the page inspector", () => {
    it("is available on a page of 2 counts or more, with no reason shown", async () => {
        const button = await mount();
        expect((button as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByTestId("inspector-page-split-reason")).toBeNull();
        expect(button.getAttribute("aria-describedby")).toBeNull();
    });

    it("is greyed out on a page of 1 count, and says why", async () => {
        state.beats = 1;
        const button = await mount();
        expect((button as HTMLButtonElement).disabled).toBe(true);
        const reason = screen.getByTestId("inspector-page-split-reason");
        expect(reason.textContent).toBe(
            "A page needs at least 2 counts to split",
        );
        // Screen readers hear the reason with the button
        expect(button.getAttribute("aria-describedby")).toBe(reason.id);
    });

    it("isn't offered on the first page, the show's 0-count start", async () => {
        state.beats = 1;
        state.first = true;
        expect(await mount()).toBeNull();
        expect(screen.queryByTestId("inspector-page-split-reason")).toBeNull();
    });

    it("while playing, shows only the pause note, not the count reason", async () => {
        state.beats = 1;
        state.playing = true;
        await mount();
        expect(screen.queryByTestId("inspector-page-split-reason")).toBeNull();
        expect(screen.getByTestId("inspector-page-paused")).toBeTruthy();
    });
});

describe("splitPage", () => {
    it("refuses a page of 1 count quietly: the button already said why", () => {
        expect(
            splitPage({ beats: [{ id: 1 }] as never, nextPageId: null }),
        ).toBeUndefined();
        expect(toastSpy).not.toHaveBeenCalled();
    });
});
