import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, vi } from "vitest";
import type { FieldEditor, FieldPointer } from "@/field/editor/fieldEditor";
import { createLastPage, deletePages } from "@/db-functions/page";
import {
    readAllShapeRecipes,
    saveShapeRecipeInTransaction,
    type ShapeRecipeMember,
} from "@/db-functions/shapeRecipes";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { NO_KEYS } from "@/input/modifierRoles";
import { queueHistoryStep } from "@/shortcuts/handlers/historyQueue";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { DbConnection, describeDbTests } from "@/test/base";
import { useIsolationPlanStore } from "@/timeline/timelineIsolationPlan";
import { readShowTiming } from "@/timeline/showTiming";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { boxShape } from "../box/boxShape";
import { drawBox, type BoxParams } from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import { setShapeField } from "../field/shapeField";
import { shapeOutline } from "../frame/gestures";
import { shapeContextFor } from "../field/shapeFieldContext";
import { useShapeFieldModes } from "../field/useShapeFieldModes";
import {
    useBoxSelectionStore,
    useSavingBoxStore,
} from "../placed/boxSelectionStore";
import { commitBox } from "../placed/commitBox";
import type { LiveBoxMode } from "../placed/liveBoxMode";
import type { PlacedBox } from "../placed/placedBox";
import {
    invalidatePlacedBoxes,
    placedBoxesAt,
    placedBoxesRead,
    usePlacedBoxStore,
} from "../placed/placedBoxStore";
import { toolEnvFor } from "../tool/toolEnv";
import type { XY } from "../types";

/**
 * The moments between an edit of a placed shape and its save being read back (#776): the page can
 * change, and another drag can start. Everything here is the real save, database and resolver;
 * only the selection's React context stands in, as it needs a provider.
 */

const selection = vi.hoisted(() => ({
    now: [] as { id: number }[],
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: selection.now }),
}));

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const FROM = { x: 30 * STEP + 1, y: 20 * STEP + 1 };
/** Inside the box, away from its handles and center */
const GRAB = { x: FROM.x + 4 * STEP, y: FROM.y + 4 * STEP };

const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };

const resolver = () => useTimelineResolverStore.getState().resolver!;

const field = () => ({
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
});

const showBeat = (range: { start: number; end: number }) =>
    useTimelineSelectionStore.setState({
        selection: { kind: "range", ...range },
        playheadBeat: range.end,
        cursorBeat: null,
        isolation: null,
    });

/** Four marchers in a box placed on page 2, and only carried onto page 3 */
async function placeBox(db: DbConnection) {
    const pages = [...(await readShowTiming(db)).pages].sort(
        (a, b) => a.order - b.order,
    );
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await startTimelineResolver(db);
    setShapeField({
        ...field(),
        fieldProperties: () => fieldProperties,
        drawn: (ids) =>
            new Map(
                ids.map((id) => {
                    const beat = displayedBeat(
                        useTimelineSelectionStore.getState(),
                    );
                    const [x, y] = resolver().positionAt(id, beat);
                    return [id, { x, y }] as const;
                }),
            ),
    });
    const ids = resolver().marcherIds().slice(0, 4);
    const params = drawBox(
        FROM,
        { x: FROM.x + 16 * STEP, y: FROM.y + 16 * STEP },
        4,
        toolEnvFor(field()),
    )!;
    const members: ShapeRecipeMember[] = boxShape
        .generate(params, 4, shapeContextFor(field()))
        .map((s, slot) => ({ marcherId: ids[slot], slot, x: s.x, y: s.y }));
    let timelineId: number | null = null;
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...PAGE2 },
        moves: members.map(({ marcherId, x, y }) => ({ marcherId, x, y })),
        afterWrite: async (tx, id) => {
            timelineId = id;
            await saveShapeRecipeInTransaction({
                tx,
                timelineId: id,
                recipe: {
                    kind: boxShape.id,
                    kindVersion: boxShape.version,
                    params: { ...params, spots: 4 },
                    orderMode: "nearest",
                    reverse: false,
                },
                members,
            });
        },
    });
    await timelineResolverSettled();
    invalidatePlacedBoxes();
    await placedBoxesRead();
    selection.now = ids.map((id) => ({ id }));
    return { ids, timelineId: timelineId as unknown as number };
}

const shownAt = (beat: number) =>
    placedBoxesAt(beat)[0] as PlacedBox<BoxParams>;

/** `box`'s params with it `steps` further across the field */
const across = (box: PlacedBox, steps: number) =>
    box.kind.move(
        box.params,
        box.spots,
        { x: steps * STEP, y: 0 },
        toolEnvFor(field()),
    );

const stepsMoved = (id: number, beat: number, from: XY) =>
    Math.round((resolver().positionAt(id, beat)[0] - from.x) / STEP);

const edit = (box: PlacedBox, steps: number) =>
    commitBox(box, across(box, steps), new QueryClient());

const settled = async () => {
    await timelineResolverSettled();
    await placedBoxesRead();
};

