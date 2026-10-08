import type { ComponentType, ReactNode } from "react";
import { skipInTimelineMode } from "@/test/timelineMode";
import { afterEach, describe, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { getBeats } from "@/db-functions/beat";
import { getPages } from "@/db-functions/page";
import { getUtility } from "@/db-functions/utility";
import Beat, {
    calculateTimestamps,
    fromDatabaseBeat,
} from "@/global/classes/Beat";
import Page, { fromDatabasePages } from "@/global/classes/Page";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { useAnimation } from "@/hooks/useAnimation";
import { useTimingObjects } from "@/hooks";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { pageEndBeat, playbackBeat } from "../timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    useTimelineResolverStore,
} from "../timelineStore";
import { useTimelineStaticRender } from "../useTimelineStaticRender";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";

/**
 * Timeline-mode rendering (docs/timeline/phases/05-rendering.md P5.4 and P5.5) against a real
 * database: the static render at a page's end beat, and the playback path in `useAnimation` with
 * the dev flag on and off.
 */

const MARCHER_IDS = [1, 2];
const HOMES: Record<number, [number, number]> = { 1: [0, 0], 2: [5, 0] };
/** Destinations of transition 1 (page 1's beats) and transition 2 (page 2's beats), by slot */
const DESTINATIONS = {
    1: [
        [10, 20],
        [30, 40],
    ],
    2: [
        [50, 60],
        [70, 80],
    ],
} as const;

/**
 * Beats 1..16 of 0.5 s after the fixed beat 0. Page 0 is beat 0, page 1 starts at beat 1 and
 * page 2 at beat 9; the last page runs `last_page_counts` (8) beats, so page 1 covers [1, 9) and
 * page 2 [9, 17). One timeline, one shapeless direct transition per page over that page's beats,
 * as the converter (P6.2) will write them.
 */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.beats).values(
            Array.from({ length: 16 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
                duration: 0.5,
            })),
        );
        await tx.insert(schema.pages).values([
            { id: 1, start_beat: 1 },
            { id: 2, start_beat: 9 },
        ]);
        await tx.insert(schema.marchers).values(
            MARCHER_IDS.map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
                home_x: HOMES[id]![0],
                home_y: HOMES[id]![1],
            })),
        );
        // One timeline per move, which spans it (C-11)
        await tx.insert(schema.timelines).values([
            { id: 1, name: "Opener", start_beat: 1, end_beat: 9 },
            { id: 2, start_beat: 9, end_beat: 17 },
        ]);
        await tx.insert(schema.timeline_transitions).values([
            {
                id: 1,
                timeline_id: 1,
                dest_shape_id: null,
                path_style: "direct",
                path_params: null,
                slot_count: 2,
                start_beat: 1,
                end_beat: 9,
            },
            {
                id: 2,
                timeline_id: 2,
                dest_shape_id: null,
                path_style: "direct",
                path_params: null,
                slot_count: 2,
                start_beat: 9,
                end_beat: 17,
            },
        ]);
        await tx.insert(schema.timeline_slot_destinations).values(
            ([1, 2] as const).flatMap((transition_id) =>
                DESTINATIONS[transition_id].map(([x, y], slot_index) => ({
                    transition_id,
                    slot_index,
                    x,
                    y,
                })),
            ),
        );
        let id = 1;
        await tx.insert(schema.timeline_assignments).values(
            [1, 2].flatMap((transition_id) =>
                MARCHER_IDS.map((marcher_id, slot_index) => ({
                    id: id++,
                    marcher_id,
                    transition_id,
                    slot_index,
                    start_beat: transition_id === 1 ? 1 : 9,
                    end_beat: transition_id === 1 ? 9 : 17,
                })),
            ),
        );
    });

const setTimelineMode = async (db: DbConnection, on: boolean) => {
    const settings = await getWorkspaceSettingsParsed({ db });
    await updateWorkspaceSettingsParsed({
        db,
        settings: { ...settings, timelineMode: on },
    });
};

