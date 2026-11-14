import { afterEach, expect, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { eq } from "drizzle-orm";
import { toast } from "sonner";
import type { RouteGeometry, XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import type Marcher from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { performRedo, performUndo } from "@/db-functions/history";
import { drawRoute } from "@/db-functions/timelineRoutes";
import { drawGroupRoute } from "@/db-functions/timelineGroupRoutes";
import { editPathPoints } from "@/db-functions/timelinePathEdits";
import { followTrail, readTrails } from "@/db-functions/timelineTrails";
import {
    actionDisabledReason,
    isActionEnabled,
    runAction,
} from "@/shortcuts/registry";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    addPoint,
    clearPath,
    finishDrawing,
    activatePath,
    openPath,
    usePathPenStore,
} from "../pathPenStore";
import { findRouteTarget } from "../pathTarget";
import { PathPenKeys, usePathPenActions } from "../usePathPen";

keepFixturesInPageMode("its tests convert the show themselves");

// The path read by its route, as the app reads it; one test gives it its own reach
vi.mock("../pathTarget", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../pathTarget")>();
    return { ...actual, findRouteTarget: vi.fn(actual.findRouteTarget) };
});

/**
 * The path's lifecycle in `usePathPenActions` (the interaction system: marchers are the only
 * selection; a path is quiet or active), with the real resolver store and the show in the test
 * database: a click's activation outlasts the read for the walkers it selected, an active path
 * stays active across edits, undo and redo, Enter makes a quiet path active, the path goes with
 * its marchers and on playback; Detach on a quiet group path; drawing again (AP-O8, N5). On the
 * converted `marchersAndPages` show, page 2's move is `[9, 17)`.
 */

const page2 = async (db: DbConnection) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
const routeOf = async (db: DbConnection, routeId: number) =>
    JSON.parse(
        (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routeId))
            .get())!.geometry,
    ) as RouteGeometry;
const routeCount = async (db: DbConnection) =>
    (await db.select().from(schema.timeline_routes).all()).length;

const session = () => usePathPenStore.getState().session;
const resolver = () => useTimelineResolverStore.getState().resolver!;
const marcher = (id: number) =>
    ({ id, drill_number: `M${id}`, type: "marcher" }) as unknown as Marcher;

/** The show converted, the resolver running, an own path for the first marcher on page 2's move */
const setUp = async (
    db: DbConnection,
    wrapper: (p: { children: React.ReactNode }) => React.JSX.Element,
) => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    await timelineResolverSettled();
    const timeline = await page2(db);
    const [m1, m2] = resolver().marcherIds();
    const A = resolver().positionAt(m1!, 9) as XY;
    const { routeId } = await drawRoute({
        db,
        timelineId: timeline.id,
        marcherId: m1!,
        points: [{ at: [A[0] + 30, A[1] - 40] }],
    });
    await timelineResolverSettled();
    act(() => {
        useTimelineSelectionStore.setState({ playheadBeat: 12 });
    });
    const hook = renderHook(
        () => {
            usePathPenActions();
            PathPenKeys();
            return {
                selection: useSelectedMarchers()!,
                playing: useIsPlaying()!,
            };
        },
        { wrapper },
    );
    const select = (ids: number[]) => {
        act(() => {
            hook.result.current.selection.setSelectedMarchers(ids.map(marcher));
        });
    };
    /** A click on route `id`'s line, as `takeClick` does it: active at once, its walkers selected */
    const activate = async (id: number, walkers: number[]) => {
        const target = (await findRouteTarget(db, resolver(), id, new Map()))!;
        act(() => {
            activatePath(target, "x", null, true);
            hook.result.current.selection.setSelectedMarchers(
                walkers.map(marcher),
            );
        });
        await waitFor(() => expect(session()?.phase).toBe("open"));
    };
    return { timeline, m1: m1!, m2: m2!, A, routeId, hook, select, activate };
};

