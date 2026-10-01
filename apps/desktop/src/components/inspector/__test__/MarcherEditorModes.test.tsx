import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    positionOn,
    probed,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { createMarchers } from "@/db-functions/marcher";
import { createLastPage, getPages } from "@/db-functions/page";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import MarcherEditor from "../MarcherEditor";
import { TimelineInspectorSection } from "../TimelineInspectorSection";

/**
 * The inspector on the `base.tsx` fixtures (docs/timeline/phases/07-page-parity.md P7.18): the
 * marcher's coordinates and the timeline section follow the file's mode. In page mode they come
 * from `marcher_pages`; under `test:timeline` (a converted show with the flag on) from the
 * resolver, after an edit that writes only timeline rows, and the timeline section explains the
 * marcher's position.
 */

// Page-mode queries invalidate through the app's query client; use the harness's (see
// `featureHarness.tsx`)
const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
});

const PAGE = 3;

describeDbTests("the marcher inspector in the file's mode", (it) => {
    it("shows the selected marcher where the app draws it on the selected page", async ({
        db,
        marchersAndPages,
    }) => {
        const id = marchersAndPages.expectedMarchers[4]!.id;
        const { qc, page, result } = await setUpFeature(
            <>
                <MarcherEditor />
                <TimelineInspectorSection />
            </>,
            PAGE,
            [id],
        );
        // Move the marcher to where it stands on page 1, through the mode's own write
        const [x, y] = await positionOn(db, probed().pages[1]!, id);
        expect(await positionOn(db, page, id)).not.toEqual([x, y]);
        if (timelineFixtureMode())
            await moveMarchersOnPage({
                db,
                page,
                moves: [{ marcherId: id, x, y }],
            });
        else {
            await updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: id, page_id: page.id, x, y },
                ],
            });
            await act(() => qc.invalidateQueries());
        }

        const expected = ReadableCoords.fromMarcherPage({ x, y });
        await waitFor(() => {
            const [xSteps, ySteps] = [
                ...result.container.querySelectorAll<HTMLInputElement>(
                    'input[type="number"]',
                ),
            ].map((input) => Number(input.value));
            expect(xSteps).toBeCloseTo(expected.xSteps, 6);
            expect(ySteps).toBeCloseTo(expected.ySteps, 6);
        });

        // The timeline section explains the position in timeline mode only
        if (timelineFixtureMode())
            await waitFor(() =>
                expect(result.queryAllByText(/ at beat /).length).toBe(1),
            );
        else expect(result.queryAllByText(/ at beat /)).toEqual([]);
    });

    it("shows coordinates for a marcher and a page created after the conversion", async ({
        db,
        marchersAndPages: _,
    }) => {
        // In timeline mode neither gets marcher pages (P9.5); the inspector must not need them
        const [created] = await createMarchers({
            db,
            newMarchers: [
                { section: "Flute", drill_prefix: "N", drill_order: 1 },
            ],
        });
        await createLastPage({ db, newPageCounts: 4, createNewBeats: true });
        const lastIndex = (await getPages({ db })).length - 1;
        const { page, result } = await setUpFeature(
            <MarcherEditor />,
            lastIndex,
            [created!.id],
        );

        const [x, y] = await positionOn(db, page, created!.id);
        const want = ReadableCoords.fromMarcherPage({ x, y });
        await waitFor(() => {
            const [xSteps, ySteps] = [
                ...result.container.querySelectorAll<HTMLInputElement>(
                    'input[type="number"]',
                ),
            ].map((input) => Number(input.value));
            expect(xSteps).toBeCloseTo(want.xSteps, 6);
            expect(ySteps).toBeCloseTo(want.ySteps, 6);
        });
        expect(
            result.container.querySelector("p.text-red"),
            "no coordinate loading error",
        ).toBeNull();
    });
});