/** Beats and pages as `useTimingObjects` builds them. */
const readTiming = async (
    db: DbConnection,
): Promise<{ beats: Beat[]; pages: Page[] }> => {
    const beats = calculateTimestamps(
        (await getBeats({ db })).map((beat, i) => fromDatabaseBeat(beat, i)),
    );
    const pages = fromDatabasePages({
        databasePages: await getPages({ db }),
        allMeasures: [],
        allBeats: beats,
        lastPageCounts: (await getUtility({ db }))!.last_page_counts,
    });
    return { beats, pages };
};

/** A canvas with one canvas marcher per seeded marcher, all at (-1, -1). */
const createCanvasWithMarchers = async (db: DbConnection) => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });
    for (const row of await db.query.marchers.findMany()) {
        const marcher = dbMarcherToMarcher(row);
        canvas.add(
            new CanvasMarcher({ marcher, coordinate: { x: -1, y: -1 } }),
        );
    }
    return canvas;
};

const coordsById = (canvas: OpenMarchCanvas) =>
    Object.fromEntries(
        canvas
            .getCanvasMarchers()
            .map((m) => [m.marcherObj.id, m.getMarcherCoords()]),
    );

const expectAt = (
    actual: { x: number; y: number },
    expected: readonly [number, number],
    what: string,
) => {
    expect(actual.x, `${what} x`).toBeCloseTo(expected[0], 6);
    expect(actual.y, `${what} y`).toBeCloseTo(expected[1], 6);
};

afterEach(() => {
    stopTimelineResolver();
});