afterEach(() => {
    cleanup();
    act(() => clearPath());
    stopTimelineResolver();
});

describeDbTests(
    "usePathPenActions: quiet and active paths (interaction system, rules 1 and 2)",
    (it) => {
        it("a click's activation outlasts the read for the walkers it selected", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, routeId, activate } = await setUp(db, wrapper);
            await activate(routeId, [m1]);
            // The read for the new selection has landed: still active, nothing left to open
            await waitFor(() =>
                expect(usePathPenStore.getState().openRoute).toBeNull(),
            );
            expect(session()).toMatchObject({ phase: "open", object: false });
            expect(session()!.target.routeId).toBe(routeId);
        });

        it("stays active across an edit, an undo and a redo", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, A, routeId, activate } = await setUp(db, wrapper);
            await activate(routeId, [m1]);
            const drawn = await routeOf(db, routeId);
            const moved: XY = [A[0] + 50, A[1] - 60];
            await editPathPoints({
                db,
                routeId,
                points: [{ id: drawn.points[0]!.id, at: moved }],
            });
            await waitFor(() =>
                expect(session()!.target.points[0]!.at).toEqual(moved),
            );
            expect((await performUndo(db)).success).toBe(true);
            await waitFor(() =>
                expect(session()!.target.points).toEqual(drawn.points),
            );
            expect(session()!.phase).toBe("open");
            expect((await performRedo(db)).success).toBe(true);
            await waitFor(() =>
                expect(session()!.target.points[0]!.at).toEqual(moved),
            );
            expect(session()).toMatchObject({ phase: "open", object: false });
        });

        it("selecting a marcher by its dot shows its path quiet; Enter makes it active", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, routeId, select } = await setUp(db, wrapper);
            select([m1]);
            await waitFor(() =>
                expect(session()?.target.routeId).toBe(routeId),
            );
            expect(session()!.phase).toBe("closed");
            // Quiet: Delete removes nothing, Edit path and Enter are offered
            expect(isActionEnabled("shapeRemoveLastPoint")).toBe(false);
            expect(isActionEnabled("editPath")).toBe(true);
            act(() => void runAction("applyShape"));
            expect(session()!.phase).toBe("open");
        });

        it("goes when the selection moves off its marcher, so a Delete then removes nothing", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, m2, routeId, select, activate } = await setUp(
                db,
                wrapper,
            );
            await activate(routeId, [m1]);
            select([m2]);
            await waitFor(() => expect(session()).toBeNull());
            await act(async () => void runAction("shapeRemoveLastPoint"));
            expect(await routeCount(db)).toBe(1);
        });

        it("Delete on the active path with no point selected removes it, with a toast and Undo (Q7)", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, routeId, activate } = await setUp(db, wrapper);
            await activate(routeId, [m1]);
            const success = vi.spyOn(toast, "success");
            try {
                await act(async () => void runAction("shapeRemoveLastPoint"));
                await waitFor(() => expect(success).toHaveBeenCalled());
                expect(success.mock.calls[0]![0]).toBe("Path removed");
                expect(
                    (success.mock.calls[0]![1] as { action: { label: string } })
                        .action.label,
                ).toBe("Undo");
                expect(await routeCount(db)).toBe(0);
            } finally {
                success.mockRestore();
            }
        });

        it("is cleared on playback", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { m1, routeId, hook, activate } = await setUp(db, wrapper);
            await activate(routeId, [m1]);
            act(() => {
                hook.result.current.playing.setIsPlaying(true);
            });
            expect(session()).toBeNull();
        });

        it("a group path: Detach on the quiet path for the members selected; a lane let go when its marcher is selected away", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { timeline, m2, A, select } = await setUp(db, wrapper);
            const [, , m3] = resolver().marcherIds();
            const { routeId } = await drawGroupRoute({
                db,
                timelineId: timeline.id,
                marcherIds: [m2, m3!],
                points: [{ at: [A[0] + 10, A[1] + 10] }],
            });
            await timelineResolverSettled();
            select([m2, m3!]);
            await waitFor(() =>
                expect(session()?.target.routeId).toBe(routeId),
            );
            expect(session()!.phase).toBe("closed");
            await waitFor(() =>
                expect(isActionEnabled("detachPath")).toBe(true),
            );
            // Nobody's adjusted: no Reset adjustment
            expect(isActionEnabled("adjustResetSpot")).toBe(false);
            // A lane click: that marcher selected, its lane picked, the path active
            act(() => {
                activatePath(session()!.target, "2", m2);
            });
            select([m2]);
            await new Promise((r) => setTimeout(r, 50));
            expect(session()).toMatchObject({
                phase: "open",
                lane: { marcherId: m2, key: null },
            });
            select([m3!]);
            await waitFor(() => expect(session()?.lane ?? null).toBeNull());
            expect(session()!.phase).toBe("open");
        });
    },
);

