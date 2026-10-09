// cspell:ignore NONFOUNDING
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createResolver } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import type { MarcherInspection } from "@/timeline/timelineInspector";
import {
    arcShow,
    beatOfSpanKind,
    ftlEmptyShow,
    golden,
    inspect,
} from "@/timeline/__test__/inspectorFixtures";
import { buildTransitionEditTarget } from "@/timeline/timelineTransitionEditor";
import { useTimelineInspections } from "@/timeline/useTimelineInspections";
import {
    useTimelineSelectionStore,
    windowMove,
} from "@/stores/TimelineSelectionStore";
import { useMoveCardRevealStore } from "@/stores/MoveCardRevealStore";
import { TIMELINE_INSPECTOR_STRINGS } from "../timelineInspectorStrings";
import {
    MarcherInspectionView,
    ShowDiagnosticsList,
    TimelineInspectorSection,
    type InspectorTranslate,
} from "../TimelineInspectorSection";
import { MovePathRadios, TimelineMoveCardSlot } from "../TimelineMoveCard";
import { useMoveNotesStore } from "@/stores/MoveNotesStore";

/**
 * P8.5: the inspector's timeline section renders what `explain` says, for each span kind and for
 * follow-the-leader, shows the diagnostics, and is absent with the flag off.
 */

const mocks = vi.hoisted(() => ({
    timelineMode: true,
    inspections: [] as unknown[],
    diagnostics: [] as unknown[],
    unknown: [] as number[],
    transitionEdits: [] as unknown[],
    selectedMarchers: [] as Array<{ id: number; drill_number: string }>,
    /** The page the old inspector read; the section must not read it any more (UI-14) */
    selectedPage: null as unknown,
    pages: [] as unknown[],
}));

vi.mock("@/hooks/queries/useWorkspaceSettings", () => ({
    useTimelineMode: () => mocks.timelineMode,
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: mocks.selectedMarchers }),
}));
vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: mocks.selectedPage }),
}));
vi.mock("@/hooks/useTimingObjects", () => ({
    useTimingObjects: () => ({ pages: mocks.pages }),
}));
vi.mock("@/hooks/queries/useHistory", () => ({
    usePerformHistoryAction: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/timeline/useTimelineInspections", () => ({
    MAX_INSPECTED_MARCHERS: 10,
    useTimelineInspections: vi.fn(() => ({
        inspections: mocks.inspections,
        omitted: 0,
        unknownMarcherIds: mocks.unknown,
        diagnostics: mocks.diagnostics,
        transitionEdits: mocks.transitionEdits,
        shapeOptions: [],
    })),
}));

/** English text with ICU `{name}` arguments filled in */
const t: InspectorTranslate = (key, params = {}) =>
    TIMELINE_INSPECTOR_STRINGS[key].replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name]),
    );

beforeAll(async () => {
    await tolgee.run();
});
afterEach(cleanup);
beforeEach(() => {
    mocks.timelineMode = true;
    mocks.inspections = [];
    mocks.diagnostics = [];
    mocks.unknown = [];
    mocks.transitionEdits = [];
    mocks.selectedMarchers = [];
    mocks.selectedPage = null;
    mocks.pages = [];
    vi.mocked(useTimelineInspections).mockClear();
    useTimelineSelectionStore.getState().reset();
    useMoveCardRevealStore.getState().clear();
});

const view = (inspection: MarcherInspection, label = "T1") =>
    render(
        <MarcherInspectionView inspection={inspection} label={label} t={t} />,
    );

const text = () =>
    screen.getByTestId(/^timeline-inspection-/).textContent ?? "";

