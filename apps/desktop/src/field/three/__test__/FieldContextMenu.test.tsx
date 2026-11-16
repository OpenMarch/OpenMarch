import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { ActionId } from "@/shortcuts/definitions";
import { registerActionHandler } from "@/shortcuts/registry";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import FieldContextMenu, {
    FIELD_MENU_ACTIONS,
    useFieldMenu,
} from "../FieldContextMenu";
import type { FieldMarchers } from "../fieldMarchers";
import { useInputModeStore } from "@/stores/InputModeStore";

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
    marcher = null as number | null,
} = {}) {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <FieldContextMenu
                at={{ x: 120, y: 80 }}
                marcher={marcher}
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

    it("previews an entry while highlighted, and stops on leaving it or the menu closing", () => {
        const preview = vi.fn();
        handlers.push(
            registerActionHandler("timelineHoldFromPrevious", {
                run: vi.fn(),
                isEnabled: () => true,
                preview,
            }),
        );
        open({ timelineMode: true });
        const entry = item("timelineHoldFromPrevious")!;
        fireEvent.focus(entry);
        expect(preview).toHaveBeenLastCalledWith(true);
        fireEvent.blur(entry);
        expect(preview).toHaveBeenLastCalledWith(false);
        fireEvent.focus(entry);
        cleanup();
        expect(preview).toHaveBeenLastCalledWith(false);
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

    it("offers editing the item right-clicked, first, only while one is selected", () => {
        for (const id of FIELD_MENU_ACTIONS) handle(id);
        handle("editSelectedItem", { enabled: false });
        open();
        expect(screen.queryByTestId("field-menu-editSelectedItem")).toBeNull();
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
            ["editSelectedItem"],
            [
                "timelineHoldFromPrevious",
                "timelineHoldOverWindow",
                "setSelectedMarchersToPreviousPage",
            ],
            [
                "timelineHoldStyleDefault",
                "timelineHoldStyleStand",
                "timelineHoldStyleMarkTime",
                "timelineHoldStyleHighMarkTime",
            ],
            // #992: what the selection holds, and selecting by it, as submenus; the picked cue's
            // performers while they can change
            [
                "equipment",
                "select-holding",
                "cueAddSelected",
                "cueRemoveSelected",
            ],
            [
                "alignHorizontally",
                "alignVertically",
                "evenlyDistributeHorizontally",
                "evenlyDistributeVertically",
                "swapMarchers",
                "setSelectedMarchersToNextPage",
            ],
            ["selectAllMarchers"],
            ["fieldEditMode"],
        ]);
        expect(item("timelineHoldFromPrevious")).toHaveTextContent(
            "Hold from last keyframe",
        );
        expect(item("setSelectedMarchersToPreviousPage")).toHaveTextContent(
            "Clear this page (selected)",
        );
        expect(item("timelineHoldOverWindow")).toHaveTextContent(
            "Hold from start flag to playhead",
        );
        expect(item("setSelectedMarchersToNextPage")).toHaveTextContent(
            "Move to next page's spots (selected)",
        );
    });

    it("shows Hold style as a group while any of it can run, with the style in effect checked (#775)", () => {
        const styles = [
            "timelineHoldStyleDefault",
            "timelineHoldStyleStand",
            "timelineHoldStyleMarkTime",
            "timelineHoldStyleHighMarkTime",
        ] as const;
        // Nobody Held at the playhead: none can run, and none is in effect
        for (const id of styles) handle(id, { enabled: false });
        open();
        for (const id of styles) expect(item(id)).toBeNull();
        cleanup();
        handlers.splice(0).forEach((off) => off());

        // A Held hold on the show setting: that entry is checked (so off), the others run
        handle("timelineHoldStyleDefault", { enabled: false, checked: true });
        const markTime = handle("timelineHoldStyleMarkTime");
        handle("timelineHoldStyleStand");
        handle("timelineHoldStyleHighMarkTime");
        open();
        expect(item("timelineHoldStyleDefault")).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(item("timelineHoldStyleDefault")).toHaveTextContent(
            "Hold style: Show setting",
        );
        expect(item("timelineHoldStyleStand")).toHaveTextContent(
            "Hold style: Stand",
        );
        expect(item("timelineHoldStyleHighMarkTime")).toHaveTextContent(
            "Hold style: High mark time",
        );
        fireEvent.click(item("timelineHoldStyleMarkTime")!);
        expect(markTime).toHaveBeenCalledTimes(1);
    });

    it("keeps room for a check only in front of the page state commands", () => {
        for (const id of FIELD_MENU_ACTIONS) handle(id);
        open();
        // The check slot is a fixed-width span ahead of the words
        const hasCheckSlot = (id: ActionId) =>
            item(id)!.firstElementChild?.classList.contains("w-[14px]") ??
            false;
        expect(hasCheckSlot("timelineHoldFromPrevious")).toBe(true);
        expect(hasCheckSlot("setSelectedMarchersToPreviousPage")).toBe(true);
        // Move to next page's spots is an edit, with the arranging commands
        expect(hasCheckSlot("setSelectedMarchersToNextPage")).toBe(false);
        expect(hasCheckSlot("alignHorizontally")).toBe(false);
    });

    it("shows Hold from start flag to playhead only while it's available (#476)", () => {
        for (const id of FIELD_MENU_ACTIONS) handle(id);
        handle("timelineHoldOverWindow", { enabled: false });
        open();
        expect(item("timelineHoldOverWindow")).toBeNull();
        expect(item("timelineHoldFromPrevious")).not.toBeNull();
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
        expect(entry).toHaveTextContent(/^Hold from last keyframe/);
        fireEvent.click(entry);
        expect(hold).not.toHaveBeenCalled();
        expect(item("setSelectedMarchersToPreviousPage")).not.toHaveAttribute(
            "data-disabled",
        );
    });

    it("shows a mixed selection's count in the label, and runs", () => {
        const hold = handle("timelineHoldFromPrevious", {
            label: "Hold from last keyframe (3 of 5)",
        });
        handle("setSelectedMarchersToPreviousPage", {
            label: "Clear this page (2 of 5 selected)",
        });
        open();
        const entry = item("timelineHoldFromPrevious")!;
        expect(entry).toHaveTextContent("Hold from last keyframe (3 of 5)");
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

    it("offers Select only this marcher only when opened on a marcher of a box selected whole, and runs it there (tablet 1.5)", () => {
        const run = handle("shapeEnterBox");
        open();
        expect(item("shapeEnterBox")).toBeNull();
        cleanup();
        open({ marcher: 7 });
        fireEvent.click(item("shapeEnterBox")!);
        expect(run).toHaveBeenCalledWith({ marcherId: 7 });
    });

    it("leaves Select only this marcher out while no box is selected whole", () => {
        handle("shapeEnterBox", { enabled: false });
        open({ marcher: 7 });
        expect(item("shapeEnterBox")).toBeNull();
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

    it("opens below the point with a mouse, and beside it in the touch layout, where it slides to stay on screen (#928)", () => {
        open();
        const menu = screen.getByTestId("field-menu");
        expect(menu).toHaveAttribute("data-side", "bottom");
        expect(menu.className).not.toContain("overflow-y-auto");
        cleanup();
        const before = useInputModeStore.getState().preference;
        act(() => {
            useInputModeStore.getState().setPreference("touch");
        });
        try {
            open();
            const touchMenu = screen.getByTestId("field-menu");
            expect(touchMenu).toHaveAttribute("data-side", "right");
            // Never taller than the room there: it scrolls instead
            expect(touchMenu.className).toContain(
                "max-h-(--radix-dropdown-menu-content-available-height)",
            );
            expect(touchMenu.className).toContain("overflow-y-auto");
        } finally {
            act(() => {
                useInputModeStore.getState().setPreference(before);
            });
            localStorage.clear();
        }
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

describe("useFieldMenu", () => {
    const menu = () =>
        renderHook(() =>
            useFieldMenu({
                marchers: {} as FieldMarchers,
                editor: { blocksFieldMenu: () => false } as FieldEditor,
                hasSelection: true,
            }),
        );

    afterEach(cleanup);

    it("leaves a press on the field alone while closed", () => {
        const { result } = menu();
        expect(result.current.takePress()).toBe(false);
        expect(result.current.at).toBeNull();
    });

    it("takes a press on the field while open and only closes (#876: a finger's tap on a marcher)", () => {
        const { result } = menu();
        act(() => result.current.openAt({ x: 10, y: 20 }, 2));
        expect(result.current.at).toEqual({ x: 10, y: 20 });

        let taken = false;
        act(() => {
            taken = result.current.takePress();
        });
        expect(taken).toBe(true);
        expect(result.current.at).toBeNull();
        expect(result.current.marcher).toBeNull();
        // Closed, the next press is the field's again
        expect(result.current.takePress()).toBe(false);
    });

    it("takes a press the menu already closed itself on, until it's drawn closed (a mouse's press)", () => {
        const { result } = menu();
        act(() => result.current.openAt({ x: 10, y: 20 }, null));
        // The menu's own close on a press outside it, before the field hears the press
        result.current.close();
        expect(result.current.takePress()).toBe(true);
    });
});