describeDbTests(
    "usePathPenActions: drawing again from the open path (AP-O8, N5)",
    (it) => {
        it("P on the open group path, opened through one member, draws the group path again by its route", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { timeline, m1, m2, A, select } = await setUp(db, wrapper);
            const [, , m3] = resolver().marcherIds();
            const { routeId } = await drawGroupRoute({
                db,
                timelineId: timeline.id,
                marcherIds: [m2, m3!],
                points: [{ at: [A[0] + 10, A[1] + 10] }],
            });
            await timelineResolverSettled();
            expect(m1).not.toBe(m2);
            // One member selected: its group path is shown; Edit path opens it
            select([m2]);
            await waitFor(() =>
                expect(session()?.target.routeId).toBe(routeId),
            );
            act(() => void openPath());
            expect(session()!.phase).toBe("open");
            const routes = await routeCount(db);

            act(() => void runAction("pathPen"));
            expect(session()).toMatchObject({
                phase: "drawing",
                byRoute: true,
            });
            expect(session()!.target.routeId).toBe(routeId);
            act(() => addPoint({ x: A[0] - 20, y: A[1] + 30 }));
            await act(() => finishDrawing());

            // The same group path, drawn again: no own path for the member selected
            const after = await routeOf(db, routeId);
            expect(after.points.map((p) => p.at)).toEqual([
                [A[0] - 20, A[1] + 30],
            ]);
            expect(await routeCount(db)).toBe(routes);
            await waitFor(() => expect(session()?.target.group).not.toBeNull());
            expect(session()!.target.routeId).toBe(routeId);
        });

        it("P with the path only shown (closed) for the member is still the personal draw", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { timeline, m2, A, select } = await setUp(db, wrapper);
            const [, , m3] = resolver().marcherIds();
            const { routeId } = await drawGroupRoute({
                db,
                timelineId: timeline.id,
                marcherIds: [m2, m3!],
                points: [{ at: [A[0] + 10, A[1] + 10] }],
            });
            await timelineResolverSettled();
            select([m2]);
            await waitFor(() =>
                expect(session()?.target.routeId).toBe(routeId),
            );
            act(() => void runAction("pathPen"));
            await waitFor(() => expect(session()?.phase).toBe("drawing"));
            // The member's own move, no route of its own yet (AP-R1)
            expect(session()!.byRoute).toBe(false);
            expect(session()!.target.routeId).toBeNull();
            expect(session()!.target.marcherId).toBe(m2);
        });
    },
);

