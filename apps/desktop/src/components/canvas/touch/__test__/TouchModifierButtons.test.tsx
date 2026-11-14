import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import { isSnapOn, useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    isShiftHeld,
    onScreenRoles,
    subscribeOnScreen,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";
import "@/shapes/editor/__test__/pointerEvents";
import { useAlignmentActionHandlers } from "@/shortcuts/handlers/useAlignmentActionHandlers";
import { subscribeToActionRuns } from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";
import { FIELD_DRAG_MODE_KEY, useFieldDragModeStore } from "../fieldDragMode";
import TouchModifierButtons, {
    parseModifierPosition,
    TOUCH_MODIFIER_POSITION_KEY,
} from "../TouchModifierButtons";

/**
 * The touch pill over the field: Fine, Equal and From center (held roles), Add (the old Shift)
 * and a magnet that runs the Toggle Snap action, each named by what it does, never by a key. Shown only in the
 * touch layout.
 */

const touchMode = (on: boolean) => {
    act(() => {
        useInputModeStore.getState().setPreference(on ? "touch" : "mouse");
    });
};

function renderPill() {
    return render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TouchModifierButtons />
        </TolgeeProvider>,
    );
}

/**
 * The pill at a saved spot: until it has one, or has placed itself (no layout here), it's hidden,
 * and out of the accessibility tree
 */
function renderPlacedPill() {
    localStorage.setItem(
        TOUCH_MODIFIER_POSITION_KEY,
        JSON.stringify({ left: 40, bottom: 60 }),
    );
    return renderPill();
}

const button = (toggle: string) => screen.getByTestId(`touch-toggle-${toggle}`);

/** A quick press and release: a tap */
const tap = (el: HTMLElement) => {
    fireEvent.pointerDown(el, { pointerId: 5, pointerType: "touch" });
    fireEvent.pointerUp(el, { pointerId: 5, pointerType: "touch" });
};

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    useTouchModifierStore.getState().clear();
    useInputModeStore.getState().setPreference("auto");
    localStorage.removeItem(TOUCH_MODIFIER_POSITION_KEY);
    useUiSettingsStore.getState().setSnap(true);
    useFieldDragModeStore.getState().setMode("auto");
});

describe("the pill", () => {
    it("shows only in the touch layout", () => {
        touchMode(false);
        renderPill();
        expect(screen.queryByTestId("touch-modifier-buttons")).toBeNull();
        touchMode(true);
        expect(screen.getByTestId("touch-modifier-buttons")).toBeTruthy();
    });

    it("names its buttons by role, never by key", () => {
        touchMode(true);
        renderPill();
        const pill = screen.getByTestId("touch-modifier-buttons");
        for (const name of [
            "Fine",
            "Equal",
            "From center",
            "Add",
            "Subtract",
            "Drag:",
        ])
            expect(pill.textContent).toContain(name);
        const labels = [...pill.querySelectorAll("[aria-label]")]
            .map((el) => el.getAttribute("aria-label"))
            .join(" ");
        expect(`${pill.textContent} ${labels}`).not.toMatch(
            /Shift|Alt|Ctrl|Cmd|⇧|⌥|⌘/,
        );
    });

    it("lets go of everything held or latched when the field goes away", () => {
        touchMode(true);
        const { unmount } = renderPill();
        tap(button("fine"));
        fireEvent.pointerDown(button("constrain"), {
            pointerId: 6,
            pointerType: "touch",
        });
        expect(onScreenRoles()).toEqual(new Set(["fine", "constrain"]));
        unmount();
        expect(onScreenRoles().size).toBe(0);
    });

    it("lets go of everything held or latched when the touch layout is left", () => {
        touchMode(true);
        renderPill();
        tap(button("fine"));
        expect(onScreenRoles().has("fine")).toBe(true);
        touchMode(false);
        expect(onScreenRoles().size).toBe(0);
    });
});