describe("MarcherInspectionView: span kinds", () => {
    it("G1 founding: span, beats, transition, layer, slot, progress, origin, style, destination", () => {
        view(inspect(golden("G1"), 1, 8));
        const content = text();
        expect(screen.getByTestId("timeline-span-kind").textContent).toBe(
            "Founding",
        );
        expect(content).toContain("T1 at beat 8");
        expect(content).toContain("0 to 16");
        expect(content).toContain("1 on Opener");
        expect(content).toContain("Layer0");
        expect(content).toContain("0 of 1");
        expect(content).toContain("50%");
        expect(content).toContain("Home (0, 0)");
        expect(content).toContain("Direct");
        expect(content).toContain("S1 (line)");
        expect(content).toContain("No diagnostics.");
        expect(content).not.toContain("Member order");
    });

    it("a hold: no transition fields, ends at the end of the show", () => {
        view(inspect(golden("G1"), 1, 20));
        expect(screen.getByTestId("timeline-span-kind").textContent).toBe(
            "Hold",
        );
        const content = text();
        expect(content).toContain("16 to the end of the show");
        expect(content).toContain(
            "End of the previous founding span in transition 1 (16, 0)",
        );
        expect(content).not.toContain("Layer");
        expect(content).not.toContain("Progress");
        expect(content).not.toContain("Path style");
    });

    it("the leading hold runs from the start of the show", () => {
        view(inspect(golden("G5"), 2, 4), "T2");
        expect(text()).toContain("the start of the show to 8");
        expect(text()).toContain("Home (0, 0)");
    });

    it("G5 join: says it joined, and shows the rebase diagnostic", () => {
        const show = golden("G5");
        view(inspect(show, 2, beatOfSpanKind(show, 2, "join")), "T2");
        expect(screen.getByTestId("timeline-span-kind").textContent).toBe(
            "Join",
        );
        expect(text()).toContain("Joined this transition after it started");
        expect(screen.getByTestId("timeline-diagnostic-D-REBASE")).toBeTruthy();
    });

    it("G3 resume: says it resumed, with the origin from the stolen span", () => {
        const show = golden("G3");
        view(inspect(show, 1, beatOfSpanKind(show, 1, "resume")));
        expect(screen.getByTestId("timeline-span-kind").textContent).toBe(
            "Resume",
        );
        expect(text()).toContain("Back in this transition after another move");
        expect(text()).toContain("End of the previous");
        expect(text()).toContain("Layer1");
    });

    it("an arc shows its bulge", () => {
        view(inspect(arcShow(), 1, 4));
        expect(text()).toContain("Arc");
        expect(text()).toContain("Bulge0.25");
    });

    it("G13 shows individually placed points as the destination", () => {
        view(inspect(golden("G13"), 1, 4));
        expect(text()).toContain("3 individually placed points");
    });
});

describe("MarcherInspectionView: follow the leader", () => {
    it("G6: the place in the order, its source and the target", () => {
        const i = inspect(golden("G6"), 1, 8);
        view(i);
        const content = text();
        expect(content).toContain("Follow the leader");
        expect(content).toContain(`Place ${i.ftl!.q! + 1} of 4`);
        expect(content).toContain("Inherited from transition 1");
        expect(content).toContain("Target");
    });

    it("G11: a late joiner has no place and the non-founding warning", () => {
        view(inspect(golden("G11"), 1, 10));
        expect(text()).toContain("Not a member of the trail");
        const item = screen.getByTestId(
            "timeline-diagnostic-D-FTL-NONFOUNDING",
        );
        expect(item.textContent).toContain("isn't part of the trail's order");
        expect(within(item).getByLabelText("Warning")).toBeTruthy();
    });

    it("G12: the resumed leader has no place", () => {
        const show = golden("G12");
        view(inspect(show, 4, beatOfSpanKind(show, 4, "resume")), "T4");
        expect(screen.getByTestId("timeline-span-kind").textContent).toBe(
            "Resume",
        );
        expect(text()).toContain("Not a member of the trail");
    });

    it("G10: the order source says slot order was a fallback", () => {
        view(inspect(golden("G10"), 2, 8));
        expect(text()).toContain("Slot order (no single upstream order");
        expect(
            screen.getByTestId("timeline-diagnostic-D-ORDER-FALLBACK"),
        ).toBeTruthy();
    });
});

