import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests, type DbConnection } from "@/test/base";
import {
    harnessQueryClient,
    mountFeature,
    probed,
    selectPageAndMarchers,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import MarcherEditor from "../MarcherEditor";

/**
 * The marcher section while timeline playback runs (UI-19 review): it keeps its place and its
 * collapsed state, and shows a note instead of the selected marchers' values and controls. The
 * selected page stays where playback started, so its values would
 * be stale and its edits would land there.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;
// Rotation needs the field canvas, which this test doesn't mount
vi.mock("../marcher/MarcherRotationInput", () => ({ default: () => null }));

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
});

const playing: { set: ((on: boolean) => void) | null } = { set: null };
function PlayingProbe() {
    playing.set = useIsPlaying()!.setIsPlaying;
    return null;
}
const setPlaying = (on: boolean) =>
    act(() => {
        playing.set!(on);
    });

describeDbTests("the marcher section while timeline playback runs", (it) => {
    const mount = async (_db: DbConnection, marcherIds: number[]) => {
        const { qc, result } = mountFeature(
            <>
                <MarcherEditor />
                <PlayingProbe />
            </>,
        );
        await waitFor(() => {
            expect(probed().pages.length).toBeGreaterThan(5);
            expect(probed().marchers?.length).toBeGreaterThan(0);
        });
        await selectPageAndMarchers(probed().pages[3]!, marcherIds);
        return { qc, result };
    };
    const trigger = (result: { container: HTMLElement }) =>
        result.container.querySelector<HTMLElement>(
            "[data-state] > button, button[aria-expanded]",
        )!;

    it("shows a note in place of the values and controls", async ({
        db,
        marchersAndPages,
    }) => {
        const ids = marchersAndPages.expectedMarchers
            .slice(0, 2)
            .map((m) => m.id);
        const { result } = await mount(db, ids);
        await waitFor(() => expect(result.getByText(/^Swap/)).toBeTruthy());

        setPlaying(true);
        expect(
            result.getByTestId("inspector-marcher-playing").textContent,
        ).toBe("Playing. Pause to see and edit the selected marchers.");
        expect(result.queryByText(/^Swap/)).toBeNull();
        expect(result.container.querySelectorAll("input")).toHaveLength(0);
        expect(result.container.querySelectorAll("button")).toHaveLength(1);

        setPlaying(false);
        await waitFor(() =>
            expect(
                result.queryByTestId("inspector-marcher-playing"),
            ).toBeNull(),
        );
        await waitFor(() => expect(result.getByText(/^Swap/)).toBeTruthy());
    });

    it("keeps the section collapsed through a play and stop, and a page change", async ({
        db,
        marchersAndPages,
    }) => {
        const id = marchersAndPages.expectedMarchers[0]!.id;
        const { result } = await mount(db, [id]);
        await waitFor(() =>
            expect(
                result.container.querySelectorAll('input[type="number"]')
                    .length,
            ).toBeGreaterThan(0),
        );
        const button = trigger(result);
        expect(button.getAttribute("aria-expanded")).toBe("true");
        fireEvent.click(button);
        expect(trigger(result).getAttribute("aria-expanded")).toBe("false");

        setPlaying(true);
        expect(trigger(result).getAttribute("aria-expanded")).toBe("false");
        setPlaying(false);
        await waitFor(() =>
            expect(
                result.queryByTestId("inspector-marcher-playing"),
            ).toBeNull(),
        );
        expect(trigger(result).getAttribute("aria-expanded")).toBe("false");

        // A page change keeps the section collapsed too
        act(() => {
            probed().setSelectedPage(probed().pages[6]!);
        });
        expect(result.queryByText("Loading marcher")).toBeNull();
        await waitFor(() => expect(probed().loaded).toBe(true));
        expect(trigger(result).getAttribute("aria-expanded")).toBe("false");
    });
});
