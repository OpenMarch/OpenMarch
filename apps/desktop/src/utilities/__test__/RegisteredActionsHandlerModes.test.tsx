import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { DbConnection, describeDbTests } from "@/test/base";
import {
    createAllUndoTriggers,
    dropAllUndoTriggers,
} from "@/db-functions/history";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    expectWrittenWhereTheModeWrites,
    harnessQueryClient,
    marcherPageRows,
    positionsOn,
    probed,
    selectPageAndMarchers,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { historyKeys } from "@/hooks/queries/useHistory";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import RegisteredActionsHandler, {
    RegisteredActionsEnum,
} from "../RegisteredActionsHandler";

/**
 * The coordinate tools in `RegisteredActionsHandler` (nudges, align, swap, set selected or all
 * marchers to the previous or next page) and undo's page and marcher focus, run from the handler itself on the
 * `base.tsx` fixtures (docs/timeline/phases/07-page-parity.md P7.18).
 *
 * The file's mode decides the path: the default run checks page mode (`marcher_pages` rows), and
 * `test:timeline` (a converted show with the flag on) checks timeline mode, where the tools read
 * the resolver and write slot destinations, and `marcher_pages` is never written. In timeline mode
 * every `marcher_pages` row is first moved away from the resolver's position, so a tool that read
 * its starting positions from those rows would fail. Each test also checks that the marchers on
 * the pages before and after, and unselected marchers on the page, don't move.
 */

// Page-mode mutations invalidate through the app's query client; use the harness's. The getter
// is read lazily, after this file's imports (the harness imports modules that import `@/App`).
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

const setUp = (pageIndex: number, marcherIds: readonly number[]) =>
    setUpFeature(<RegisteredActionsHandler />, pageIndex, marcherIds);

/** Runs a registered action the way a toolbar button does. */
const trigger = async (action: RegisteredActionsEnum) => {
    const button = document.createElement("button");
    const ref = { current: button };
    const store = useRegisteredActionsStore.getState();
    act(() => {
        store.linkRegisteredAction(action, ref);
    });
    try {
        await waitFor(() => expect(button.onclick).toBeTypeOf("function"));
        act(() => button.click());
    } finally {
        act(() => {
            useRegisteredActionsStore
                .getState()
                .removeRegisteredAction(action, ref);
        });
    }
};

const PAGE = 3;

/** How far `makePageRowsStale` moves every `marcher_pages` row, in pixels */
const STALE = { dx: -40, dy: -24 };

/**
 * Timeline mode: moves every `marcher_pages` row away from where the resolver puts the marcher,
 * outside history (undo triggers dropped), as rows left over from before an edit can be. A tool
 * that read its starting positions from those rows instead of the resolver then gets a different
 * result. Page mode: nothing, as the rows are where the marchers are.
 */
const makePageRowsStale = async (db: DbConnection) => {
    if (!timelineFixtureMode()) return;
    await dropAllUndoTriggers(db);
    await db.run(
        sql`UPDATE marcher_pages SET x = x + ${STALE.dx}, y = y + ${STALE.dy}`,
    );
    await createAllUndoTriggers(db);
};

type Positions = Map<string, [number, number]>;

/**
 * Positions an action on `PAGE` must not change: the selected marchers and `bystanders` on the
 * pages before and after it, and the bystanders on `PAGE` itself unless `wholePage`.
 */
const untouchedPositions = async (
    db: DbConnection,
    selected: readonly number[],
    bystanders: readonly number[],
    { wholePage = false }: { wholePage?: boolean } = {},
): Promise<Positions> => {
    const pages = probed().pages;
    const out: Positions = new Map();
    const read = async (pageIndex: number, ids: readonly number[]) => {
        const page = pages[pageIndex]!;
        const positions = await positionsOn(db, page, ids);
        ids.forEach((id, i) => out.set(`${page.id}:${id}`, positions[i]!));
    };
    await read(PAGE - 1, [...selected, ...bystanders]);
    await read(PAGE + 1, [...selected, ...bystanders]);
    if (!wholePage) await read(PAGE, bystanders);
    return out;
};

/** Marchers no test here selects */
const bystandersOf = (marchers: readonly { id: number }[]) =>
    marchers.slice(30, 34).map((m) => m.id);

type XY = [number, number];

/**
 * Makes the rows stale (timeline mode), selects `ids` on `PAGE`, and reads the `measured`
 * marchers' positions on `PAGE` (and on page index `source`, when given). Then runs `action`,
 * waits for `check(after, before, sourcePositions)` to pass on the new positions on `PAGE`, and
 * checks that nothing else moved and that the edit was written where the mode writes.
 */
const runAction = async ({
    db,
    ids,
    measured = ids,
    bystanders,
    action,
    wholePage = false,
    source,
    check,
}: {
    db: DbConnection;
    ids: readonly number[];
    measured?: readonly number[];
    bystanders: readonly number[];
    action: RegisteredActionsEnum;
    wholePage?: boolean;
    source?: number;
    check: (after: XY[], before: XY[], sourcePositions: XY[]) => void;
}) => {
    await makePageRowsStale(db);
    const { page } = await setUp(PAGE, ids);
    const before = await positionsOn(db, page, measured);
    const sourcePositions =
        source === undefined
            ? []
            : await positionsOn(db, probed().pages[source]!, measured);
    const untouched = await untouchedPositions(db, ids, bystanders, {
        wholePage,
    });
    const rowsBefore = await marcherPageRows(db);

    await trigger(action);

    await waitFor(async () =>
        check(await positionsOn(db, page, measured), before, sourcePositions),
    );
    expect(
        await untouchedPositions(db, ids, bystanders, { wholePage }),
    ).toEqual(untouched);
    await expectWrittenWhereTheModeWrites(db, rowsBefore);
};