describe("MarcherInspectionView: diagnostics", () => {
    it("G9: a vacant slot shows with the slot number", () => {
        view(inspect(golden("G9"), 2, 8), "T2");
        const item = screen.getByTestId("timeline-diagnostic-D-VACANT");
        expect(item.textContent).toContain("Slot 3 has no marcher assigned");
        expect(within(item).getByLabelText("Warning")).toBeTruthy();
    });

    it("QA-DG-4: no founders shows D-FTL-EMPTY", () => {
        view(inspect(ftlEmptyShow(), 1, 8));
        expect(
            screen.getByTestId("timeline-diagnostic-D-FTL-EMPTY").textContent,
        ).toContain("Nobody founds this follow-the-leader move");
    });

    it("an info diagnostic is labeled as info", () => {
        const show = golden("G5");
        view(inspect(show, 2, 10), "T2");
        const item = screen.getByTestId("timeline-diagnostic-D-REBASE");
        expect(within(item).getByLabelText("Info")).toBeTruthy();
    });
});

describe("ShowDiagnosticsList", () => {
    it("lists every diagnostic of the show, grouped by transition", () => {
        const diagnostics = createResolver(golden("G9")).diagnostics();
        render(<ShowDiagnosticsList diagnostics={diagnostics} t={t} />);
        const list = screen.getByTestId("timeline-show-diagnostics");
        expect(
            within(list).getAllByTestId(/^timeline-diagnostic-/),
        ).toHaveLength(diagnostics.length);
        expect(list.textContent).toContain("Transition 2");
    });

    it("says so when there are none", () => {
        render(<ShowDiagnosticsList diagnostics={[]} t={t} />);
        expect(
            screen.getByTestId("timeline-show-diagnostics").textContent,
        ).toBe("No diagnostics for the whole show.");
    });
});

const renderSection = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                {/* As the inspector lays them out: a move's card first (UI-14 round-2 review) */}
                <TimelineMoveCardSlot />
                <TimelineInspectorSection />
            </TolgeeProvider>
        </QueryClientProvider>,
    );

