import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { deletePages } from "@/db-functions/page";
import { readPageGrid } from "@/db-functions/timelineRipple";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { toastMoveDeleted } from "@/components/timeline/useTimelineCommands";
import {
    tagAppearanceByPageIdMapQueryOptions,
    tagAppearancesByStartPageIdQueryOptions,
} from "../tags/queries";
import {
    deletePageYankMutationOptions,
    deletePagesMutationOptions,
} from "../usePages";
import {
    deletePageFlagsMutationOptions,
    deletePageYankWithMovesMutationOptions,
    deletePagesWithMovesMutationOptions,
} from "../usePageFlags";
import { usePerformHistoryAction } from "../useHistory";

/**
 * Coverage gaps 8 and 9 of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7), through the app's mutation
 * options and query cache:
 *
 * - gap 9 (B-13): after every page delete, the tag queries the UI reads are fetched again, so a
 *   deleted page's tag appearance shows on the next page without a reload;
 * - gap 8 (B-10): the delete-with-moves toast closes on the next history change, as Delete move's
 *   does, since its **Undo** is the app's normal undo and would then take back that later edit.
 *
 * The show is `marchersAndPages`: page 0 plus pages 1 to 6 (ids 1 to 6), 8 counts each.
 */

keepFixturesInPageMode("its tests pick the file's mode themselves");

// Modules these import invalidate through the app's query client; give them the test's
const app = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client;
    },
}));

afterEach(() => vi.restoreAllMocks());

const newClient = () => {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    app.client = qc;
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return { qc, wrapper };
};

const toTimelineMode = async (db: DbConnection) => {
    await setTimelineModeFlag(db, true);
    await convertPagesToTimeline(db);
};

/** Tag 1's appearance starts on page 2 */
const tagOnPage2 = async (db: DbConnection) => {
    await db.insert(schema.tags).values([{ id: 1, name: "t" }]);
    await db
        .insert(schema.tag_appearances)
        .values([{ id: 1, tag_id: 1, start_page_id: 2, fill_color: "c1" }]);
};

type DeletePath = {
    name: string;
    timeline: boolean;
    useDelete: (qc: QueryClient) => () => Promise<unknown>;
};

const paths: DeletePath[] = [
    {
        name: "page mode Delete (deletePages)",
        timeline: false,
        useDelete: (qc) => {
            const { mutateAsync } = useMutation(deletePagesMutationOptions(qc));
            return () => mutateAsync(new Set([2]));
        },
    },
    {
        name: "page mode Yank",
        timeline: false,
        useDelete: (qc) => {
            const { mutateAsync } = useMutation(
                deletePageYankMutationOptions(qc),
            );
            return () => mutateAsync(2);
        },
    },
    {
        name: "timeline Delete page (the flag delete)",
        timeline: true,
        useDelete: (qc) => {
            const { mutateAsync } = useMutation(
                deletePageFlagsMutationOptions(qc),
            );
            return () => mutateAsync(new Set([2]));
        },
    },
    {
        name: "timeline Delete page and its moves",
        timeline: true,
        useDelete: (qc) => {
            const { mutateAsync } = useMutation(
                deletePagesWithMovesMutationOptions(qc),
            );
            return () => mutateAsync(new Set([2]));
        },
    },
    {
        name: "timeline Yank with its moves",
        timeline: true,
        useDelete: (qc) => {
            const { mutateAsync } = useMutation(
                deletePageYankWithMovesMutationOptions(qc),
            );
            return () => mutateAsync(2);
        },
    },
];

describeDbTests(
    "gap 9: tag appearances refresh in the query cache after a page delete",
    (it) => {
        for (const path of paths)
            it(`${path.name}: page 3's tag appearances and the page map are fetched again`, async ({
                db,
                marchersAndPages: _,
            }) => {
                if (path.timeline) await toTimelineMode(db);
                await tagOnPage2(db);
                vi.spyOn(toast, "success").mockImplementation(() => 0);
                const { wrapper } = newClient();
                const { result } = renderHook(
                    () => {
                        const qc = useQueryClient();
                        return {
                            onPage3: useQuery(
                                tagAppearancesByStartPageIdQueryOptions(3),
                            ),
                            map: useQuery(
                                tagAppearanceByPageIdMapQueryOptions(),
                            ),
                            remove: path.useDelete(qc),
                        };
                    },
                    { wrapper },
                );
                await waitFor(() => {
                    expect(result.current.onPage3.data).toEqual([]);
                    expect(result.current.map.data?.get(2)).toEqual(
                        new Set([1]),
                    );
                });

                await act(async () => {
                    await result.current.remove();
                });

                await waitFor(() => {
                    expect(
                        result.current.onPage3.data?.map((a) => [
                            a.id,
                            a.tag_id,
                            a.start_page_id,
                        ]),
                    ).toEqual([[1, 1, 3]]);
                    expect(result.current.map.data?.has(2)).toBe(false);
                    expect(result.current.map.data?.get(3)).toEqual(
                        new Set([1]),
                    );
                });
            });

        it("control: without the mutation's invalidation, the cached tag appearances stay stale", async ({
            db,
            marchersAndPages: _,
        }) => {
            await tagOnPage2(db);
            const { wrapper } = newClient();
            const { result } = renderHook(
                () => useQuery(tagAppearancesByStartPageIdQueryOptions(3)),
                { wrapper },
            );
            await waitFor(() => expect(result.current.data).toEqual([]));
            await deletePages({ db, pageIds: new Set([2]) });
            // The row moved, but nothing told the cache
            expect(
                (await db.select().from(schema.tag_appearances).all()).map(
                    (r) => r.start_page_id,
                ),
            ).toEqual([3]);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(result.current.data).toEqual([]);
        });
    },
);

