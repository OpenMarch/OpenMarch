import { cleanup, render, screen } from "@testing-library/react";
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
import tolgee from "@/global/singletons/Tolgee";
import { registerActionHandler } from "@/shortcuts/registry";
import AlignmentEditor from "../AlignmentEditor";

/**
 * The line tool's alignment: Apply coordinates moves the marchers onto the line. There is no
 * page shape to create from it (P7.11).
 */

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
// The buttons run their actions, whose handlers the editor mounts
const offs: (() => void)[] = [];
beforeEach(() => {
    offs.push(
        registerActionHandler("applyQuickShape", {
            run: vi.fn(),
            isEnabled: () => true,
        }),
    );
});
afterEach(() => {
    cleanup();
    offs.splice(0).forEach((off) => off());
});

const show = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <AlignmentEditor />
        </TolgeeProvider>,
    );

describe("AlignmentEditor", () => {
    it("offers Apply coordinates and no Create Shape", async () => {
        show();
        const apply = await screen.findAllByRole("button", {
            name: /apply coordinates/i,
        });
        expect(apply.some((b) => !b.hasAttribute("disabled"))).toBe(true);
        expect(screen.queryByRole("button", { name: /create shape/i })).toBe(
            null,
        );
    });
});
