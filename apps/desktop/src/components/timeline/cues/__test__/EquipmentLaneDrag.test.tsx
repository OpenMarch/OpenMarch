import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { DatabaseCue } from "@/db-functions/cues";
import type { CueEdit } from "@/hooks/queries/useCues";
import type Marcher from "@/global/classes/Marcher";
import { compileShowCues } from "@/cues/showCues";
import { equipmentLane } from "@/cues/equipmentLane";
import { useCueSelectionStore } from "@/cues/cueSelectionStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    notifyActionHandlersChanged,
    registerActionHandler,
} from "@/shortcuts/registry";
import { EquipmentLaneView } from "../EquipmentLane";
import { useTimelinePointer } from "../../TimelinePrimitives";
import type { TimelineBeatRange } from "../../TimelineViewModel";

// The edits a drag writes, instead of the database
const written: CueEdit[] = [];
vi.mock("@/hooks/queries/useCues", async (original) => ({
    ...(await original<typeof import("@/hooks/queries/useCues")>()),
    editCuesMutationOptions: () => ({
        mutationFn: async (edit: CueEdit) => {
            written.push(edit);
        },
    }),
}));

/**
 * The simulated users' timeline (fork #992 follow-up): 16 px a count, four counts a measure, page
 * flags every 8. Beat ids are 100 + count; spec beat 0 is home. Two guard members take rifles on
 * count 4 and flags on count 12.
 */
const PPB = 16;
const COUNTS = 48;
const beats = [
    { id: 1, position: 0, duration: 0 },
    ...Array.from({ length: COUNTS }, (_, c) => ({
        id: 100 + c,
        position: c + 1,
        duration: 0.5,
    })),
];
const marchers = [1, 2].map(
    (id) =>
        ({
            id,
            section: "Color Guard",
            drill_prefix: "G",
            drill_order: id,
            name: "",
            type: "marcher",
        }) as unknown as Marcher,
);
const cue = (id: number, count: number, value: string): DatabaseCue => ({
    id,
    type: "equipment",
    beatId: 100 + count,
    value: `builtin:equipment.${value}`,
    settings: {},
    length: null,
    transition: null,
    marcherIds: [1, 2],
    label: null,
    notes: null,
    createdAt: `2026-11-24 10:00:0${id}`,
    updatedAt: "",
});
/** Spec beat of a count: count c is spec beat c + 1 (spec beat 0 is home) */
const spec = (count: number) => count + 1;
const pageBeats = [0, spec(8), spec(16), spec(24), spec(32), spec(40)];
const downbeats = Array.from({ length: 12 }, (_, m) => spec(m * 4));

const snapBeats = [...new Set([...pageBeats, ...downbeats])];
/** The timeline's pointer surface around the lanes: its click and scrub, as on the audio lane */
function Surface({
    onSeek,
    children,
}: {
    onSeek: (beat: number) => void;
    children: ReactNode;
}) {
    const pointer = useTimelinePointer({
        onSeek,
        pixelsPerBeat: PPB,
        beatCount: beats.length,
        seekSnapBeats: snapBeats,
        snapBeats: pageBeats,
    });
    return (
        <div
            data-testid="timeline-pointer-surface"
            {...pointer.pointerHandlers}
        >
            {children}
        </div>
    );
}

function renderLane(
    cues: DatabaseCue[],
    timeline: {
        onSeek?: (beat: number) => void;
        onSelectRange?: (range: TimelineBeatRange) => void;
    } = {},
) {
    const compiled = compileShowCues(marchers, beats, cues);
    const show = { ...compiled, cues, marchers };
    const lane = equipmentLane({
        compiled: compiled.compiled,
        cues,
        usual: compiled.usual,
    });
    const view = render(
        <TolgeeProvider tolgee={tolgee}>
            <QueryClientProvider client={new QueryClient()}>
                <Surface onSeek={timeline.onSeek ?? (() => {})}>
                    <EquipmentLaneView
                        geometry={{
                            top: 0,
                            width: 2000,
                            pixelsPerBeat: PPB,
                            beatCount: beats.length,
                            // What the timeline hands the lanes: page flags and downbeats together
                            snapBeats,
                            pageBeats,
                            downbeats,
                            leadingInset: 0,
                            onSelectRange: timeline.onSelectRange,
                        }}
                        lane={lane}
                        show={show}
                        beats={beats}
                        folded={false}
                    />
                </Surface>
            </QueryClientProvider>
        </TolgeeProvider>,
    );
    return view;
}