/** Marcher `id`'s spot where `box` shows it */
const spotOf = (box: PlacedBox, id: number): XY =>
    box.recipe.members.find((m) => m.marcherId === id)!;

afterEach(() => {
    stopTimelineResolver();
    setShapeField(null);
    selection.now = [];
    useIsolationPlanStore.setState({ current: null });
    useBoxSelectionStore.setState({ selected: null, inside: null });
    useSavingBoxStore.setState({ box: null, beats: [] });
    usePlacedBoxStore.setState({ recipes: [] });
    useTimelineSelectionStore.setState({ isolation: null, cursorBeat: null });
});

describeDbTests("a placed shape while its save is under way", (it) => {
    it("is saved on the page it was edited on, though the page changed before the save ran", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { ids, timelineId } = await placeBox(db);
        showBeat(PAGE2);
        const box = shownAt(PAGE2.end);
        const from = spotOf(box, ids[0]);

        const saved = edit(box, 4);
        showBeat(PAGE3);
        await saved;
        await settled();

        expect(stepsMoved(ids[0], PAGE2.end, from)).toBe(4);
        expect(
            (await readAllShapeRecipes(db)).map((r) => r.timelineId),
        ).toEqual([timelineId]);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(
            PAGE3.end,
        );
    });

    it("is shown at the beat it was edited at and the beat the edit lands on", async ({
        db,
        marchersAndPages: _,
    }) => {
        await placeBox(db);
        showBeat(PAGE2);
        useTimelineSelectionStore.setState({ cursorBeat: PAGE3.end });
        const saved = edit(shownAt(PAGE3.end), 4);
        expect(useSavingBoxStore.getState().beats).toEqual([
            PAGE3.end,
            PAGE2.end,
        ]);
        await saved;
        expect(useSavingBoxStore.getState()).toMatchObject({
            box: null,
            beats: [],
        });
    });

    describe("inside an isolated later move, with the shape carried through it", () => {
        const MID = 21;

        /** Another marcher's move over page 3, isolated, with the playhead part way through it */
        async function isolateLaterMove(db: DbConnection) {
            const other = resolver().marcherIds()[4];
            let timelineId = 0;
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE3 },
                moves: [{ marcherId: other, x: 10 * STEP, y: 10 * STEP }],
                afterWrite: async (_tx, id) => {
                    timelineId = id!;
                },
            });
            await settled();
            showBeat(PAGE3);
            useIsolationPlanStore.setState({
                current: { timelineId, plan: resolver(), members: new Set() },
            });
            useTimelineSelectionStore.setState({
                isolation: { timelineId, ...PAGE3 },
                playheadBeat: MID,
            });
            return shownAt(MID);
        }
        const playhead = () =>
            useTimelineSelectionStore.getState().playheadBeat;

        it("a save nothing overtook takes the playhead to the edit's end", async ({
            db,
            marchersAndPages: _,
        }) => {
            await placeBox(db);
            const box = await isolateLaterMove(db);
            await edit(box, 4);
            expect(playhead()).toBe(PAGE3.end);
        });

        it("a save the playhead overtook leaves it where it was moved to", async ({
            db,
            marchersAndPages: _,
        }) => {
            await placeBox(db);
            const box = await isolateLaterMove(db);
            const saved = edit(box, 4);
            useTimelineSelectionStore.setState({ playheadBeat: 19 });
            await saved;
            expect(playhead()).toBe(19);
        });

        it("a save that waited for an earlier step leaves the playhead where it is", async ({
            db,
            marchersAndPages: _,
        }) => {
            await placeBox(db);
            const box = await isolateLaterMove(db);
            let finishEarlier = () => {};
            void queueHistoryStep(
                () =>
                    new Promise<void>((resolve) => {
                        finishEarlier = resolve;
                    }),
                undefined,
            );
            const saved = edit(box, 4);
            // The earlier step starts on a later tick
            await new Promise((resolve) => setTimeout(resolve, 0));
            finishEarlier();
            await saved;
            expect(playhead()).toBe(MID);
        });
    });
});