describe.each([
    ["fine", "Fine"],
    ["constrain", "Equal"],
    ["fromCenter", "From center"],
] as const)("%s (%s)", (role) => {
    it("a tap latches it on, and another turns it off", () => {
        touchMode(true);
        renderPill();
        expect(button(role).getAttribute("aria-pressed")).toBe("false");
        tap(button(role));
        expect(onScreenRoles()).toEqual(new Set([role]));
        expect(button(role).getAttribute("aria-pressed")).toBe("true");
        tap(button(role));
        expect(onScreenRoles().size).toBe(0);
        expect(button(role).getAttribute("aria-pressed")).toBe("false");
    });

    it("held while another finger works, it's on only while held", () => {
        touchMode(true);
        renderPill();
        fireEvent.pointerDown(button(role), {
            pointerId: 5,
            pointerType: "touch",
        });
        expect(onScreenRoles()).toEqual(new Set([role]));
        expect(button(role).getAttribute("aria-pressed")).toBe("true");
        // The Pencil goes down on the field meanwhile: the hold is being used
        fireEvent.pointerDown(window, { pointerId: 9, pointerType: "pen" });
        fireEvent.pointerUp(button(role), {
            pointerId: 5,
            pointerType: "touch",
        });
        expect(onScreenRoles().size).toBe(0);
        expect(button(role).getAttribute("aria-pressed")).toBe("false");
    });

    it("held, lets go when the press loses its capture (the palm guard took the finger's release)", () => {
        touchMode(true);
        renderPill();
        fireEvent.pointerDown(button(role), {
            pointerId: 5,
            pointerType: "touch",
        });
        expect(onScreenRoles()).toEqual(new Set([role]));
        fireEvent.lostPointerCapture(button(role), { pointerId: 5 });
        expect(onScreenRoles().size).toBe(0);
        expect(button(role).getAttribute("aria-pressed")).toBe("false");
    });

    it("tapped mid-drag, the drag hears one change, not two", () => {
        touchMode(true);
        renderPill();
        fireEvent.pointerDown(button(role), {
            pointerId: 5,
            pointerType: "touch",
        });
        const changed = vi.fn();
        const stop = subscribeOnScreen(changed);
        fireEvent.pointerUp(button(role), {
            pointerId: 5,
            pointerType: "touch",
        });
        stop();
        expect(onScreenRoles()).toEqual(new Set([role]));
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("Enter on the keyboard latches it", () => {
        touchMode(true);
        renderPill();
        fireEvent.keyDown(button(role), { key: "Enter" });
        expect(onScreenRoles()).toEqual(new Set([role]));
    });
});

describe("Add", () => {
    it("a tap latches it, which the Select tab reads as Shift", () => {
        touchMode(true);
        renderPill();
        tap(button("add"));
        expect(isShiftHeld()).toBe(true);
        expect(onScreenRoles().size).toBe(0);
        expect(button("add").getAttribute("aria-pressed")).toBe("true");
    });
});

describe.each([
    [
        "fine",
        "Fine",
        "Marchers move slowly, off the grid; shapes leave the half steps; turns go by whole degrees",
    ],
    ["constrain", "Equal", "Equal spacings"],
    ["fromCenter", "From center", "from their center"],
    ["add", "Add", "adds them to the selection"],
    ["subtract", "Subtract", "out of the selection"],
] as const)("%s, for assistive tech", (toggle, name, hint) => {
    const pressed = () =>
        screen.getByRole("button", { name }).getAttribute("aria-pressed");

    it("is named by its visible label whatever its state, with the hint as its description", () => {
        touchMode(true);
        renderPlacedPill();
        const el = screen.getByRole("button", { name });
        expect(el.textContent).toBe(name);
        expect(el.getAttribute("title")).toContain(hint);
        fireEvent.click(el);
        expect(screen.getByRole("button", { name })).toBe(el);
        expect(el.getAttribute("title")).toContain(hint);
    });

    it("a click with no pointer (VoiceOver, Voice Control, Switch Control) latches it, and another turns it off", () => {
        touchMode(true);
        renderPlacedPill();
        expect(pressed()).toBe("false");
        fireEvent.click(screen.getByRole("button", { name }));
        expect(pressed()).toBe("true");
        fireEvent.click(screen.getByRole("button", { name }));
        expect(pressed()).toBe("false");
    });

    it("a tap's own click doesn't latch it a second time", () => {
        touchMode(true);
        renderPlacedPill();
        const el = screen.getByRole("button", { name });
        tap(el);
        fireEvent.click(el, { detail: 1 });
        expect(pressed()).toBe("true");
    });

    it("held, reads as pressed under the same name", () => {
        touchMode(true);
        renderPlacedPill();
        const el = screen.getByRole("button", { name });
        fireEvent.pointerDown(el, { pointerId: 5, pointerType: "touch" });
        expect(screen.getByRole("button", { name })).toBe(el);
        expect(pressed()).toBe("true");
        fireEvent.pointerCancel(el, { pointerId: 5, pointerType: "touch" });
        expect(pressed()).toBe("false");
    });

    it("Enter held down toggles it once, not on every repeat", () => {
        touchMode(true);
        renderPlacedPill();
        const el = screen.getByRole("button", { name });
        fireEvent.keyDown(el, { key: "Enter" });
        expect(pressed()).toBe("true");
        for (let i = 0; i < 2; i++) {
            fireEvent.keyDown(el, { key: "Enter", repeat: true });
            expect(pressed()).toBe("true");
        }
    });
});

/** The app's alignment handlers, Toggle Snap among them, as `ActionHandlers` mounts them */
function AlignmentHandlers() {
    useAlignmentActionHandlers();
    return null;
}

/** The pill at a saved spot, with the Toggle Snap action's handler registered */
function renderPlacedPillWithHandlers() {
    localStorage.setItem(
        TOUCH_MODIFIER_POSITION_KEY,
        JSON.stringify({ left: 40, bottom: 60 }),
    );
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <AlignmentHandlers />
                <TouchModifierButtons />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
}

describe("the magnet", () => {
    it("a tap turns the Snap toggle off, pressed, and another turns it back on", () => {
        touchMode(true);
        renderPlacedPillWithHandlers();
        const magnet = screen.getByRole("button", { name: "Snap off" });
        expect(isSnapOn()).toBe(true);
        expect(magnet.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(magnet);
        expect(isSnapOn()).toBe(false);
        expect(magnet.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(magnet);
        expect(isSnapOn()).toBe(true);
        expect(magnet.getAttribute("aria-pressed")).toBe("false");
    });

    it("runs the Toggle Snap action, as the toolbar's magnet and Shift+M do", () => {
        touchMode(true);
        renderPlacedPillWithHandlers();
        const runs: ActionId[] = [];
        const stop = subscribeToActionRuns((id) => runs.push(id));
        try {
            fireEvent.click(screen.getByRole("button", { name: "Snap off" }));
        } finally {
            stop();
        }
        expect(runs).toEqual(["toggleSnap"]);
    });

    it("is disabled while the action can't run, and a press then does nothing", () => {
        touchMode(true);
        renderPlacedPill();
        const magnet = screen.getByRole("button", { name: "Snap off" });
        expect(magnet).toHaveProperty("disabled", true);
        fireEvent.click(magnet);
        expect(isSnapOn()).toBe(true);
    });

    it("shows the Snap toggle turned off elsewhere (Shift+M)", () => {
        touchMode(true);
        renderPlacedPillWithHandlers();
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        expect(
            screen
                .getByRole("button", { name: "Snap off" })
                .getAttribute("aria-pressed"),
        ).toBe("true");
    });
});

describe("where it sits", () => {
    it("goes back where it was dragged to, from local storage", () => {
        localStorage.setItem(
            TOUCH_MODIFIER_POSITION_KEY,
            JSON.stringify({ left: 40, bottom: 60 }),
        );
        touchMode(true);
        renderPill();
        const pill = screen.getByTestId("touch-modifier-buttons");
        expect(pill.style.left).toBe("40px");
        expect(pill.style.bottom).toBe("60px");
    });

    it("dragged by its grip, stays where it was dropped, and remembers it", () => {
        touchMode(true);
        renderPlacedPill();
        const grip = screen.getByRole("button", { name: "Move these buttons" });
        fireEvent.pointerDown(grip, {
            pointerId: 3,
            clientX: 100,
            clientY: 100,
        });
        fireEvent.pointerMove(grip, {
            pointerId: 3,
            clientX: 130,
            clientY: 80,
        });
        fireEvent.pointerUp(grip, { pointerId: 3, clientX: 130, clientY: 80 });
        const pill = screen.getByTestId("touch-modifier-buttons");
        expect(pill.style.left).toBe("70px");
        expect(pill.style.bottom).toBe("80px");
        expect(
            JSON.parse(localStorage.getItem(TOUCH_MODIFIER_POSITION_KEY)!),
        ).toEqual({ left: 70, bottom: 80 });
    });

    it("moves aside from its saved spot for a task's bar, and a drag then follows the finger (#927)", () => {
        // A field area of 800 × 600 with the line tool's card across its bottom, over the saved
        // spot (40 from the left, 60 from the bottom)
        const area = document.createElement("div");
        Object.defineProperty(area, "clientWidth", { value: 800 });
        Object.defineProperty(area, "clientHeight", { value: 600 });
        document.body.append(area);
        const card = document.createElement("div");
        card.setAttribute("data-field-layer", "task");
        card.getBoundingClientRect = () =>
            ({ left: 0, top: 500, width: 400, height: 100 }) as DOMRect;
        document.body.append(card);
        const offsetParent = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            "offsetParent",
        );
        Object.defineProperty(HTMLElement.prototype, "offsetParent", {
            configurable: true,
            get() {
                return area;
            },
        });
        try {
            localStorage.setItem(
                TOUCH_MODIFIER_POSITION_KEY,
                JSON.stringify({ left: 40, bottom: 60 }),
            );
            touchMode(true);
            render(
                <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                    <TouchModifierButtons />
                </TolgeeProvider>,
                { container: area },
            );
            const pill = screen.getByTestId("touch-modifier-buttons");
            // Off the card: its automatic spot, at the bottom right
            expect(pill.style.left).toBe("788px");
            expect(pill.style.bottom).toBe("112px");

            const grip = screen.getByRole("button", {
                name: "Move these buttons",
            });
            fireEvent.pointerDown(grip, {
                pointerId: 3,
                clientX: 100,
                clientY: 100,
            });
            fireEvent.pointerMove(grip, {
                pointerId: 3,
                clientX: 90,
                clientY: 80,
            });
            // Following the finger from where it was, mid-drag
            expect(pill.style.left).toBe("778px");
            expect(pill.style.bottom).toBe("132px");
            fireEvent.pointerUp(grip, {
                pointerId: 3,
                clientX: 90,
                clientY: 80,
            });
            expect(pill.style.left).toBe("778px");
            expect(
                JSON.parse(localStorage.getItem(TOUCH_MODIFIER_POSITION_KEY)!),
            ).toEqual({ left: 778, bottom: 132 });
        } finally {
            if (offsetParent)
                Object.defineProperty(
                    HTMLElement.prototype,
                    "offsetParent",
                    offsetParent,
                );
            card.remove();
            area.remove();
        }
    });

    it("reads a stored spot, and nothing for anything else", () => {
        expect(parseModifierPosition('{"left":12,"bottom":30}')).toEqual({
            left: 12,
            bottom: 30,
        });
        expect(parseModifierPosition(null)).toBeNull();
        expect(parseModifierPosition("")).toBeNull();
        expect(parseModifierPosition("not json")).toBeNull();
        expect(parseModifierPosition('{"left":12}')).toBeNull();
        expect(parseModifierPosition('{"left":"12","bottom":30}')).toBeNull();
        expect(parseModifierPosition('{"left":null,"bottom":30}')).toBeNull();
    });
});

describe("Subtract", () => {
    it("a tap latches it, which the field reads as Alt's subtract, and lets go of Add", () => {
        touchMode(true);
        renderPill();
        tap(button("add"));
        tap(button("subtract"));
        expect(button("subtract").getAttribute("aria-pressed")).toBe("true");
        expect(button("add").getAttribute("aria-pressed")).toBe("false");
        expect(isShiftHeld()).toBe(false);
        expect(onScreenRoles().size).toBe(0);
    });
});

describe("the drag mode menu (tablet 1.3)", () => {
    it("says the mode on the button, Auto to start with", () => {
        touchMode(true);
        renderPlacedPill();
        const mode = screen.getByTestId("field-drag-mode");
        expect(mode.textContent).toContain("Auto");
        expect(mode.getAttribute("aria-label")).toContain(
            "One finger moves the view",
        );
        expect(mode.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens a menu of the four modes, the current one checked", () => {
        touchMode(true);
        renderPlacedPill();
        fireEvent.click(screen.getByTestId("field-drag-mode"));
        const menu = screen.getByRole("menu", { name: "Drag on empty field" });
        const entries = [
            ...menu.querySelectorAll("[role='menuitemradio']"),
        ] as HTMLElement[];
        expect(entries.map((e) => e.textContent?.split(/One|\s/)[0])).toEqual([
            "Auto",
            "Box",
            "Lasso",
            "Pan",
        ]);
        expect(entries.map((e) => e.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
            "false",
        ]);
        expect(menu.textContent).toContain("Two fingers move the view");
    });

    it("picking a mode keeps it on this device, shows it, and closes the menu", () => {
        touchMode(true);
        renderPlacedPill();
        fireEvent.click(screen.getByTestId("field-drag-mode"));
        fireEvent.click(screen.getByTestId("field-drag-mode-box"));
        expect(useFieldDragModeStore.getState().mode).toBe("box");
        expect(localStorage.getItem(FIELD_DRAG_MODE_KEY)).toBe("box");
        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.getByTestId("field-drag-mode").textContent).toContain(
            "Box",
        );
    });

    it("closes on a press elsewhere, which does nothing more, changing nothing", () => {
        touchMode(true);
        renderPlacedPill();
        fireEvent.click(screen.getByTestId("field-drag-mode"));
        fireEvent.pointerDown(document.body, { pointerId: 9 });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(useFieldDragModeStore.getState().mode).toBe("auto");
    });
});