/** Drags `handle` sideways by `dx` px, as a mouse does, and lets go (the lane listens on the window). */
async function dragBy(handle: Element, dx: number) {
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0 };
    await act(async () => {
        fireEvent.pointerDown(handle, { ...pointer, clientX: 500 });
    });
    await act(async () => {
        for (const x of [500 + dx / 2, 500 + dx])
            fireEvent.pointerMove(window, { ...pointer, clientX: x });
        fireEvent.pointerUp(window, { ...pointer, clientX: 500 + dx });
    });
}

const edge = (container: HTMLElement, cueId: number, side: "start" | "end") =>
    container.querySelector(
        `[data-testid="equipment-lane-cue"][data-cue-id="${cueId}"] [data-testid="equipment-lane-cue-${side}"]`,
    )!;

beforeAll(async () => {
    await tolgee.run();
    HTMLElement.prototype.setPointerCapture ??= () => {};
    // jsdom has no PointerEvent: without it a pointer event carries no button or clientX
    if (!("PointerEvent" in window)) {
        class PointerEventShim extends MouseEvent {
            readonly pointerId: number;
            readonly pointerType: string;
            constructor(type: string, init: PointerEventInit = {}) {
                super(type, init);
                this.pointerId = init.pointerId ?? 0;
                this.pointerType = init.pointerType ?? "mouse";
            }
        }
        Object.assign(window, { PointerEvent: PointerEventShim });
    }
});
beforeEach(() => {
    written.length = 0;
    useCueSelectionStore.getState().pick(null);
    // The playhead on a page's end, as after clicking the page: on a downbeat
    useTimelineSelectionStore.setState({ playheadBeat: spec(8) });
});
afterEach(cleanup);

describe("dragging a cue bar's edge in the Equipment lane (#992 follow-up)", () => {
    // The simulated users' finding: drags landed on the nearest downbeat or the playhead, not
    // where they were dropped
    it.each([
        [32, 2],
        [48, 3],
        [-32, -2],
        [16, 1],
    ])(
        "an end-edge drag of %i px (16 px a count) moves the end %i counts",
        async (dx, counts) => {
            // The Flag lasts from count 12 to the show's end; the Rifle from 4 to 12
            const { container } = renderLane([
                cue(1, 4, "rifle"),
                cue(2, 12, "flag"),
            ]);
            await dragBy(edge(container, 1, "end"), dx);
            const end = 12 + counts;
            // Past the next lasting cue it stays lasting; before it, a momentary cue to the new end
            const length = end >= 12 ? null : end - 4;
            if (length === null) expect(written).toEqual([]);
            else
                expect(written.at(-1)?.modifiedCues).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ id: 1, length }),
                    ]),
                );
        },
    );

    it("a start-edge drag of 32 px moves the start 2 counts, not onto the nearest line", async () => {
        const { container } = renderLane([
            cue(1, 4, "rifle"),
            cue(2, 12, "flag"),
        ]);
        await dragBy(edge(container, 2, "start"), 32);
        expect(written.at(-1)?.modifiedCues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 2, beatId: 100 + 14 }),
            ]),
        );
    });

    it("a start-edge drag of 16 px doesn't snap back to where it started", async () => {
        const { container } = renderLane([
            cue(1, 4, "rifle"),
            cue(2, 12, "flag"),
        ]);
        await dragBy(edge(container, 2, "start"), 16);
        expect(written.at(-1)?.modifiedCues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 2, beatId: 100 + 13 }),
            ]),
        );
    });

    it("a body drag of 32 px moves the cue 2 counts", async () => {
        const { container } = renderLane([
            cue(1, 4, "rifle"),
            cue(2, 20, "flag"),
        ]);
        const bar = container.querySelector(
            '[data-testid="equipment-lane-cue"][data-cue-id="1"]',
        )!;
        await dragBy(bar, 32);
        expect(written.at(-1)?.modifiedCues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 1, beatId: 100 + 6 }),
            ]),
        );
    });
});

