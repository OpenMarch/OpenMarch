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
    {
        enabled = true,
        label,
        checked = false,
    }: { enabled?: boolean; label?: string; checked?: boolean } = {},
) {
    const run = vi.fn();
    handlers.push(
        registerActionHandler(id, {
            run,
            isEnabled: () => enabled,
            label: () => label,
            checked: () => checked,
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

    it("reads no labels or enabled states while closed, as handlers change (#573 re-review)", () => {
        const label = vi.fn(() => "Clear Page 3");
        const isEnabled = vi.fn(() => true);
        handlers.push(
            registerActionHandler("setSelectedMarchersToPreviousPage", {
                run: vi.fn(),
                isEnabled,
                label,
            }),
        );
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
        handle("alignHorizontally");
        expect(label).not.toHaveBeenCalled();
        expect(isEnabled).not.toHaveBeenCalled();
    });

    it("runs the action chosen through the actions layer, then closes", () => {
        const run = handle("setSelectedMarchersToPreviousPage");
        const { onClose } = open();
        fireEvent.click(item("setSelectedMarchersToPreviousPage")!);
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

    it("lists the actions in groups, with the page state commands together", () => {
        for (const id of FIELD_MENU_ACTIONS) handle(id);
        handle("shapeGroup", { enabled: false });
        handle("shapeUngroup", { enabled: false });
        open();
        const content = screen.getByTestId("field-menu");
        const groups: string[][] = [[]];
        for (const el of Array.from(content.children)) {
            if (el.getAttribute("role") === "separator") groups.push([]);
            else
                groups[groups.length - 1]!.push(
                    el.getAttribute("data-testid")!.replace("field-menu-", ""),
                );
        }
        expect(groups).toEqual([
            [
                "timelineDefineAsShown",
                "timelineHoldFromPrevious",
                "setSelectedMarchersToPreviousPage",
                "setSelectedMarchersToNextPage",
            ],
            [
                "alignHorizontally",
                "alignVertically",
                "evenlyDistributeHorizontally",
                "evenlyDistributeVertically",
                "swapMarchers",
            ],
            ["selectAllMarchers"],
        ]);
        expect(item("timelineDefineAsShown")).toHaveTextContent(
            "Define as shown",
        );
        expect(item("timelineHoldFromPrevious")).toHaveTextContent(
            "Hold from previous page",
        );
        expect(item("setSelectedMarchersToPreviousPage")).toHaveTextContent(
            "Clear this page (selected)",
        );
    });

    it("runs the hold commands through the actions layer, and greys them out where they can't run", () => {
        const hold = handle("timelineHoldFromPrevious");
        const define = handle("timelineDefineAsShown", { enabled: false });
        open();
        fireEvent.click(item("timelineDefineAsShown")!);
        expect(define).not.toHaveBeenCalled();
        expect(item("timelineDefineAsShown")).toHaveAttribute("data-disabled");
        cleanup();
        open();
        expect(item("timelineHoldFromPrevious")).not.toHaveAttribute(
            "data-disabled",
        );
        fireEvent.click(item("timelineHoldFromPrevious")!);
        expect(hold).toHaveBeenCalledTimes(1);
    });

    it("shows a hold command every selected marcher is already in as checked, and it does nothing", () => {
        // All Held: the handler says checked (and off), as useHoldActionHandlers does
        const hold = handle("timelineHoldFromPrevious", {
            enabled: false,
            checked: true,
        });
        handle("timelineDefineAsShown", { enabled: false });
        handle("setSelectedMarchersToPreviousPage");
        open();
        const entry = item("timelineHoldFromPrevious")!;
        expect(entry).toHaveAttribute("role", "menuitemcheckbox");
        expect(entry).toHaveAttribute("aria-checked", "true");
        expect(entry).toHaveAttribute("data-disabled");
        expect(entry).toHaveTextContent(/^Hold from previous page/);
        fireEvent.click(entry);
        expect(hold).not.toHaveBeenCalled();
        expect(item("timelineDefineAsShown")).toHaveAttribute("data-disabled");
        expect(item("timelineDefineAsShown")).not.toHaveAttribute(
            "aria-checked",
        );
        expect(item("setSelectedMarchersToPreviousPage")).not.toHaveAttribute(
            "data-disabled",
        );
    });

    it("shows a mixed selection's count in the label, and runs", () => {
        const hold = handle("timelineHoldFromPrevious", {
            label: "Hold from previous page (3 of 5)",
        });
        handle("setSelectedMarchersToPreviousPage", {
            label: "Clear this page (2 of 5 selected)",
        });
        open();
        const entry = item("timelineHoldFromPrevious")!;
        expect(entry).toHaveTextContent("Hold from previous page (3 of 5)");
        expect(entry).not.toHaveAttribute("data-disabled");
        expect(item("setSelectedMarchersToPreviousPage")).toHaveTextContent(
            "Clear this page (2 of 5 selected)",
        );
        fireEvent.click(entry);
        expect(hold).toHaveBeenCalledTimes(1);
    });

    it("leaves the hold commands out outside timeline mode, but keeps Clear this page", () => {
        handle("timelineHoldFromPrevious");
        handle("timelineDefineAsShown");
        handle("setSelectedMarchersToPreviousPage");
        open({ timelineMode: false });
        expect(item("timelineHoldFromPrevious")).toBeNull();
        expect(item("timelineDefineAsShown")).toBeNull();
        expect(item("setSelectedMarchersToPreviousPage")).not.toBeNull();
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
                expect.stringContaining("Swap"),
                expect.stringContaining("Align horizontally"),
                expect.stringContaining("Select all"),
            ]),
        );
    });
});