describeDbTests("the selected shape during a save", (it) => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const pointer = (at: XY): FieldPointer =>
        ({
            field: at,
            screen: at,
            button: 0,
            ...NO_KEYS,
        }) as FieldPointer;

    /** The field editor's modes on the shape selected at `range`, through the real hooks */
    function mount() {
        const setMode = vi.fn();
        const editor = { setMode } as unknown as FieldEditor;
        renderHook(() => useShapeFieldModes(editor, false), { wrapper });
        const mode = setMode.mock.lastCall![0] as LiveBoxMode;
        setMode.mockClear();
        return { setMode, mode };
    }

    const selected = () => useBoxSelectionStore.getState().selected;

    const saveDone = () =>
        act(async () => {
            await vi.waitFor(() =>
                expect(useSavingBoxStore.getState().box).toBeNull(),
            );
            await settled();
        });

    const drag = (mode: LiveBoxMode, from: XY, steps: number) => {
        mode.press(pointer(from), { reachesInside: () => false, isMac: false });
        mode.move(pointer({ x: from.x + steps * STEP, y: from.y }));
    };
    const letGo = (mode: LiveBoxMode, at: XY) =>
        mode.release(pointer(at), null);

    it("is the shape as saved on its own page, and as stored on a page it isn't saved for", async ({
        db,
        marchersAndPages: _,
    }) => {
        await placeBox(db);
        showBeat(PAGE2);
        mount();
        const box = selected()!;
        const moved = across(box, 4);

        let saved = Promise.resolve();
        act(() => {
            saved = commitBox(box, moved, client);
        });
        expect(selected()!.params).toEqual(moved);

        act(() => {
            showBeat(PAGE3);
        });
        expect(selected()!.params).toEqual(box.params);

        await act(async () => {
            await saved;
            await settled();
        });
    });

    it("keeps a drag held while this page's own copy arrives, and both drags land there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { ids } = await placeBox(db);
        showBeat(PAGE3);
        const { setMode, mode } = mount();
        const from = spotOf(selected()!, ids[0]);

        const second = { x: GRAB.x + 4 * STEP, y: GRAB.y };
        const end = { x: second.x + 4 * STEP, y: second.y };
        act(() => {
            drag(mode, GRAB, 4);
            letGo(mode, second);
            drag(mode, second, 4);
        });
        await saveDone();
        expect((await readAllShapeRecipes(db)).length).toBe(2);
        expect(setMode).not.toHaveBeenCalled();

        act(() => letGo(mode, end));
        // The saving box is this page's copy: the selection doesn't go back to the earlier one
        expect(selected()!.recipe.timelineId).not.toBe(
            shownAt(PAGE2.end).recipe.timelineId,
        );
        await saveDone();

        expect(setMode).not.toHaveBeenCalled();
        expect(stepsMoved(ids[0], PAGE3.end, from)).toBe(8);
        expect(stepsMoved(ids[0], PAGE2.end, from)).toBe(0);
        expect((await readAllShapeRecipes(db)).length).toBe(2);
    });

    it("gets a new mode for this page's copy once no drag is held", async ({
        db,
        marchersAndPages: _,
    }) => {
        await placeBox(db);
        showBeat(PAGE3);
        const { setMode, mode } = mount();
        // Pressed and let go without moving: no gesture is under way any more
        act(() => {
            mode.press(pointer(GRAB), {
                reachesInside: () => false,
                isMac: false,
            });
            mode.release(pointer(GRAB), null);
        });
        act(() => {
            void edit(selected()!, 4);
        });
        await saveDone();
        expect(setMode.mock.lastCall![0]).not.toBe(mode);
    });

    it("ends a held drag when the new shape has other marchers", async ({
        db,
        marchersAndPages: _,
    }) => {
        await placeBox(db);
        showBeat(PAGE3);
        const { setMode, mode } = mount();
        const box = selected()!;
        act(() => drag(mode, GRAB, 4));
        act(() =>
            useBoxSelectionStore.setState({
                selected: {
                    ...box,
                    recipe: {
                        ...box.recipe,
                        id: box.recipe.id + 1,
                        members: box.recipe.members.slice(1),
                    },
                },
            }),
        );
        expect(setMode.mock.lastCall![0]).not.toBe(mode);
    });

    it("ends a held drag when the new recipe arrives at another moment", async ({
        db,
        marchersAndPages: _,
    }) => {
        await placeBox(db);
        showBeat(PAGE3);
        const { setMode, mode } = mount();
        const box = selected()!;
        act(() => drag(mode, GRAB, 4));
        useTimelineSelectionStore.setState({ playheadBeat: PAGE2.end });
        act(() =>
            useBoxSelectionStore.setState({
                selected: {
                    ...box,
                    recipe: { ...box.recipe, id: box.recipe.id + 1 },
                },
            }),
        );
        expect(setMode.mock.lastCall![0]).not.toBe(mode);
    });

    for (const ending of ["released without moving", "cancelled"] as const)
        it(`takes the shape read during a press that's ${ending}`, async ({
            db,
            marchersAndPages: _,
        }) => {
            await placeBox(db);
            showBeat(PAGE3);
            const { mode } = mount();
            const box = selected()!;
            const moved = across(box, 8) as BoxParams;
            act(() => {
                mode.press(pointer(GRAB), {
                    reachesInside: () => false,
                    isMac: false,
                });
            });
            act(() =>
                useBoxSelectionStore.setState({
                    selected: { ...box, params: moved },
                }),
            );
            act(() => {
                if (ending === "cancelled") mode.cancel();
                else mode.release(pointer(GRAB), null);
            });
            const left = (b: unknown) =>
                Math.min(...(b as { outline: XY[] }).outline.map((p) => p.x));
            expect(left(mode.drawing())).toBeCloseTo(
                Math.min(
                    ...shapeOutline(boxTool, moved, box.spots).map((p) => p.x),
                ),
            );
        });
});