describe("TimelineInspectorSection", () => {
    it("is absent with the flag off", () => {
        mocks.timelineMode = false;
        mocks.diagnostics = createResolver(golden("G9")).diagnostics();
        const { container } = renderSection();
        expect(container.innerHTML).toBe("");
    });

    it("with the flag on, shows the selected marchers' inspections and the show's diagnostics", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        mocks.inspections = [inspect(golden("G9"), 2, 8)];
        mocks.diagnostics = createResolver(golden("G9")).diagnostics();
        renderSection();
        expect(screen.getByText("Timeline")).toBeTruthy();
        expect(screen.getByTestId("timeline-inspection-2")).toBeTruthy();
        expect(
            screen.getByText(`Show diagnostics (${mocks.diagnostics.length})`),
        ).toBeTruthy();
        expect(screen.getByTestId("timeline-show-diagnostics")).toBeTruthy();
    });

    it("says a marcher isn't in the timeline only when the hook reports it unknown", () => {
        mocks.selectedMarchers = [
            { id: 2, drill_number: "T2" },
            { id: 3, drill_number: "T3" },
        ];
        mocks.selectedPage = { id: 1, beats: [{ index: 7 }] };
        // Rows still loading: nothing is reported missing
        renderSection();
        expect(screen.queryByText(/isn't in the timeline yet/)).toBeNull();
        cleanup();
        mocks.unknown = [3];
        renderSection();
        expect(screen.getByText("T3 isn't in the timeline yet.")).toBeTruthy();
        expect(screen.queryByText(/T2 isn't/)).toBeNull();
    });

    it("shows an editor for each transition the hook offers (P8.3)", () => {
        const show = golden("G1");
        mocks.selectedMarchers = [{ id: 1, drill_number: "T1" }];
        mocks.selectedPage = { id: 1, beats: [{ index: 7 }] };
        mocks.inspections = [inspect(show, 1, 8)];
        mocks.transitionEdits = [
            buildTransitionEditTarget(1, {
                transitions: show.transitions,
                shapes: show.shapes,
                assignments: show.assignments,
            }),
        ];
        renderSection();
        expect(screen.getByTestId("timeline-transition-editor-1")).toBeTruthy();
        expect(screen.getByText("Edit transition 1")).toBeTruthy();
    });

    it("explains at the paused playhead, not the selected page's end (UI-14)", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        // A page ending on beat 7 is selected, but the playhead is between flags, on beat 5
        mocks.selectedPage = { id: 1, beats: [{ index: 7 }] };
        const store = useTimelineSelectionStore.getState();
        store.setPageBoxes([{ start: 0, end: 8 }]);
        store.seek(5);
        renderSection();
        expect(vi.mocked(useTimelineInspections)).toHaveBeenLastCalledWith(
            expect.objectContaining({ beat: 5, marcherIds: [2] }),
        );
        expect(screen.queryByText(/Select a page/)).toBeNull();
    });

    it("holds its beat while the playhead is scrubbed, and explains where the scrub ends", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        const store = useTimelineSelectionStore.getState();
        store.setPageBoxes([{ start: 0, end: 16 }]);
        store.seek(5);
        renderSection();
        const beats = () =>
            vi
                .mocked(useTimelineInspections)
                .mock.calls.map(([args]) => args.beat);
        act(() => {
            store.beginScrub();
        });
        const during = beats().length;
        for (const beat of [6, 7, 8, 9])
            act(() => {
                useTimelineSelectionStore.getState().seek(beat);
            });
        // Nothing is explained on the beats it passes, nor even rendered, and nothing blanks
        expect(beats().length).toBe(during);
        expect(beats().at(-1)).toBe(5);
        act(() => {
            useTimelineSelectionStore.getState().endScrub();
        });
        expect(beats().at(-1)).toBe(
            useTimelineSelectionStore.getState().playheadBeat,
        );
        expect(beats().at(-1)).not.toBe(5);
    });
});

describe("the inspector while scrubbing over moves (code review)", () => {
    it("holds the move with the beat: the held beat is never clamped into a move the scrub passes", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        const store = twoPages();
        store.setShowEndBeat(17);
        store.selectRange(9, 12);
        renderSection();
        const calls = () => vi.mocked(useTimelineInspections).mock.calls;
        const beatNow = () => calls().at(-1)![0].beat;
        // Move 7 (beats 9 to 12), P on its end: explained at its last beat
        expect(beatNow()).toBe(11);
        expect(screen.getByTestId("timeline-move-card")).toBeTruthy();
        act(() => {
            useTimelineSelectionStore.getState().beginScrub();
        });
        const during = calls().length;
        for (const beat of [3, 7, 9, 12, 15])
            act(() => {
                useTimelineSelectionStore.getState().seek(beat);
            });
        expect(calls().length).toBe(during);
        expect(beatNow()).toBe(11);
        // The Move card holds the same move: it stays, rather than going (and saving) mid-scrub
        expect(screen.getByTestId("timeline-move-card")).toBeTruthy();
        act(() => {
            useTimelineSelectionStore.getState().endScrub();
        });
        // Settled: the beat and the move are read again, together
        const settled = useTimelineSelectionStore.getState();
        const move = windowMove(settled);
        expect(beatNow()).toBe(
            move
                ? Math.min(
                      Math.max(settled.playheadBeat, move.start),
                      move.end - 1,
                  )
                : settled.playheadBeat,
        );
    });
});

/** Page 1 over beats [1, 9) and page 2 over [9, 17), as the store and the pages see them */
const twoPages = () => {
    const beats = (from: number, to: number) =>
        Array.from({ length: to - from }, (_, i) => ({ index: from + i }));
    mocks.pages = [
        { id: 1, name: "0", beats: beats(0, 1) },
        { id: 2, name: "1", beats: beats(1, 9) },
        { id: 3, name: "2", beats: beats(9, 17) },
    ];
    const store = useTimelineSelectionStore.getState();
    store.setPageBoxes([
        { start: 1, end: 9, name: "1" },
        { start: 9, end: 17, name: "2" },
    ]);
    store.setStoredTimelines([
        // Page 2's own move: a page box stands for it
        { id: 1, start: 9, end: 17, marcherIds: new Set([1, 2]), name: null },
        // A mid-page move, page 2 counts 1 to 3
        {
            id: 7,
            start: 9,
            end: 12,
            marcherIds: new Set([1, 2, 3]),
            name: "Company front",
        },
    ]);
    return store;
};

