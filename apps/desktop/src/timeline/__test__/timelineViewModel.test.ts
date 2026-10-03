// cspell:ignore NONFOUNDING
import { describe, expect, it } from "vitest";
import {
    createResolver,
    type TimelineSnapshot,
    type XY,
} from "@openmarch/core";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import {
    createTimelineViewModel,
    type TimelineInput,
} from "@/components/timeline/Timeline";
import { validateTimelineViewModel } from "@/components/timeline/TimelineGeometry";
import { planPageConversion } from "../convert/planPageConversion";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { sc11 } from "../fixtures/scenarioFixtures";
import { resolverSpans } from "../timelineStore";
import {
    buildTimelineTracks,
    createTimelineBeatAxis,
    marcherTrackId,
    shapeTrackId,
    timelineInputToView,
    type TimelineTrackFilter,
    type TimelineViewTables,
} from "../timelineViewModel";

/**
 * The view-model adapter (docs/timeline/phases/08-authoring-ui.md P8.8, ui.md "Mapping the spec
 * onto the view model") on the golden vectors (spec §12.4). The fixtures put every transition on
 * one timeline; `timelines` splits them to show steals across timelines (UI-1).
 */

const golden = (name: string): TimelineSnapshot => {
    const fixture = GOLDEN_FIXTURES.find((f) => f.name === name);
    if (!fixture) throw new Error(`no golden fixture ${name}`);
    return fixture.build().show;
};

/** The tables for `show`, with each timeline holding the listed transitions (default: one). */
const tablesOf = (
    show: TimelineSnapshot,
    timelines: Record<number, number[]> = {
        1: Object.keys(show.transitions).map(Number),
    },
): TimelineViewTables => {
    const timelineOf = new Map<number, number>();
    for (const [id, transitions] of Object.entries(timelines))
        for (const t of transitions) timelineOf.set(t, Number(id));
    const transitions = Object.values(show.transitions);
    return {
        timelines: Object.entries(timelines).map(([id, ids]) => {
            const own = transitions.filter((t) => ids.includes(t.id));
            return {
                id: Number(id),
                name: `Timeline ${id}`,
                start: Math.min(...own.map((t) => t.start)),
                end: Math.max(...own.map((t) => t.end)),
            };
        }),
        transitions: transitions.map((t) => ({
            id: t.id,
            timelineId: timelineOf.get(t.id)!,
            destShapeId: t.dest,
            slotCount: t.slots,
            start: t.start,
            end: t.end,
        })),
        assignments: show.assignments,
        shapes: Object.keys(show.shapes).map((id) => ({
            id: Number(id),
            name: `S${id}`,
        })),
        marchers: show.marchers.map((m) => ({ id: m.id, label: `M${m.id}` })),
    };
};

const ALL: TimelineTrackFilter = { kind: "all" };
const selecting = (...ids: number[]): TimelineTrackFilter => ({
    kind: "default",
    selectedMarcherIds: new Set(ids),
});

const build = (
    show: TimelineSnapshot,
    filter: TimelineTrackFilter,
    timelines?: Record<number, number[]>,
) => {
    const resolver = createResolver(show);
    return buildTimelineTracks(
        {
            tables: tablesOf(show, timelines),
            spansOf: (m) => resolverSpans(resolver, m),
            diagnostics: resolver.diagnostics(),
        },
        filter,
    );
};

const track = (tracks: TimelineInput[], id: string) => {
    const found = tracks.find((t) => t.id === id);
    if (!found)
        throw new Error(
            `no track ${id}; have ${tracks.map((t) => t.id).join(", ")}`,
        );
    return found;
};

/** Activity as `[start, end, active]` triples */
const activity = (t: TimelineInput) =>
    t.activitySpans.map((s) => [s.startBeatIndex, s.endBeatIndex, s.active]);

/** Legs as `[start, end, texture]` triples */
const legs = (t: TimelineInput) =>
    t.legs.map((l) => [l.startBeatIndex, l.endBeatIndex, l.texture]);

const codes = (t: TimelineInput) =>
    (t.diagnostics?.messages ?? []).map((m) => m.split(":")[0]);

