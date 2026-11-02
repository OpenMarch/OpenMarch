import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { ActionId } from "@/shortcuts/definitions";
import { registerActionHandler } from "@/shortcuts/registry";
import FieldContextMenu, { FIELD_MENU_ACTIONS } from "../FieldContextMenu";

/**
 * The field's right-click menu (#315): registered actions, with their enabled
 * state and live labels, run through the actions layer.
 */

const handlers: (() => void)[] = [];
function handle(
    id: ActionId,
    { enabled = true, label }: { enabled?: boolean; label?: string } = {},
) {
    const run = vi.fn();
    handlers.push(
        registerActionHandler(id, {
            run,
            isEnabled: () => enabled,
            label: () => label,
        }),
    );
    return run;
}

function open({
    selectedCount = 1,
    timelineMode = true,
    onClose = vi.fn(),
} = {}) {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <FieldContextMenu
                at={{ x: 120, y: 80 }}
                onClose={onClose}
                selectedCount={selectedCount}
                timelineMode={timelineMode}
            />
        </TolgeeProvider>,
    );
    return { onClose };
}

const item = (id: ActionId) => screen.queryByTestId(`field-menu-${id}`);

describe("FieldContextMenu", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        cleanup();
        handlers.splice(0).forEach((off) => off());
    });

    it("shows nothing until it's opened at a point", () => {
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <FieldContextMenu
                    at={null}
                    onClose={vi.fn()}
                    selectedCount={1}
                    timelineMode
                />
            </TolgeeProvider>,
        );
        expect(screen.queryByTestId("field-menu")).toBeNull();
    });

    it("runs the action chosen through the actions layer, then closes", () => {
        const run = handle("timelineUnsetHere");
        const { onClose } = open();
        fireEvent.click(item("timelineUnsetHere")!);
        expect(run).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalled();
    });

    it("shows an action without an enabled handler as unavailable, and running it does nothing", () => {
        const run = handle("alignHorizontally", { enabled: false });
        open();
        const align = item("alignHorizontally")!;
        expect(align).toHaveAttribute("data-disabled");
        fireEvent.click(align);
        expect(run).not.toHaveBeenCalled();
        expect(item("alignVertically")).toHaveAttribute("data-disabled");
    });

    it("names the pages in Unset here and on Pages N–M, and hides it when no pages follow", () => {
        handle("timelineUnsetHere");
        const off = registerActionHandler("timelineUnsetHereAndFollowing", {
            run: vi.fn(),
            isEnabled: () => true,
            label: () => "Remove keyframe, Pages 3–4 move back too",
        });
        open();
        expect(item("timelineUnsetHereAndFollowing")).toHaveTextContent(
            "Remove keyframe, Pages 3–4 move back too",
        );
        cleanup();
        off();
        handle("timelineUnsetHereAndFollowing", { enabled: false });
        open();
        expect(item("timelineUnsetHere")).not.toBeNull();
        expect(item("timelineUnsetHereAndFollowing")).toBeNull();
    });

    it("leaves Unset out outside timeline mode, as the inspector does", () => {
        handle("timelineUnsetHere");
        open({ timelineMode: false });
        expect(item("timelineUnsetHere")).toBeNull();
        expect(item("alignHorizontally")).not.toBeNull();
    });

    it("offers Swap only with two marchers selected", () => {
        const run = handle("swapMarchers");
        open({ selectedCount: 3 });
        fireEvent.click(item("swapMarchers")!);
        expect(run).not.toHaveBeenCalled();
        cleanup();
        open({ selectedCount: 2 });
        fireEvent.click(item("swapMarchers")!);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("lists every action it offers by its label", () => {
        for (const id of FIELD_MENU_ACTIONS) handle(id);
        open();
        expect(
            screen.getAllByRole("menuitem").map((el) => el.textContent),
        ).toEqual(
            expect.arrayContaining([
                expect.stringContaining("Remove keyframe"),
                expect.stringContaining("Align horizontally"),
                expect.stringContaining("Select all"),
            ]),
        );
    });
});
