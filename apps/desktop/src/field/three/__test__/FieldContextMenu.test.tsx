import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { ActionId } from "@/shortcuts/definitions";
import { registerActionHandler } from "@/shortcuts/registry";
import { PATH_FIELD_MENU } from "@/pathways/pathPenMode";
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
        reason,
    }: {
        enabled?: boolean;
        label?: string;
        checked?: boolean;
        reason?: string;
    } = {},
) {
    const run = vi.fn();
    handlers.push(
        registerActionHandler(id, {
            run,
            isEnabled: () => enabled,
            label: () => label,
            checked: () => checked,
            disabledReason: () => reason,
        }),
    );
    return run;
}

function open({
    selectedCount = 1,
    timelineMode = true,
    onClose = vi.fn(),
    actions = null as readonly ActionId[] | null,
} = {}) {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <FieldContextMenu
                at={{ x: 120, y: 80 }}
                actions={actions}
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

    it("offers only a mode's actions where it gives them: a path's Edit path and Remove path, with icons and no keys", () => {
        const edit = handle("editPath");
        handle("removePath");
        const { onClose } = open({ actions: ["editPath", "removePath"] });
        expect(item("editPath")?.textContent).toContain("Edit path");
        expect(item("removePath")?.textContent).toContain("Remove path");
        // Each with its icon; Remove path has no key, so it can't happen by accident
        expect(item("editPath")?.querySelector("svg")).not.toBeNull();
        expect(item("removePath")?.querySelector("svg")).not.toBeNull();
        expect(item("removePath")?.querySelector("kbd")).toBeNull();
        // None of the field's own
        for (const id of FIELD_MENU_ACTIONS)
            if (id !== "editPath" && id !== "removePath")
                expect(item(id)).toBeNull();
        fireEvent.click(item("editPath")!);
        expect(edit).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalled();
    });

    it("keeps the path bar's slots in their places, greyed out with the reason (round 2)", () => {
        handle("editPath");
        handle("adjustPath", {
            enabled: false,
            reason: "Adjust one marcher at a time: select just one",
        });
        handle("detachPath");
        handle("rejoinPath", { enabled: false });
        handle("adjustResetSpot", {
            enabled: false,
            reason: "Select one marcher to match it to the group path",
        });
        handle("refitPath", { enabled: false, reason: "Already centered" });
        handle("removePath");
        open({ actions: PATH_FIELD_MENU });
        const ids = Array.from(
            screen.getByTestId("field-menu").querySelectorAll("[data-testid]"),
        )
            .map((e) => e.getAttribute("data-testid")!)
            .filter((id) => /^field-menu-[a-zA-Z]+$/.test(id))
            .map((id) => id.replace("field-menu-", ""));
        // Re-fit shows only while it can act; Rejoin only while it holds Detach's slot
        expect(ids).toEqual([
            "editPath",
            "adjustPath",
            "detachPath",
            "adjustResetSpot",
            "removePath",
        ]);
        expect(item("adjustPath")).toHaveAttribute("aria-disabled", "true");
        expect(item("adjustResetSpot")).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });

    it("on a path's line, shows the Path group's entries only where they apply", () => {
        handle("editPath");
        handle("detachPath", { enabled: false });
        handle("rejoinPath");
        handle("removePath");
        open({
            actions: ["editPath", "detachPath", "rejoinPath", "removePath"],
        });
        expect(item("detachPath")).toBeNull();
        expect(item("rejoinPath")?.textContent).toContain("Rejoin group path");
        expect(item("rejoinPath")?.querySelector("svg")).not.toBeNull();
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
        // The Path group shows only what applies: here Edit path, Adjust, Detach and Remove path
        for (const id of [
            "rejoinPath",
            "adjustResetSpot",
            "reverseTrail",
            "refitPath",
        ] as const)
            handle(id, { enabled: false });
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
            ["editPath", "adjustPath", "detachPath", "removePath"],
            [
                "timelineHoldFromPrevious",
                "setSelectedMarchersToPreviousPage",
                "setSelectedMarchersToNextPage",
            ],
            ["splitSelectedIntoNewMove", "timelineSplitMoveAtPlayhead"],
            [
                "alignHorizontally",
                "alignVertically",
                "evenlyDistributeHorizontally",
                "evenlyDistributeVertically",
                "swapMarchers",
            ],
            ["selectAllMarchers"],
        ]);
        expect(item("timelineHoldFromPrevious")).toHaveTextContent(
            "Hold from previous page",
        );
        expect(item("setSelectedMarchersToPreviousPage")).toHaveTextContent(
            "Clear this page (selected)",
        );
    });

    it("shows a split it can't run greyed out with its reason, before it's tried, and hides splits outside timeline mode", () => {
        const split = handle("timelineSplitMoveAtPlayhead", {
            enabled: false,
            reason: "Can't split at a count while a line follows a trail. Remove the trail first.",
        });
        handle("splitSelectedIntoNewMove");
        open();
        const entry = item("timelineSplitMoveAtPlayhead")!;
        expect(entry).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(entry);
        expect(split).not.toHaveBeenCalled();
        expect(screen.getAllByText(/follows a trail/).length).toBeGreaterThan(
            0,
        );
        expect(item("splitSelectedIntoNewMove")).not.toHaveAttribute(
            "aria-disabled",
        );
        cleanup();
        open({ timelineMode: false });
        expect(item("timelineSplitMoveAtPlayhead")).toBeNull();
        expect(item("splitSelectedIntoNewMove")).toBeNull();
    });

    it("runs the hold command through the actions layer, and greys it out where it can't run", () => {
        const blocked = handle("timelineHoldFromPrevious", { enabled: false });
        open();
        fireEvent.click(item("timelineHoldFromPrevious")!);
        expect(blocked).not.toHaveBeenCalled();
        expect(item("timelineHoldFromPrevious")).toHaveAttribute(
            "data-disabled",
        );
        cleanup();
        handlers.splice(0).forEach((off) => off());
        const hold = handle("timelineHoldFromPrevious");
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
        handle("setSelectedMarchersToPreviousPage");
        open();
        const entry = item("timelineHoldFromPrevious")!;
        expect(entry).toHaveAttribute("role", "menuitemcheckbox");
        expect(entry).toHaveAttribute("aria-checked", "true");
        expect(entry).toHaveAttribute("data-disabled");
        expect(entry).toHaveTextContent(/^Hold from previous page/);
        fireEvent.click(entry);
        expect(hold).not.toHaveBeenCalled();
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

    it("leaves the hold command out outside timeline mode, but keeps Clear this page", () => {
        handle("timelineHoldFromPrevious");
        handle("setSelectedMarchersToPreviousPage");
        open({ timelineMode: false });
        expect(item("timelineHoldFromPrevious")).toBeNull();
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