/** A show's beats as the app has them: the zero-length beat 0, then `count` timed beats */
const appBeats = (count: number): Beat[] =>
    Array.from({ length: count + 1 }, (_, index) => ({
        id: index + 1,
        position: index,
        duration: index === 0 ? 0 : 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index === 0 ? 0 : (index - 1) * 0.5,
    }));

/** The view model the timeline would draw, on the app's beat axis */
const viewModelOf = (tracks: TimelineInput[], beatCount: number) => {
    const beats = appBeats(beatCount);
    const axis = createTimelineBeatAxis(beats);
    return createTimelineViewModel({
        beats,
        pages: [],
        measures: [],
        timelines: tracks,
        waveform: {
            peaksByBeat: Array.from({ length: axis.beatCount }, () => []),
        },
    });
};

describe("buildTimelineTracks", () => {
    describe("steals (UI-1)", () => {
        it("G2 on one timeline: the steal stays inside the marcher's clip, so it is all active", () => {
            const tracks = build(golden("G2"), ALL);
            const m1 = track(tracks, marcherTrackId(1, 1));
            expect(m1.startBeatIndex).toBe(0);
            expect(m1.endBeatIndex).toBe(16);
            expect(legs(m1)).toEqual([
                [0, 8, "move"],
                [8, 16, "move"],
            ]);
            expect(activity(m1)).toEqual([[0, 16, true]]);
        });

        it("G2 across timelines: the layer-1 row steals [8, 16) from the first timeline's clip", () => {
            const tracks = build(golden("G2"), ALL, { 1: [1], 2: [2] });
            const first = track(tracks, marcherTrackId(1, 1));
            expect(legs(first)).toEqual([
                [0, 8, "move"],
                [8, 16, "move"],
            ]);
            expect(activity(first)).toEqual([
                [0, 8, true],
                [8, 16, false],
            ]);
            const steal = track(tracks, marcherTrackId(2, 1));
            expect(activity(steal)).toEqual([[8, 16, true]]);
            expect(first.linkId).toBe(1);
            expect(steal.linkId).toBe(2);
            expect(first.color).not.toBe(steal.color);
        });

        it("a marcher that joins late: the clip is its whole timeline, inactive until it joins (UI-8)", () => {
            const show = structuredClone(golden("G2"));
            const row = show.assignments.find(
                (a) => a.marcher === 1 && a.transition === 1,
            )!;
            row.start = 4;
            const tracks = build(show, ALL, { 1: [1], 2: [2] });
            const first = track(tracks, marcherTrackId(1, 1));
            expect([first.startBeatIndex, first.endBeatIndex]).toEqual([0, 16]);
            expect(activity(first)).toEqual([
                [0, 4, false],
                [4, 8, true],
                [8, 16, false],
            ]);
        });

        it("G2's shape tracks: the first shape is inactive once its only member is stolen", () => {
            const tracks = build(golden("G2"), selecting());
            expect(tracks.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                shapeTrackId(1, 2),
            ]);
            expect(activity(tracks[0]!)).toEqual([
                [0, 8, true],
                [8, 16, false],
            ]);
            expect(legs(tracks[0]!)).toEqual([[0, 16, "move"]]);
            expect(activity(tracks[1]!)).toEqual([[8, 16, true]]);
        });

        it("G3: stacked steals over three timelines, with resumes", () => {
            const tracks = build(golden("G3"), ALL, {
                1: [1],
                2: [2],
                3: [3],
            });
            const a = track(tracks, marcherTrackId(1, 1));
            expect(legs(a)).toEqual([
                [0, 4, "move"],
                [4, 6, "move"],
                [6, 10, "move"],
                [10, 12, "move"],
                [12, 16, "move"],
            ]);
            expect(activity(a)).toEqual([
                [0, 4, true],
                [4, 12, false],
                [12, 16, true],
            ]);
            const b = track(tracks, marcherTrackId(2, 1));
            expect([b.startBeatIndex, b.endBeatIndex]).toEqual([4, 12]);
            expect(activity(b)).toEqual([
                [4, 6, true],
                [6, 10, false],
                [10, 12, true],
            ]);
            expect(activity(track(tracks, marcherTrackId(3, 1)))).toEqual([
                [6, 10, true],
            ]);
        });

        it("G12: the stolen leader's track goes inactive for the steal; the shape track stays active", () => {
            const tracks = build(golden("G12"), selecting(4), {
                1: [1, 2],
                2: [5],
            });
            const leader = track(tracks, marcherTrackId(1, 4));
            expect([leader.startBeatIndex, leader.endBeatIndex]).toEqual([
                0, 12,
            ]);
            expect(activity(leader)).toEqual([
                [0, 6, true],
                [6, 8, false],
                [8, 12, true],
            ]);
            expect(legs(leader).map((l) => l[2])).not.toContain("hold");
            // The other three members are still in the follow-the-leader move
            expect(activity(track(tracks, shapeTrackId(1, 2)))).toEqual([
                [4, 12, true],
            ]);
            expect(activity(track(tracks, marcherTrackId(2, 4)))).toEqual([
                [6, 8, true],
            ]);
            // Unselected members have no marcher track
            expect(tracks.some((t) => t.id === marcherTrackId(1, 1))).toBe(
                false,
            );
        });

        it("G4: a gap between two moves of one timeline is a hold leg and inactive", () => {
            const m1 = track(build(golden("G4"), ALL), marcherTrackId(1, 1));
            expect(legs(m1)).toEqual([
                [0, 8, "move"],
                [8, 12, "hold"],
                [12, 20, "move"],
            ]);
            expect(activity(m1)).toEqual([
                [0, 8, true],
                [8, 12, false],
                [12, 20, true],
            ]);
        });
    });

    describe("shape tracks", () => {
        it("one per timeline and destination shape, over the transitions into it", () => {
            const show = golden("G13");
            const tracks = build(show, selecting());
            const shape = track(tracks, shapeTrackId(1, 1));
            expect(shape).toMatchObject({
                targetId: 1,
                targetType: "shape",
                label: "S1",
                linkId: 1,
                startBeatIndex: 8,
                endBeatIndex: 16,
            });
            expect(legs(shape)).toEqual([[8, 16, "move"]]);
            // Marcher 2 is stolen for [12, 16), but marchers 1 and 3 still move into the shape
            expect(activity(shape)).toEqual([[8, 16, true]]);
        });

        it("two moves into the same shape with a gap give one clip with a hold leg between", () => {
            const show = golden("G4");
            show.transitions[2] = { ...show.transitions[2]!, dest: 1 };
            const shape = track(build(show, selecting()), shapeTrackId(1, 1));
            expect(legs(shape)).toEqual([
                [0, 8, "move"],
                [8, 12, "hold"],
                [12, 20, "move"],
            ]);
            expect(activity(shape)).toEqual([
                [0, 8, true],
                [8, 12, false],
                [12, 20, true],
            ]);
        });
    });

    describe("shape clips split around other shapes", () => {
        it("a gap filled by another shape's move starts a new clip", () => {
            const show = golden("G4");
            // T1 [0, 8) and T2 [12, 20) both into shape 1; T3 [8, 12) into shape 2 fills the gap
            show.transitions[2] = { ...show.transitions[2]!, dest: 1 };
            show.transitions[3] = {
                id: 3,
                start: 8,
                end: 12,
                dest: 2,
                slots: 1,
                style: "direct",
                order: "inherit",
                params: null,
            };
            const tracks = build(show, selecting());
            expect(tracks.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                `${shapeTrackId(1, 1)}-1`,
                shapeTrackId(1, 2),
            ]);
            expect(legs(tracks[0]!)).toEqual([[0, 8, "move"]]);
            expect(legs(tracks[1]!)).toEqual([[12, 20, "move"]]);
        });
    });

    describe("default track set (U-Q1)", () => {
        it("shows shape tracks, individually moved marchers and the selection", () => {
            const show = golden("G13");
            // Marcher 3 moves alone in T3 and marcher 2 in T4 (one-slot, no shape); T1 is a
            // three-slot shapeless group move, which alone doesn't make a marcher individual
            expect(build(show, selecting()).map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                marcherTrackId(1, 2),
                marcherTrackId(1, 3),
            ]);
            expect(build(show, selecting(1)).map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                marcherTrackId(1, 1),
                marcherTrackId(1, 2),
                marcherTrackId(1, 3),
            ]);
        });

        it("asks the resolver only for the marchers it shows", () => {
            const show = golden("G13");
            const resolver = createResolver(show);
            const asked: number[] = [];
            buildTimelineTracks(
                {
                    tables: tablesOf(show),
                    spansOf: (m) => {
                        asked.push(m);
                        return resolverSpans(resolver, m);
                    },
                    diagnostics: [],
                },
                selecting(),
            );
            // Shape 1's members are 1, 2 and 3; each is asked once
            expect(asked.sort()).toEqual([1, 2, 3]);
        });
    });

    describe("diagnostics badges (§8.9)", () => {
        it("G9: a vacant slot badges the shape track, not every member's track", () => {
            const tracks = build(golden("G9"), selecting(2));
            const ftl = track(tracks, shapeTrackId(1, 2));
            expect(ftl.diagnostics?.level).toBe("warning");
            expect(codes(ftl)).toContain("D-VACANT");
            expect(codes(track(tracks, marcherTrackId(1, 2)))).not.toContain(
                "D-VACANT",
            );
            // G9 drops marcher 1 from both moves, so the line's transition has a vacancy too
            expect(codes(track(tracks, shapeTrackId(1, 1)))).toEqual([
                "D-VACANT",
            ]);
        });

        it("G11: a non-founding follow-the-leader span badges its marcher, not the others", () => {
            const tracks = build(golden("G11"), selecting(1, 2));
            expect(codes(track(tracks, shapeTrackId(1, 2)))).toContain(
                "D-FTL-NONFOUNDING",
            );
            expect(codes(track(tracks, marcherTrackId(1, 1)))).toContain(
                "D-FTL-NONFOUNDING",
            );
            expect(
                track(tracks, marcherTrackId(1, 2)).diagnostics,
            ).toBeUndefined();
        });

        it("a vacancy in a transition without a shape badges one marcher track only", () => {
            const show = golden("G13");
            // T1 is shapeless with three slots; drop slot 1's marcher (2)
            show.assignments = show.assignments.filter(
                (r) => !(r.transition === 1 && r.marcher === 2),
            );
            const tracks = build(show, ALL);
            const vacant = tracks.filter((t) => codes(t).includes("D-VACANT"));
            expect(vacant.map((t) => t.id)).toEqual([marcherTrackId(1, 1)]);
        });

        it("G1 has no diagnostics and no badge", () => {
            for (const t of build(golden("G1"), ALL))
                expect(t.diagnostics).toBeUndefined();
        });
    });

    it("a converted page show gives linked clips, one timeline for all", () => {
        const pages = [
            { id: 100, name: "1", order: 0, beats: [{ index: 0 }] },
            {
                id: 101,
                name: "2",
                order: 1,
                beats: [1, 2, 3, 4].map((index) => ({ index })),
            },
            {
                id: 102,
                name: "3",
                order: 2,
                beats: [5, 6, 7, 8].map((index) => ({ index })),
            },
        ];
        let rowId = 1;
        const plan = planPageConversion({
            pages,
            marcherIds: [1, 2, 3],
            marcherPages: pages.flatMap((page, p) =>
                [1, 2, 3].map((marcher_id) => ({
                    id: rowId++,
                    marcher_id,
                    page_id: page.id,
                    x: marcher_id * 2 + p,
                    y: p,
                    path_data_id: null,
                })),
            ),
        });
        let assignmentId = 1;
        const show: TimelineSnapshot = {
            marchers: plan.homes.map((h) => ({
                id: h.marcherId,
                home: h.home,
            })),
            shapes: {},
            transitions: Object.fromEntries(
                plan.transitions.map((t, i) => [
                    i + 1,
                    {
                        id: i + 1,
                        start: t.startBeat,
                        end: t.endBeat,
                        dest: null,
                        points: t.points as XY[],
                        slots: t.marcherIds.length,
                        style: "direct",
                        order: "inherit",
                        params: null,
                    },
                ]),
            ),
            assignments: plan.transitions.flatMap((t, i) =>
                t.marcherIds.map((marcher, slot) => ({
                    id: assignmentId++,
                    marcher,
                    transition: i + 1,
                    slot,
                    start: t.startBeat,
                    end: t.endBeat,
                    layer: 0,
                })),
            ),
        };

        const all = build(show, ALL);
        expect(all.map((t) => t.id)).toEqual(
            [1, 2, 3].map((m) => marcherTrackId(1, m)),
        );
        for (const t of all) {
            expect(t.linkId).toBe(1);
            expect([t.startBeatIndex, t.endBeatIndex]).toEqual([1, 9]);
            expect(legs(t)).toEqual([
                [1, 5, "move"],
                [5, 9, "move"],
            ]);
            expect(activity(t)).toEqual([[1, 9, true]]);
        }
        expect(new Set(all.map((t) => t.color)).size).toBe(1);
        // Page moves are group moves: by default only the selection shows
        expect(build(show, selecting()).map((t) => t.id)).toEqual([]);
        expect(build(show, selecting(2)).map((t) => t.id)).toEqual([
            marcherTrackId(1, 2),
        ]);
        // On the view axis the clips start at view beat 0, right after the initial page
        const model = viewModelOf(all, 8);
        expect(
            model.tracks[0]!.legs.map((l) => [l.startBeat, l.endBeat]),
        ).toEqual([
            [0, 4],
            [4, 8],
        ]);
    });

    it("performance smoke: SC-11, the default set plus a 20-marcher selection", () => {
        const fixture = sc11(1);
        const timelines = Object.fromEntries(
            (fixture.timelines ?? []).map((t) => [t.id, t.transitions]),
        );
        const resolver = createResolver(fixture.show);
        const tables = tablesOf(fixture.show, timelines);
        const selected = new Set(
            fixture.show.marchers.slice(0, 20).map((m) => m.id),
        );
        const start = performance.now();
        const tracks = buildTimelineTracks(
            {
                tables,
                spansOf: (m) => resolverSpans(resolver, m),
                diagnostics: resolver.diagnostics(),
            },
            { kind: "default", selectedMarcherIds: selected },
        );
        const elapsed = performance.now() - start;
        // eslint-disable-next-line no-console
        console.info(
            `SC-11 tracks: ${tracks.length} built in ${elapsed.toFixed(1)} ms`,
        );
        expect(tracks.length).toBeGreaterThan(20);
        // Generous: catches a regression to per-span explain() walks, not machine noise
        expect(elapsed).toBeLessThan(250);
        const end = Math.max(
            ...Object.values(fixture.show.transitions).map((t) => t.end),
        );
        expect(validateTimelineViewModel(viewModelOf(tracks, end))).toEqual([]);
    });

    it("every golden fixture's tracks pass the view model's validator", () => {
        for (const fixture of GOLDEN_FIXTURES) {
            const show = fixture.build().show;
            const tracks = build(show, ALL);
            expect(tracks.length, fixture.name).toBeGreaterThan(0);
            const end = Math.max(
                ...Object.values(show.transitions).map((t) => t.end),
            );
            // Beats [0, 1) are hidden on the view axis; a fixture's clips from beat 0 keep the rest
            expect(
                validateTimelineViewModel(viewModelOf(tracks, end)),
                fixture.name,
            ).toEqual([]);
        }
    });
});

