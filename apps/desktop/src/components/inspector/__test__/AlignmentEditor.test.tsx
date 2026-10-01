import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import AlignmentEditor from "../AlignmentEditor";

/**
 * P7.11: the line tool's Create Shape makes a page shape, so timeline mode disables it and says
 * why, while Apply coordinates stays available. Page mode is unchanged.
 */

const mocks = vi.hoisted(() => ({ timelineMode: false }));

vi.mock("@/hooks/queries/useWorkspaceSettings", () => ({
    useTimelineMode: () => mocks.timelineMode,
}));
vi.mock("@/stores/AlignmentEventStore", () => ({
    useAlignmentEventStore: () => ({
        alignmentEvent: "line",
        alignmentEventMarchers: [
            { drill_number: "T1" },
            { drill_number: "T2" },
        ],
        alignmentEventNewMarcherPages: [
            { marcher_id: 1, page_id: 1, x: 0, y: 0 },
            { marcher_id: 2, page_id: 1, x: 10, y: 0 },
        ],
    }),
}));

beforeAll(async () => {
    await tolgee.run();
});
afterEach(cleanup);

const show = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <AlignmentEditor />
        </TolgeeProvider>,
    );

const buttonsNamed = (name: RegExp) =>
    screen
        .getAllByRole("button", { name })
        .filter((b) => b.tagName === "BUTTON");

describe("AlignmentEditor", () => {
    it("in page mode, Create Shape is available and nothing is explained", async () => {
        mocks.timelineMode = false;
        show();
        const create = await screen.findAllByRole("button", {
            name: /create shape/i,
        });
        expect(create.every((b) => !b.hasAttribute("disabled"))).toBe(true);
        expect(screen.queryByTestId("alignment-create-shape-timeline")).toBe(
            null,
        );
    });

    it("in timeline mode, Create Shape is disabled with the reason, and Apply coordinates isn't", async () => {
        mocks.timelineMode = true;
        show();
        await screen.findAllByRole("button", { name: /create shape/i });
        expect(
            buttonsNamed(/create shape/i).every((b) =>
                b.hasAttribute("disabled"),
            ),
        ).toBe(true);
        expect(
            screen.getByTestId("alignment-create-shape-timeline").textContent,
        ).toContain("timeline mode doesn't use");
        expect(
            buttonsNamed(/apply coordinates/i).some(
                (b) => !b.hasAttribute("disabled"),
            ),
        ).toBe(true);
    });
});
