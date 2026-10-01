// cspell:ignore NONFOUNDING
import { cleanup, render, screen, within } from "@testing-library/react";
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
import { TIMELINE_INSPECTOR_STRINGS } from "../timelineInspectorStrings";
import {
    MarcherInspectionView,
    ShowDiagnosticsList,
    TimelineInspectorSection,
    type InspectorTranslate,
} from "../TimelineInspectorSection";

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
    selectedPage: null as unknown,
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
        mocks.selectedPage = { id: 1, beats: [{ index: 7 }] };
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

    it("asks for a page when marchers are selected but no page is", () => {
        mocks.selectedMarchers = [{ id: 2, drill_number: "T2" }];
        renderSection();
        expect(
            screen.getByText(/Select a page to see why each marcher/),
        ).toBeTruthy();
    });
});