describe("resolverSpans", () => {
    it("walks a marcher's spans through explain: spec R-2's worked example (G3)", () => {
        const resolver = createResolver(golden("G3"));
        expect(
            resolverSpans(resolver, 1).map((s) => [
                s.start,
                s.end,
                s.kind,
                s.transitionId,
            ]),
        ).toEqual([
            [-Infinity, 0, "hold", null],
            [0, 4, "founding", 1],
            [4, 6, "founding", 2],
            [6, 10, "founding", 3],
            [10, 12, "resume", 2],
            [12, 16, "resume", 1],
            [16, Infinity, "hold", null],
        ]);
    });

    it("is empty for a marcher the resolver doesn't have", () => {
        expect(resolverSpans(createResolver(golden("G1")), 99)).toEqual([]);
    });
});

describe("the view beat axis (beat 0)", () => {
    it("hides the zero-length beat 0: view beat v is spec beat v + 1", () => {
        const axis = createTimelineBeatAxis(appBeats(8));
        expect(axis.offset).toBe(1);
        expect(axis.beatCount).toBe(8);
        expect(axis.toView(1)).toBe(0);
        expect(axis.toView(0)).toBe(0);
        expect(axis.toView(0.5)).toBe(0);
        expect(axis.toView(9)).toBe(8);
        expect(axis.toSpec(0)).toBe(1);
    });

    it("maps beats one to one when there is no zero-length beat 0", () => {
        const axis = createTimelineBeatAxis([
            { duration: 0.5 },
            { duration: 0.5 },
        ]);
        expect(axis.offset).toBe(0);
        expect(axis.beatCount).toBe(2);
        expect(axis.toView(1)).toBe(1);
    });

    it("drops what falls inside beat 0 and merges the activity around it", () => {
        const axis = createTimelineBeatAxis(appBeats(8));
        const view = timelineInputToView(
            {
                id: "t",
                targetId: 1,
                targetType: "marcher",
                label: "M1",
                color: "#000",
                startBeatIndex: 0,
                endBeatIndex: 6,
                legs: [
                    {
                        id: "a",
                        startBeatIndex: 0,
                        endBeatIndex: 1,
                        texture: "move",
                    },
                    {
                        id: "b",
                        startBeatIndex: 1,
                        endBeatIndex: 6,
                        texture: "move",
                    },
                ],
                activitySpans: [
                    { startBeatIndex: 0, endBeatIndex: 1, active: false },
                    { startBeatIndex: 1, endBeatIndex: 6, active: true },
                ],
            },
            axis,
        );
        expect(view?.legs.map((l) => l.id)).toEqual(["b"]);
        expect(view?.activitySpans).toEqual([
            { startBeatIndex: 0, endBeatIndex: 5, active: true },
        ]);
    });

    it("a track entirely inside beat 0 is dropped", () => {
        const axis = createTimelineBeatAxis(appBeats(4));
        expect(
            timelineInputToView(
                {
                    id: "t",
                    targetId: 1,
                    targetType: "marcher",
                    label: "M1",
                    color: "#000",
                    startBeatIndex: 0,
                    endBeatIndex: 1,
                    legs: [
                        {
                            id: "a",
                            startBeatIndex: 0,
                            endBeatIndex: 1,
                            texture: "move",
                        },
                    ],
                    activitySpans: [
                        { startBeatIndex: 0, endBeatIndex: 1, active: true },
                    ],
                },
                axis,
            ),
        ).toBeNull();
    });

    it("puts the first timed page at view beat 0, with the initial page before it", () => {
        const beats = appBeats(8);
        const page = (
            id: number,
            name: string,
            pageBeats: Beat[],
            previousPageId: number | null,
            counts: number,
        ) =>
            ({
                id,
                name,
                beats: pageBeats,
                previousPageId,
                counts,
            }) as unknown as Page;
        const model = createTimelineViewModel({
            beats,
            pages: [
                page(1, "1", [beats[0]!], null, 0),
                page(2, "2", beats.slice(1, 5), 1, 4),
                page(3, "3", beats.slice(5, 9), 2, 4),
            ],
            measures: [],
            timelines: [],
            waveform: { peaksByBeat: Array.from({ length: 8 }, () => []) },
        });
        expect(model.beatCount).toBe(8);
        expect(
            model.pages.map((p) => [p.label, p.atBeat, p.isInitial]),
        ).toEqual([
            ["1", 0, true],
            ["2", 0, false],
            ["3", 4, false],
        ]);
        expect(validateTimelineViewModel(model)).toEqual([]);
    });
});