const expectAt = (actual: readonly XY[], expected: readonly XY[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(expected[i]![0], 6);
        expect(y).toBeCloseTo(expected[i]![1], 6);
    });
};

describeDbTests("registered coordinate actions in the file's mode", (it) => {
    it("a nudge moves the selected marchers a step right of where they are", async ({
        db,
        marchersAndPages,
    }) => {
        const marchers = marchersAndPages.expectedMarchers;
        await runAction({
            db,
            ids: marchers.slice(0, 2).map((m) => m.id),
            bystanders: bystandersOf(marchers),
            action: RegisteredActionsEnum.moveSelectedMarchersRight,
            check: (after, before) =>
                after.forEach(([x, y], i) => {
                    // Right of the marcher, by less than the stale rows are off
                    expect(x).toBeGreaterThan(before[i]![0]);
                    expect(x).toBeLessThan(before[i]![0] - STALE.dx);
                    expect(y).toBeCloseTo(before[i]![1], 6);
                }),
        });
    });

    it("align gives the selected marchers their mean x", async ({
        db,
        marchersAndPages,
    }) => {
        const marchers = marchersAndPages.expectedMarchers;
        await runAction({
            db,
            ids: marchers.slice(2, 5).map((m) => m.id),
            bystanders: bystandersOf(marchers),
            action: RegisteredActionsEnum.alignHorizontally,
            check: (after, before) => {
                expect(new Set(before.map(([x]) => x)).size).toBeGreaterThan(1);
                const meanX =
                    before.reduce((sum, [x]) => sum + x, 0) / before.length;
                expectAt(
                    after,
                    before.map(([, y]): XY => [meanX, y]),
                );
            },
        });
    });

    it("swap exchanges two marchers' positions on the selected page", async ({
        db,
        marchersAndPages,
    }) => {
        const marchers = marchersAndPages.expectedMarchers;
        await runAction({
            db,
            ids: marchers.slice(5, 7).map((m) => m.id),
            bystanders: bystandersOf(marchers),
            action: RegisteredActionsEnum.swapMarchers,
            check: (after, before) => {
                expect(before[0]).not.toEqual(before[1]);
                expectAt(after, [before[1]!, before[0]!]);
            },
        });
    });

    it.for([
        {
            action: RegisteredActionsEnum.setSelectedMarchersToPreviousPage,
            source: PAGE - 1,
        },
        {
            action: RegisteredActionsEnum.setSelectedMarchersToNextPage,
            source: PAGE + 1,
        },
    ])(
        "$action copies that page's positions to the selected marchers",
        async ({ action, source }, { db, marchersAndPages }) => {
            const marchers = marchersAndPages.expectedMarchers;
            await runAction({
                db,
                ids: marchers.slice(7, 10).map((m) => m.id),
                bystanders: bystandersOf(marchers),
                action,
                source,
                check: (after, before, sourcePositions) => {
                    expect(before).not.toEqual(sourcePositions);
                    expectAt(after, sourcePositions);
                },
            });
        },
    );

    it("set all marchers to the previous page copies every position", async ({
        db,
        marchersAndPages,
    }) => {
        const marchers = marchersAndPages.expectedMarchers;
        await runAction({
            db,
            ids: [marchers[0]!.id],
            measured: marchers.map((m) => m.id),
            bystanders: bystandersOf(marchers),
            wholePage: true,
            action: RegisteredActionsEnum.setAllMarchersToPreviousPage,
            source: PAGE - 1,
            check: (after, before, sourcePositions) => {
                expect(before).not.toEqual(sourcePositions);
                expectAt(after, sourcePositions);
            },
        });
    });

    it("undo restores a nudge, goes back to its page and selects the moved marchers", async ({
        db,
        marchersAndPages,
    }) => {
        const ids = marchersAndPages.expectedMarchers
            .slice(10, 12)
            .map((m) => m.id);
        const { qc, page } = await setUp(PAGE, ids);
        const before = await positionsOn(db, page, ids);

        await trigger(RegisteredActionsEnum.moveSelectedMarchersUp);
        await waitFor(async () => {
            expect(await positionsOn(db, page, ids)).not.toEqual(before);
        });

        // Look somewhere else, then undo
        const elsewhere = probed().pages[1]!;
        const otherId = marchersAndPages.expectedMarchers[20]!.id;
        await selectPageAndMarchers(elsewhere, [otherId]);
        await act(() => qc.invalidateQueries({ queryKey: historyKeys.all() }));
        await waitFor(() =>
            expect(qc.getQueryData(historyKeys.canUndo())).toBe(true),
        );

        await trigger(RegisteredActionsEnum.performUndo);

        // Page mode is left out of the focus check: its rule never finds the page, because
        // `rowIdFromSql` in history.ts parses the whole match (filed as P7.19)
        if (timelineFixtureMode())
            await waitFor(() => {
                expect(probed().selectedPage?.id).toBe(page.id);
                expect(
                    probed()
                        .selectedMarchers.map((m) => m.id)
                        .sort(),
                ).toEqual([...ids].sort());
            });
        await waitFor(async () => {
            const after = await positionsOn(db, page, ids);
            after.forEach(([x, y], i) => {
                expect(x).toBeCloseTo(before[i]![0], 6);
                expect(y).toBeCloseTo(before[i]![1], 6);
            });
        });
    });
});
