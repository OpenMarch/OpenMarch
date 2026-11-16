import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import type { HoldStyle } from "@/timeline/holdStyle";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import TimelineHoldStyle from "../TimelineHoldStyle";

/**
 * The inspector's Hold style choice (ADR 0015 D-5; fork #775): shown while a selected marcher is
 * Held at the playhead, reading the style its hold carries.
 */

/** Marcher `marcherId` Held over counts 9 to 17 */
const held = (marcherId: number, style: HoldStyle | null = null) => ({
    id: marcherId,
    marcherId,
    start: 9,
    end: 17,
    style,
});

const show = (ids: number[]) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TimelineHoldStyle marcherIds={ids} />
        </TolgeeProvider>,
    );

const choice = () => screen.queryByTestId("timeline-hold-style");

describe("TimelineHoldStyle", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    beforeEach(() => {
        useTimelineSelectionStore.setState({
            selection: { kind: "range", start: 9, end: 13 },
        });
        useHeldMarksStore.setState({ marks: [] });
    });
    afterEach(cleanup);

    it("shows nothing while no selected marcher is Held at the playhead", () => {
        show([1]);
        expect(choice()).toBeNull();
        cleanup();
        // Held, but marcher 2 is the one selected
        useHeldMarksStore.setState({ marks: [held(1)] });
        show([2]);
        expect(choice()).toBeNull();
    });

    it("reads the show setting for a hold with no style, and the hold's own style", () => {
        useHeldMarksStore.setState({ marks: [held(1)] });
        show([1, 2]);
        expect(choice()).toHaveTextContent("Hold style");
        expect(screen.getByRole("combobox")).toHaveTextContent("Show setting");
        expect(screen.getByRole("combobox")).toHaveAccessibleName("Hold style");
        cleanup();

        useHeldMarksStore.setState({ marks: [held(1, "markTime")] });
        show([1]);
        expect(screen.getByRole("combobox")).toHaveTextContent("Mark time");
    });

    it("reads Mixed where the selected holds differ", () => {
        useHeldMarksStore.setState({
            marks: [held(1, "stand"), held(2, "highMarkTime")],
        });
        show([1, 2]);
        expect(screen.getByRole("combobox")).toHaveTextContent("Mixed");
    });
});