describeDbTests("usePathPenActions: Follow (Shift+L)", (it) => {
    it("on exactly a trail's line draws that trail again (step 4's Again, AP-T1/AP-T2), not the Follow tool's drag", async ({
        db,
        wrapper,
        marchersAndPages: _,
    }) => {
        const { timeline, A, select } = await setUp(db, wrapper);
        const [, m2, m3, m4] = resolver().marcherIds();
        const line = [m2!, m3!, m4!];
        const { routeId } = await followTrail({
            db,
            timelineId: timeline.id,
            marcherIds: line,
            points: [{ at: [A[0] + 20, A[1] + 40] }],
        });
        await timelineResolverSettled();
        expect(
            (await readTrails(db, timeline.id)).find(
                (t) => t.routeId === routeId,
            ),
        ).toBeDefined();
        act(() => clearPath());
        select(line);
        act(() => void runAction("followTrail"));
        await waitFor(() => expect(session()?.phase).toBe("drawing"));
        // The stored trail, drawn again by its route; not the Follow tool's pulsing ends
        expect(session()!.follow ?? null).toBeNull();
        expect(session()!.target.routeId).toBe(routeId);
        expect(
            session()!
                .target.trail!.members.map((m) => m.marcherId)
                .sort(),
        ).toEqual([...line].sort());
    });
});

describeDbTests(
    "usePathPenActions: the Follow tool's Ends (step 9, RP-1)",
    (it) => {
        it("From trail, Keep end spots and Ripple in are commands; Ripple in says why when it's off", async ({
            db,
            wrapper,
            marchersAndPages: _,
        }) => {
            const { select } = await setUp(db, wrapper);
            // The drawing is for the selected marchers; it goes when they're let go of
            select([1, 2]);
            const at = (x: number) => ({ x, y: 0 });
            const open = (form: boolean, keep = true) =>
                act(() =>
                    usePathPenStore.setState({
                        session: {
                            phase: "drawing",
                            target: {
                                timelineId: -1,
                                transitionId: -1,
                                marcherId: 2,
                                start: 9,
                                end: 17,
                                from: at(0),
                                to: at(0),
                                routeId: null,
                                points: [],
                                ends: null,
                                group: null,
                                trail: {
                                    members: [1, 2].map((id) => ({
                                        marcherId: id,
                                        drill: `M${id}`,
                                        from: at(id),
                                        to: at(id),
                                    })),
                                    leaderId: 2,
                                    reverse: false,
                                },
                            },
                            drill: "2",
                            points: [],
                            pointer: null,
                            selected: null,
                            dragging: null,
                            object: false,
                            byRoute: false,
                            follow: {
                                window: { start: 9, end: 17 },
                                ids: [1, 2],
                                order: [1, 2],
                                starts: new Map([
                                    [1, at(0)],
                                    [2, at(2)],
                                ]),
                                grabbed: null,
                                spacing: { kind: "keep" },
                                ends: "trail",
                                keep: keep
                                    ? {
                                          timelineId: 7,
                                          start: 9,
                                          end: 17,
                                          spots: new Map([
                                              [1, { x: 0, y: 10 }],
                                              [2, { x: 2, y: 10 }],
                                          ]),
                                      }
                                    : null,
                                form: form
                                    ? {
                                          ids: [1, 2],
                                          spots: [
                                              [0, 10],
                                              [2, 10],
                                          ],
                                      }
                                    : null,
                                formWhy: form ? null : "a loop",
                                step: 1,
                            },
                        },
                    }),
                );
            open(true);
            await waitFor(() =>
                expect(isActionEnabled("followEndsRipple")).toBe(true),
            );
            act(() => void runAction("followEndsRipple"));
            expect(session()!.follow!.ends).toBe("ripple");
            act(() => void runAction("followEndsKeep"));
            expect(session()!.follow!.ends).toBe("keep");
            act(() => void runAction("followEndsTrail"));
            expect(session()!.follow!.ends).toBe("trail");
            open(false);
            await waitFor(() =>
                expect(isActionEnabled("followEndsRipple")).toBe(false),
            );
            expect(actionDisabledReason("followEndsRipple")).toBe("a loop");
            open(false, false);
            await waitFor(() =>
                expect(actionDisabledReason("followEndsRipple")).toMatch(
                    /end spots/,
                ),
            );
            expect(isActionEnabled("followEndsKeep")).toBe(false);
        });
    },
);

vi.setConfig({ testTimeout: 30000 });