describe("the Move card (UI-14)", () => {
    it("shows for a move off the page boxes: its name, counts and marchers", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        const card = screen.getByTestId("timeline-move-card");
        expect(
            (screen.getByTestId("timeline-move-card-name") as HTMLInputElement)
                .value,
        ).toBe("Company front");
        expect(screen.getByTestId("timeline-move-card-range").textContent).toBe(
            "Page 2, counts 1–3",
        );
        expect(screen.getByTestId("timeline-move-card-count").textContent).toBe(
            "3 marchers",
        );
        expect(within(card).getByText("Delete move")).toBeTruthy();
        // It comes first in the inspector, above the Timeline section
        expect(card.previousElementSibling).toBeNull();
        expect(
            card.compareDocumentPosition(screen.getByText("Timeline")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("doesn't show for a page timeline, a window with no move, or home", () => {
        const store = twoPages();
        store.selectRange(9, 17);
        renderSection();
        expect(screen.queryByTestId("timeline-move-card")).toBeNull();
        cleanup();
        store.selectRange(9, 13);
        renderSection();
        expect(screen.queryByTestId("timeline-move-card")).toBeNull();
        cleanup();
        store.selectHome();
        renderSection();
        expect(screen.queryByTestId("timeline-move-card")).toBeNull();
    });

    it("Enter in the name field stays there: it never reaches the app's Enter shortcut", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        const reached: string[] = [];
        const listener = (e: KeyboardEvent) => reached.push(e.key);
        window.addEventListener("keydown", listener);
        try {
            const name = screen.getByTestId("timeline-move-card-name");
            name.focus();
            fireEvent.keyDown(name, { key: "Enter" });
            fireEvent.keyDown(name, { key: "Escape" });
        } finally {
            window.removeEventListener("keydown", listener);
        }
        expect(reached).toEqual([]);
    });

    it("says when a name reaches 80 characters", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        expect(
            screen.queryByTestId("timeline-move-card-name-limit"),
        ).toBeNull();
        fireEvent.change(screen.getByTestId("timeline-move-card-name"), {
            target: { value: "x".repeat(80) },
        });
        expect(
            screen.getByTestId("timeline-move-card-name-limit").textContent,
        ).toBe("80 characters at most.");
    });

    it("unnamed, its placeholder is the move's label, Move N", () => {
        const store = twoPages();
        store.setStoredTimelines([
            ...useTimelineSelectionStore
                .getState()
                .storedTimelines!.map((t) =>
                    t.id === 7 ? { ...t, name: null } : t,
                ),
        ]);
        store.selectRange(9, 12);
        renderSection();
        expect(
            (screen.getByTestId("timeline-move-card-name") as HTMLInputElement)
                .placeholder,
        ).toBe("Move 1");
    });

    it("explains inside the move, at its last beat, under a closed Per-marcher details", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        mocks.inspections = [inspect(golden("G9"), 2, 8)];
        twoPages().selectRange(9, 12);
        renderSection();
        // P is on beat 12, the move's end: where the next move starts
        expect(vi.mocked(useTimelineInspections)).toHaveBeenLastCalledWith(
            expect.objectContaining({ beat: 11 }),
        );
        const toggle = screen.getByTestId("timeline-move-details-toggle");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByTestId("timeline-inspection-2")).toBeNull();
        fireEvent.click(toggle);
        expect(screen.getByTestId("timeline-inspection-2")).toBeTruthy();
    });

    it("isolated with P inside the move, it still shows, explains at P and offers Go to end", () => {
        const store = twoPages();
        store.setShowEndBeat(17);
        store.isolate(7);
        store.seek(10);
        renderSection();
        expect(screen.getByTestId("timeline-move-card")).toBeTruthy();
        expect(vi.mocked(useTimelineInspections)).toHaveBeenLastCalledWith(
            expect.objectContaining({ beat: 10 }),
        );
        fireEvent.click(screen.getByTestId("timeline-move-card-go-to-end"));
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(12);
    });

    it("Edit move's request flashes the card and puts focus on its heading, not the menu button", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        // A closed Timeline section doesn't hide the card, which sits above it
        fireEvent.click(screen.getByText("Timeline"));
        expect(screen.getByTestId("timeline-move-card")).toBeTruthy();
        act(() => {
            useMoveCardRevealStore.setState({ pending: 7 });
        });
        const card = screen.getByTestId("timeline-move-card");
        expect(card.dataset.flash).toBe("true");
        expect(document.activeElement).toBe(
            screen.getByTestId("timeline-move-card-heading"),
        );
        expect(
            screen.getByTestId("timeline-move-card-heading").textContent,
        ).toBe("Company front");
        // The request is taken once
        expect(useMoveCardRevealStore.getState().pending).toBeNull();
    });
});