describeDbTests("timeline rendering", (it) => {
    describe("static render (P5.5)", () => {
        it("draws each page at its end beat from the resolver", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const resolver = useTimelineResolverStore.getState().resolver!;
            expect(resolver).not.toBeNull();
            const { beats, pages } = await readTiming(db);
            expect(pages.map((p) => pageEndBeat(p))).toEqual([1, 9, 17]);
            expect(beats).toHaveLength(17);

            const canvas = await createCanvasWithMarchers(db);
            const { rerender } = renderHook(
                ({ page }: { page: Page }) =>
                    useTimelineStaticRender({
                        canvas,
                        selectedPage: page,
                        isPlaying: false,
                        enabled: true,
                    }),
                { initialProps: { page: pages[0]! } },
            );

            const expectedAtPage: Record<
                number,
                (id: number) => readonly [number, number]
            > = {
                0: (id) => HOMES[id]!,
                1: (id) => DESTINATIONS[1][MARCHER_IDS.indexOf(id)]!,
                2: (id) => DESTINATIONS[2][MARCHER_IDS.indexOf(id)]!,
            };
            for (const page of pages) {
                rerender({ page });
                const endBeat = pageEndBeat(page);
                const coords = coordsById(canvas);
                for (const id of MARCHER_IDS) {
                    const fromResolver = resolver.positionAt(id, endBeat);
                    expectAt(
                        coords[id]!,
                        fromResolver,
                        `page ${page.id} marcher ${id} vs resolver`,
                    );
                    // A page-end position is that page's destination, as marcher_pages would hold
                    expectAt(
                        coords[id]!,
                        expectedAtPage[page.id]!(id),
                        `page ${page.id} marcher ${id} vs destination`,
                    );
                    // The canvas marcher's coordinate follows, so a refresh keeps it there
                    expectAt(
                        canvas
                            .getCanvasMarchers()
                            .find((m) => m.marcherObj.id === id)!
                            .coordinate as {
                            x: number;
                            y: number;
                        },
                        fromResolver,
                        `page ${page.id} marcher ${id} coordinate`,
                    );
                }
            }
        });

        it("follows the playhead itself with followPlayhead, without a re-render", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const resolver = useTimelineResolverStore.getState().resolver!;
            const { pages } = await readTiming(db);
            const canvas = await createCanvasWithMarchers(db);
            const store = useTimelineSelectionStore.getState();
            store.reset();
            store.seek(9);
            let renders = 0;
            renderHook(() => {
                renders++;
                useTimelineStaticRender({
                    canvas,
                    selectedPage: pages[1]!,
                    followPlayhead: true,
                    isPlaying: false,
                    enabled: true,
                });
            });
            const expectAtBeat = (beat: number) => {
                const coords = coordsById(canvas);
                for (const id of MARCHER_IDS)
                    expectAt(
                        coords[id]!,
                        resolver.positionAt(id, beat),
                        `marcher ${id} at beat ${beat}`,
                    );
            };
            expectAtBeat(9);
            const rendersBefore = renders;
            // A scrub: each beat is drawn as the store changes, and nothing re-renders
            store.beginScrub();
            for (const beat of [11, 13, 15]) {
                store.seek(beat);
                expectAtBeat(beat);
            }
            // Each beat of the scrub only moved the marchers; the end updates their coordinates
            const marcher1 = () =>
                canvas.getCanvasMarchers().find((m) => m.marcherObj.id === 1)!;
            expectAt(
                marcher1().coordinate as { x: number; y: number },
                resolver.positionAt(1, 9),
                "coordinate during the scrub",
            );
            store.seek(17);
            store.endScrub();
            expectAtBeat(17);
            expectAt(
                marcher1().coordinate as { x: number; y: number },
                resolver.positionAt(1, 17),
                "coordinate once the scrub ends",
            );
            // A scrub that ends on the beat it last drew still gets the full update
            store.beginScrub();
            store.seek(13);
            store.endScrub();
            expectAt(
                marcher1().coordinate as { x: number; y: number },
                resolver.positionAt(1, 13),
                "coordinate after a scrub ending on its last beat",
            );
            expect(renders).toBe(rendersBefore);
            store.reset();
        });

        it("redraws when a committed edit changes the resolver", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const { pages } = await readTiming(db);
            const canvas = await createCanvasWithMarchers(db);
            renderHook(() =>
                useTimelineStaticRender({
                    canvas,
                    selectedPage: pages[1]!,
                    isPlaying: false,
                    enabled: true,
                }),
            );
            expectAt(coordsById(canvas)[1]!, [10, 20], "before the edit");

            await transactionWithHistory(db, "moveDestination", (tx) =>
                tx
                    .update(schema.timeline_slot_destinations)
                    .set({ x: 12, y: 22 })
                    .where(sql`transition_id = 1 AND slot_index = 0`),
            );
            await waitFor(() =>
                expectAt(coordsById(canvas)[1]!, [12, 22], "after the edit"),
            );
        });

        it("does nothing while disabled, playing or not ready", async ({
            db,
        }) => {
            await seedShow(db);
            const { pages } = await readTiming(db);
            const canvas = await createCanvasWithMarchers(db);
            const { rerender } = renderHook(
                (props: { enabled: boolean; isPlaying: boolean }) =>
                    useTimelineStaticRender({
                        canvas,
                        selectedPage: pages[1]!,
                        ...props,
                    }),
                { initialProps: { enabled: true, isPlaying: false } },
            );
            // No resolver yet: marchers stay put rather than jumping to (0, 0)
            expectAt(coordsById(canvas)[1]!, [-1, -1], "not ready");

            rerender({ enabled: false, isPlaying: false });
            await startTimelineResolver(db);
            expectAt(coordsById(canvas)[1]!, [-1, -1], "flag off");

            rerender({ enabled: true, isPlaying: true });
            expectAt(coordsById(canvas)[1]!, [-1, -1], "playing");

            rerender({ enabled: true, isPlaying: false });
            expectAt(coordsById(canvas)[1]!, [10, 20], "static");
        });

        it("drops a page-era shape lock, since timeline mode has none (P7.11)", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const { pages } = await readTiming(db);
            const canvas = await createCanvasWithMarchers(db);
            const marcher = canvas
                .getCanvasMarchers()
                .find((m) => m.marcherObj.id === 1)!;
            // As an earlier marcher_pages render of a page shape leaves it
            marcher.setMarcherCoords({
                ...marcher.coordinate,
                page_id: pages[1]!.id,
                isLocked: true,
                lockedReason: "Marcher is part of a shape\n",
            });
            expect(marcher.locked).toBe(true);
            renderHook(() =>
                useTimelineStaticRender({
                    canvas,
                    selectedPage: pages[1]!,
                    isPlaying: false,
                    enabled: true,
                }),
            );
            expect(marcher.locked).toBe(false);
            expect(marcher.lockedReason).toBe("");
        });
    });

    describe("playback (P5.4)", () => {
        const renderAnimation = (
            canvas: OpenMarchCanvas,
            wrapper: ComponentType<{ children: ReactNode }>,
        ) =>
            renderHook(
                () => ({
                    animation: useAnimation({ canvas }),
                    timelineMode: useTimelineMode(),
                    timing: useTimingObjects()!,
                }),
                { wrapper },
            );

        it("with the flag on, draws the resolver's positions at the playback beat", async ({
            db,
            wrapper,
        }) => {
            await seedShow(db);
            await setTimelineMode(db, true);
            await startTimelineResolver(db);
            const resolver = useTimelineResolverStore.getState().resolver!;
            const canvas = await createCanvasWithMarchers(db);
            const { result } = renderAnimation(canvas, wrapper);
            await waitFor(() => {
                expect(result.current.timelineMode).toBe(true);
                expect(result.current.timing.beats).toHaveLength(17);
            });
            const { beats } = result.current.timing;

            // 0 ms is beat 1; 1.25 s is halfway through page 1; 4 s is page 1's end, beat 9
            for (const ms of [0, 1250, 2000, 4000, 5500, 8000]) {
                expect(
                    result.current.animation.setMarcherPositionsAtTime(ms),
                ).toBe(true);
                const beat = playbackBeat(beats, ms);
                const coords = coordsById(canvas);
                for (const id of MARCHER_IDS)
                    expectAt(
                        coords[id]!,
                        resolver.positionAt(id, beat),
                        `marcher ${id} at ${ms} ms (beat ${beat})`,
                    );
            }
            expect(playbackBeat(beats, 4000)).toBe(9);
            expectAt(coordsById(canvas)[2]!, [70, 80], "the end of page 2");
        });

        describe("page crossings while playing", () => {
            // Animation frames run only when a test says so
            let frames: FrameRequestCallback[] = [];
            const runFrame = () => {
                const queued = frames;
                frames = [];
                for (const callback of queued) callback(performance.now());
            };
            const stubFrames = () => {
                frames = [];
                vi.stubGlobal(
                    "requestAnimationFrame",
                    (callback: FrameRequestCallback) => frames.push(callback),
                );
                vi.stubGlobal("cancelAnimationFrame", () => {
                    frames = [];
                });
            };
            afterEach(() => {
                vi.unstubAllGlobals();
            });

            const renderPlayback = (
                canvas: OpenMarchCanvas,
                wrapper: ComponentType<{ children: ReactNode }>,
            ) =>
                renderHook(
                    () => ({
                        animation: useAnimation({ canvas }),
                        timelineMode: useTimelineMode(),
                        timing: useTimingObjects()!,
                        selection: useSelectedPage()!,
                        playing: useIsPlaying()!,
                    }),
                    { wrapper },
                );

            /**
             * Plays a frame, crosses into another page, plays another, then stops: the end-of-
             * playback work (control corners, the frame atlas) runs once, at the stop
             */
            const playAcrossPages = (
                canvas: OpenMarchCanvas,
                result: {
                    current: ReturnType<
                        typeof renderPlayback
                    >["result"]["current"];
                },
            ) => {
                const { pages } = result.current.timing;
                const endFrames = vi.spyOn(canvas, "endPlaybackFrames");
                const marcher = canvas.getCanvasMarchers()[0]!;
                const setCoords = vi.spyOn(marcher, "setCoords");
                stubFrames();
                act(() => {
                    result.current.selection.setSelectedPage(pages[1]!);
                });
                act(() => {
                    result.current.playing.setIsPlaying(true);
                });
                act(() => {
                    runFrame();
                });
                expect(result.current.playing.isPlaying).toBe(true);
                act(() => {
                    result.current.selection.setSelectedPage(pages[2]!);
                });
                act(() => {
                    runFrame();
                });
                act(() => {
                    result.current.selection.setSelectedPage(pages[1]!);
                });
                act(() => {
                    runFrame();
                });
                expect(result.current.playing.isPlaying).toBe(true);
                expect(endFrames).not.toHaveBeenCalled();
                expect(setCoords).not.toHaveBeenCalled();
                act(() => {
                    result.current.playing.setIsPlaying(false);
                });
                expect(endFrames).toHaveBeenCalledTimes(1);
                expect(setCoords).toHaveBeenCalledTimes(1);
            };

            it("page mode keeps its frame state until playback stops", async ({
                db,
                wrapper,
            }) => {
                await seedShow(db);
                await setTimelineMode(db, false);
                const { pages } = await readTiming(db);
                await transactionWithHistory(db, "seedMarcherPages", (tx) =>
                    tx.insert(schema.marcher_pages).values(
                        pages.flatMap((page, i) =>
                            MARCHER_IDS.map((marcher_id) => ({
                                marcher_id,
                                page_id: page.id,
                                x: 10 * i + marcher_id,
                                y: 10 * i,
                            })),
                        ),
                    ),
                );
                const canvas = await createCanvasWithMarchers(db);
                const { result } = renderPlayback(canvas, wrapper);
                await waitFor(() => {
                    expect(result.current.timelineMode).toBe(false);
                    expect(result.current.timing.pages).toHaveLength(3);
                });
                act(() => {
                    result.current.selection.setSelectedPage(
                        result.current.timing.pages[1]!,
                    );
                });
                // The page path has keyframes once the marcher_pages around the page load
                await waitFor(() =>
                    expect(
                        result.current.animation.setMarcherPositionsAtTime(0),
                    ).toBe(true),
                );
                playAcrossPages(canvas, result);
            });

            it("timeline mode keeps its frame state until playback stops", async ({
                db,
                wrapper,
            }) => {
                await seedShow(db);
                await setTimelineMode(db, true);
                await startTimelineResolver(db);
                const canvas = await createCanvasWithMarchers(db);
                const { result } = renderPlayback(canvas, wrapper);
                await waitFor(() => {
                    expect(result.current.timelineMode).toBe(true);
                    expect(result.current.timing.pages).toHaveLength(3);
                });
                playAcrossPages(canvas, result);
            });
        });

        it("with the flag on, leaves marchers in place while the resolver isn't ready", async ({
            db,
            wrapper,
        }) => {
            await seedShow(db);
            await setTimelineMode(db, true);
            const canvas = await createCanvasWithMarchers(db);
            const { result } = renderAnimation(canvas, wrapper);
            await waitFor(() => {
                expect(result.current.timelineMode).toBe(true);
                expect(result.current.timing.beats).toHaveLength(17);
            });
            expect(
                result.current.animation.setMarcherPositionsAtTime(1250),
            ).toBe(true);
            expectAt(coordsById(canvas)[1]!, [-1, -1], "not ready");
        });

        it.skipIf(
            skipInTimelineMode(
                "it asserts the flag-off path; timeline test mode turns the flag on",
            ),
        )(
            "with the flag off, uses the page path and ignores the resolver",
            async ({ db, wrapper }) => {
                await seedShow(db);
                await startTimelineResolver(db);
                const canvas = await createCanvasWithMarchers(db);
                const { result } = renderAnimation(canvas, wrapper);
                await waitFor(() =>
                    expect(result.current.timing.beats).toHaveLength(17),
                );
                expect(result.current.timelineMode).toBe(false);

                // The page path finds no marcher_pages timelines for these marchers, reports it
                // (false stops playback) and moves nothing, even though a resolver is ready
                expect(
                    result.current.animation.setMarcherPositionsAtTime(1250),
                ).toBe(false);
                for (const id of MARCHER_IDS)
                    expectAt(
                        coordsById(canvas)[id]!,
                        [-1, -1],
                        `marcher ${id}`,
                    );
            },
        );
    });
});