describeDbTests("gap 8: the delete toast's Undo after a later edit", (it) => {
    /** Marchers A and B move on page 2 in a show made in timeline mode */
    const S4 = async (db: DbConnection) => {
        await toTimelineMode(db);
        for (const table of [
            "timeline_slot_destinations",
            "timeline_assignments",
            "timeline_transitions",
            "timeline_shapes",
            "timelines",
        ])
            await db.run(sql.raw(`DELETE FROM ${table}`));
        const [a, b] = (await db.select().from(schema.marchers).all())
            .map((m) => m.id)
            .sort((x, y) => x - y);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 17 },
            moves: [
                { marcherId: a!, x: 300, y: 200 },
                { marcherId: b!, x: 320, y: 220 },
            ],
        });
        return { a: a!, b: b! };
    };

    const pageIds = async (db: DbConnection) =>
        (await db.transaction((tx) => readPageGrid(tx))).pages.map((p) => p.id);

    const destinations = async (db: DbConnection) =>
        await db.select().from(schema.timeline_slot_destinations).all();

    it("the toast closes on the next edit, so its Undo can't take back that edit instead", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { b } = await S4(db);
        const success = vi
            .spyOn(toast, "success")
            .mockImplementation(() => "delete-toast");
        const dismiss = vi.spyOn(toast, "dismiss");
        const { wrapper } = newClient();
        const { result } = renderHook(
            () => {
                const qc = useQueryClient();
                // As TimelineModePanel wires it: the toast's Undo is the app's normal undo
                const { mutateAsync: performHistoryAction } =
                    usePerformHistoryAction();
                const { mutateAsync } = useMutation(
                    deletePagesWithMovesMutationOptions(qc, () => {
                        void performHistoryAction("undo");
                    }),
                );
                return { remove: mutateAsync };
            },
            { wrapper },
        );

        await act(async () => {
            await result.current.remove(new Set([2]));
        });
        expect(await pageIds(db)).toEqual([0, 1, 3, 4, 5, 6]);
        expect(success).toHaveBeenCalledTimes(1);
        // The delete's own history change came before the toast: it is still open
        expect(dismiss).not.toHaveBeenCalled();

        // A later edit (a history change) closes it
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 25, end: 33 },
            moves: [{ marcherId: b, x: 10, y: 10 }],
        });
        expect(dismiss).toHaveBeenCalledWith("delete-toast");
        // Only once: it stopped listening
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 25, end: 33 },
            moves: [{ marcherId: b, x: 20, y: 20 }],
        });
        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it("its Undo, clicked before any other edit, takes back the delete", async ({
        db,
        marchersAndPages: _,
    }) => {
        await S4(db);
        const before = await destinations(db);
        const success = vi
            .spyOn(toast, "success")
            .mockImplementation(() => "delete-toast");
        const { wrapper } = newClient();
        const { result } = renderHook(
            () => {
                const qc = useQueryClient();
                const { mutateAsync: performHistoryAction } =
                    usePerformHistoryAction();
                const { mutateAsync } = useMutation(
                    deletePagesWithMovesMutationOptions(qc, () => {
                        void performHistoryAction("undo");
                    }),
                );
                return { remove: mutateAsync };
            },
            { wrapper },
        );
        await act(async () => {
            await result.current.remove(new Set([2]));
        });
        const action = success.mock.calls[0]![1]!.action as {
            onClick: () => void;
        };
        act(() => action.onClick());
        await waitFor(async () =>
            expect(await pageIds(db)).toEqual([0, 1, 2, 3, 4, 5, 6]),
        );
        expect(await destinations(db)).toEqual(before);
    });

    it("same as Delete move's toast, which closes on the next history change", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { b } = await S4(db);
        vi.spyOn(toast, "success").mockImplementation(() => "move-toast");
        const dismiss = vi.spyOn(toast, "dismiss");
        toastMoveDeleted("Move 2", () => {});
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 25, end: 33 },
            moves: [{ marcherId: b, x: 10, y: 10 }],
        });
        expect(dismiss).toHaveBeenCalledWith("move-toast");
    });
});
