import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { toast } from "sonner";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    mountFeature,
    probed,
    timelineSelection,
} from "@/test/featureHarness";
import { convertPagesToTimeline } from "@/test/convertPages";
import tolgee from "@/global/singletons/Tolgee";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useAddPageFlag } from "@/hooks/queries/usePageFlags";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { selectAddedPage } from "@/components/timeline/TimelineModePanel";
import { conToastError } from "@/utilities/utils";
import {
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";
import { pageFlags } from "../timelinePlayhead";

/**
 * **+** past the last flag (docs/timeline/research/basic-mode, "Basic's panel"; owner 2026-10-12)
 * on a converted `marchersAndPages` show (pages 1 to 6 of 8 counts, the last flag at beat 49 of
 * 97): in Basic as in Expert it adds a page ending at the playhead, never on the last flag, and
 * never adds beats or measures; Basic's **+** inside a page still splits the moves there. The
 * tests convert the show themselves, so they run in the default run as well as under
 * `test:timeline`.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

keepFixturesInPageMode("its tests convert the show themselves");

vi.mock("@/utilities/utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utilities/utils")>()),
    conToastError: vi.fn(),
}));

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => {
    vi.mocked(conToastError).mockReset();
    vi.spyOn(toast, "success").mockImplementation(() => "toast");
});
afterEach(() => {
    cleanup();
    stopTimelineResolver();
    vi.restoreAllMocks();
    useEditorModeStore.setState({ mode: null, loaded: false });
});

/** The panel's real **+** wiring, without the timeline's layout */
const panel: {
    plus: (() => void) | null;
    canPlus: boolean;
    beatCount: number;
} = { plus: null, canPlus: false, beatCount: 0 };

function PanelCommands() {
    const { beats, pages } = useTimingObjects();
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const plus = useAddPageFlag({
        pages,
        beatCount: beats.length,
        playheadBeat,
        isPlaying: false,
        onAdded: selectAddedPage,
    });
    panel.plus = plus.add;
    panel.canPlus = plus.insertion !== null;
    panel.beatCount = beats.length;
    return null;
}

/** Converts the show and mounts the panel's **+** in `mode` */
const setUp = async (db: DbConnection, mode: "basic" | "expert") => {
    await convertPagesToTimeline(db);
    act(() => {
        useEditorModeStore.setState({ mode, loaded: true });
    });
    mountFeature(<PanelCommands />);
    await waitFor(() => {
        expect(probed().pages.length).toBeGreaterThan(2);
        expect(useTimelineResolverStore.getState().status).toBe("ready");
    });
};

const lastFlag = () => pageFlags(probed().pages).at(-1)!.range!.end;

const seek = (beat: number) =>
    act(() => {
        useTimelineSelectionStore.getState().seek(beat);
    });

/** Clicks **+** and waits for the new page to be selected */
const plusSelects = async (range: { start: number; end: number }) => {
    await waitFor(() => expect(panel.canPlus).toBe(true));
    act(() => panel.plus!());
    await waitFor(() =>
        expect(timelineSelection().selection).toEqual({
            kind: "range",
            ...range,
        }),
    );
};

/** Every marcher's position at each of `beats`, from the resolver */
const positions = async (beats: number[]) => {
    await timelineResolverSettled();
    const resolver = useTimelineResolverStore.getState().resolver!;
    return resolver.marcherIds().map((id) =>
        beats.map((beat) =>
            // Splitting a move may round its last digit differently
            resolver.positionAt(id, beat).map((v) => Number(v.toFixed(6))),
        ),
    );
};

describeDbTests("+ past the last flag ends at the playhead", (it) => {
    for (const mode of ["basic", "expert"] as const)
        it(`${mode}: the page ends at the playhead, + isn't on the last flag, and the show isn't lengthened`, async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db, mode);
            expect(lastFlag()).toBe(49);
            expect(panel.beatCount).toBe(97);

            seek(52);
            await plusSelects({ start: 49, end: 52 });
            await waitFor(() => expect(lastFlag()).toBe(52));
            // The playhead is on the new flag: nothing to add there
            expect(panel.canPlus).toBe(false);

            // To the show's end, then nothing past it
            seek(97);
            await plusSelects({ start: 52, end: 97 });
            await waitFor(() => expect(lastFlag()).toBe(97));
            expect(panel.canPlus).toBe(false);
            expect(panel.beatCount).toBe(97);
            expect(toast.success).not.toHaveBeenCalled();
            expect(conToastError).not.toHaveBeenCalled();
        });

    it("basic: + inside a page still splits it at the playhead, with motion unchanged", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db, "basic");
        const beats = [41, 43, 45, 47, 49];
        const before = await positions(beats);
        const transitions = async () =>
            (await db.select().from(schema.timeline_transitions)).length;
        const transitionsBefore = await transitions();
        seek(45);
        await plusSelects({ start: 41, end: 45 });
        await waitFor(() =>
            expect(
                pageFlags(probed().pages).map((f) => f.range?.end),
            ).toContain(45),
        );
        expect(await positions(beats)).toEqual(before);
        // The moves crossing beat 45 were split there
        expect(await transitions()).toBeGreaterThan(transitionsBefore);
        expect(conToastError).not.toHaveBeenCalled();
    });
});
