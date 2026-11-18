import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import {
    harnessQueryClient,
    positionOn,
    probed,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { createMarchers } from "@/db-functions/marcher";
import { createLastPage, getPages } from "@/db-functions/page";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import MarcherEditor from "../MarcherEditor";

/**
 * The inspector on the `base.tsx` fixtures (docs/timeline/phases/07-page-parity.md P7.18): the
 * marcher's coordinates come from the resolver, after an edit that writes only timeline rows.
 */

// Queries invalidate through the app's query client; use the harness's (see `featureHarness.tsx`)
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

describeDbTests("the marcher inspector", (it) => {
    it("shows the selected marcher where the app draws it on the selected page", async ({
        db,
        marchersAndPages,
    }) => {
        const id = marchersAndPages.expectedMarchers[4]!.id;
        const { page, result } = await setUpFeature(<MarcherEditor />, PAGE, [
            id,
        ]);
        // Move the marcher to where it stands on page 1
        const [x, y] = await positionOn(db, probed().pages[1]!, id);
        expect(await positionOn(db, page, id)).not.toEqual([x, y]);
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: id, x, y }],
        });

        const expected = ReadableCoords.fromMarcherPage({ x, y });
        await waitFor(() => {
            // Shown as plain text, the way coordinate sheets word it
            expect(result.getByTestId("inspector-marcher-x").textContent).toBe(
                expected.toVerboseStringX({ includeStepsString: true }),
            );
            expect(result.getByTestId("inspector-marcher-y").textContent).toBe(
                expected.toVerboseStringY({ includeStepsString: true }),
            );
        });
    });

    it("shows coordinates for a marcher and a page created after the conversion", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Neither has a position of its own yet; the inspector shows where the resolver puts it
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
            // Shown as plain text, the way coordinate sheets word it
            expect(result.getByTestId("inspector-marcher-x").textContent).toBe(
                want.toVerboseStringX({ includeStepsString: true }),
            );
            expect(result.getByTestId("inspector-marcher-y").textContent).toBe(
                want.toVerboseStringY({ includeStepsString: true }),
            );
        });
        expect(
            result.container.querySelector("p.text-red"),
            "no coordinate loading error",
        ).toBeNull();
    });
});