describe("the Move card after the round-2 review (UI-14)", () => {
    it("Enter in the name field keeps focus there", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        const name = screen.getByTestId("timeline-move-card-name");
        name.focus();
        fireEvent.change(name, { target: { value: "Opener" } });
        fireEvent.keyDown(name, { key: "Enter" });
        expect(document.activeElement).toBe(name);
    });

    it("says why its clip is dashed", () => {
        twoPages().selectRange(9, 12);
        useMoveNotesStore
            .getState()
            .setOverridden(
                new Map([[7, "Overridden by Move 4 on Page 2, counts 2–3"]]),
            );
        try {
            renderSection();
            expect(
                screen.getByTestId("timeline-move-card-overridden").textContent,
            ).toBe("Overridden by Move 4 on Page 2, counts 2–3");
        } finally {
            useMoveNotesStore.getState().setOverridden(new Map());
        }
    });

    it("its Path is a radio group: the arrows move the choice and apply it, Space doesn't press", () => {
        const onChange = vi.fn();
        render(
            <MovePathRadios
                value="direct"
                disabled={false}
                label="Path"
                optionLabel={(style) => style}
                onChange={onChange}
            />,
        );
        const [direct, arc] = screen.getAllByRole("radio");
        expect(direct!.getAttribute("aria-checked")).toBe("true");
        expect(direct!.tabIndex).toBe(0);
        expect(arc!.tabIndex).toBe(-1);
        direct!.focus();
        expect(fireEvent.keyDown(direct!, { key: "ArrowRight" })).toBe(false);
        expect(onChange).toHaveBeenLastCalledWith("arc");
        expect(document.activeElement).toBe(arc);
        fireEvent.keyDown(arc!, { key: "ArrowLeft" });
        expect(onChange).toHaveBeenLastCalledWith("direct");
        // Nothing is chosen while members differ; the first radio takes Tab
        cleanup();
        render(
            <MovePathRadios
                value={null}
                disabled={false}
                label="Path"
                optionLabel={(style) => style}
                onChange={onChange}
            />,
        );
        const radios = screen.getAllByRole("radio");
        expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
            "false",
            "false",
        ]);
        expect(radios[0]!.tabIndex).toBe(0);
    });

    it("Space on its buttons is cancelled, so it plays instead of pressing them", () => {
        twoPages().selectRange(9, 12);
        renderSection();
        const del = screen.getByTestId("timeline-move-card-delete");
        expect(fireEvent.keyDown(del, { key: " " })).toBe(false);
        expect(fireEvent.keyUp(del, { key: " " })).toBe(false);
        // The name field keeps its Space
        expect(
            fireEvent.keyDown(screen.getByTestId("timeline-move-card-name"), {
                key: " ",
            }),
        ).toBe(true);
    });
});

describe("the Move card's name field, Esc (UI-14 round-2 review)", () => {
    it("puts the stored name back and focus on the card's heading, not the page", async () => {
        twoPages().selectRange(9, 12);
        renderSection();
        const name = screen.getByTestId(
            "timeline-move-card-name",
        ) as HTMLInputElement;
        name.focus();
        fireEvent.change(name, { target: { value: "XX" } });
        fireEvent.keyDown(name, { key: "Escape" });
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByTestId("timeline-move-card-heading"),
            ),
        );
        expect(name.value).toBe("Company front");
    });
});