describe("right-clicking a cue bar (#992 follow-up)", () => {
    // The simulated users' finding: a right-click on a bar nobody had picked opened its menu
    // with every edit greyed out ("Pick a cue in the Equipment lane first"), as the menu was
    // drawn before the pick reached the commands
    it("picks the bar under the pointer, and its menu follows the commands as they catch up", async () => {
        let ready = false;
        const unregister = registerActionHandler("cueDelete", {
            run: () => {},
            isEnabled: () => ready,
            disabledReason: () => "Pick a cue in the Equipment lane first",
        });
        try {
            const { container, getByTestId } = renderLane([
                cue(1, 4, "rifle"),
                cue(2, 12, "flag"),
            ]);
            const flag = container.querySelector(
                '[data-testid="equipment-lane-cue"][data-cue-id="2"]',
            )!;
            await act(async () => {
                fireEvent.contextMenu(flag, { clientX: 300, clientY: 30 });
            });
            expect(useCueSelectionStore.getState().cueId).toBe(2);
            // Named for what it sets, so it's plain which cue it is
            expect(getByTestId("cue-menu-heading").textContent).toMatch(
                /^Flag · /,
            );
            const remove = getByTestId("cue-menu-cueDelete");
            expect(remove.getAttribute("aria-disabled")).toBe("true");
            // The commands see the pick a moment later, and say so
            await act(async () => {
                ready = true;
                notifyActionHandlersChanged();
            });
            expect(
                getByTestId("cue-menu-cueDelete").getAttribute("aria-disabled"),
            ).toBeNull();
        } finally {
            unregister();
        }
    });
});

describe("clicking in the Equipment lane (#1288 follow-up)", () => {
    const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };
    /** A press and release at `clientX` without moving, as a click */
    async function clickAt(target: Element, clientX: number) {
        await act(async () => {
            fireEvent.pointerDown(target, { ...mouse, clientX });
        });
        await act(async () => {
            fireEvent.pointerUp(target, { ...mouse, clientX });
            fireEvent.pointerUp(window, { ...mouse, clientX });
        });
    }

    it("a click on empty lane space moves the playhead there, as on the audio lane", async () => {
        const onSeek = vi.fn();
        const { container } = renderLane(
            [cue(1, 4, "rifle"), cue(2, 40, "flag")],
            { onSeek },
        );
        const row = container.querySelector(
            '[data-testid="equipment-lane-row"]',
        )!;
        // The timeline's own beats (view beats: count c is view beat c), 3 counts from any line
        await clickAt(row, 23 * PPB);
        expect(onSeek).toHaveBeenCalled();
        expect(onSeek.mock.calls.at(-1)?.[0]).toBe(23);
    });

    it("a drag on a bar's edge doesn't move the playhead", async () => {
        const onSeek = vi.fn();
        const onSelectRange = vi.fn();
        const { container } = renderLane(
            [cue(1, 4, "rifle"), cue(2, 12, "flag")],
            { onSeek, onSelectRange },
        );
        await dragBy(edge(container, 1, "end"), -32);
        expect(written.length).toBe(1);
        expect(onSeek).not.toHaveBeenCalled();
        expect(onSelectRange).not.toHaveBeenCalled();
    });

    it("a click on a bar picks it and selects its counts, as a click on a move's clip does", async () => {
        const onSeek = vi.fn();
        const onSelectRange = vi.fn();
        const { container } = renderLane(
            [cue(1, 4, "rifle"), cue(2, 12, "flag")],
            { onSeek, onSelectRange },
        );
        const rifle = container.querySelector(
            '[data-testid="equipment-lane-cue"][data-cue-id="1"]',
        )!;
        await clickAt(rifle, spec(6) * PPB);
        expect(useCueSelectionStore.getState().cueId).toBe(1);
        // The Rifle runs from count 4 to the Flag on count 12, in the timeline's beats (view
        // beats, where its bar is drawn)
        expect(onSelectRange).toHaveBeenCalledWith({
            startBeatIndex: 4,
            endBeatIndex: 12,
        });
        expect(onSeek).not.toHaveBeenCalled();
        expect(written).toEqual([]);
    });
});
