import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import ShortcutDispatcher from "@/shortcuts/ShortcutDispatcher";
import type { ActionId } from "@/shortcuts/definitions";
import { registerActionHandler } from "@/shortcuts/registry";
import { fieldEditMode } from "../fieldEditModeStore";
import { focusFieldEditPane } from "../fieldEditPanes";
import { LineDetail } from "../panel/LineDetail";
import { toRef } from "../lines";
import {
    keyIsForField,
    keyIsForLines,
    useFieldEditModeEntry,
} from "../useFieldEditModeActions";

/**
 * The Field panel's keys (#824 review): Tab, Enter, H, the arrows, Delete and Space belong to
 * the Line section's fields and other form controls while they have focus; F6 moves between the
 * field and the Field panel; and the mode ends with the show.
 */

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const forty = college.xCheckpoints.find((c) => c.stepsFromCenterFront === 16)!;

beforeAll(async () => {
    await tolgee.run();
    // Radix's switch measures itself
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

const offs: (() => void)[] = [];
afterEach(() => {
    cleanup();
    offs.splice(0).forEach((off) => off());
    fieldEditMode.exit();
    document.body.innerHTML = "";
});

/** A handler for an action, enabled as the mode enables it */
function handle(id: ActionId, enabled: () => boolean = () => true) {
    const run = vi.fn();
    offs.push(registerActionHandler(id, { run, isEnabled: enabled }));
    return run;
}

/** The mode's key handlers that matter here, gated the way the mode gates them */
function modeKeys() {
    return {
        hide: handle("fieldEditToggleVisible", keyIsForLines),
        remove: handle("fieldEditDeleteLines", keyIsForLines),
        nudge: handle("fieldEditNudgeRight", keyIsForLines),
        next: handle("fieldEditNextLine", keyIsForField),
        edit: handle("fieldEditEditLine", keyIsForField),
        play: handle("playPause"),
    };
}

function Providers({ children }: { children: ReactNode }) {
    return (
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <QueryClientProvider client={new QueryClient()}>
                {children}
            </QueryClientProvider>
        </TolgeeProvider>
    );
}

/** Presses a key on the focused element, as the browser sends it */
const press = (key: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(document.activeElement ?? document.body, {
        key,
        ...init,
    });

describe("which keys are the field's", () => {
    it("are the field's from the body, the field and a plain button", () => {
        const view = render(
            <>
                <div
                    data-field-edit-overlay
                    tabIndex={-1}
                    data-testid="field"
                />
                <button type="button" data-testid="bar-button">
                    Hide/Show
                </button>
            </>,
        );
        const seen: [boolean, boolean][] = [];
        const listen = () => seen.push([keyIsForField(), keyIsForLines()]);
        window.addEventListener("keydown", listen);
        press("h");
        view.getByTestId("field").focus();
        press("h");
        view.getByTestId("bar-button").focus();
        press("h");
        window.removeEventListener("keydown", listen);
        // Tab and Enter on a bar button are the button's; H there still hides
        expect(seen).toEqual([
            [true, true],
            [true, true],
            [false, true],
        ]);
    });

    it("aren't the field's in a menu, a dialog or a form control, even inside the field", () => {
        const view = render(
            <div data-field-edit-overlay>
                <div role="menu">
                    <button type="button" role="menuitem" data-testid="item">
                        Hide
                    </button>
                </div>
                <form role="dialog">
                    <button
                        type="button"
                        role="switch"
                        aria-checked="true"
                        data-testid="switch"
                    >
                        Visible
                    </button>
                </form>
                <input data-testid="input" />
            </div>,
        );
        for (const id of ["item", "switch", "input"]) {
            view.getByTestId(id).focus();
            let answer: [boolean, boolean] | null = null;
            const listen = () => (answer = [keyIsForField(), keyIsForLines()]);
            window.addEventListener("keydown", listen);
            press("h");
            window.removeEventListener("keydown", listen);
            expect(answer, id).toEqual([false, false]);
        }
    });

    it("answer for clicks and the palette: anything that isn't a key press is the field's", () => {
        render(<input data-testid="input" />);
        (document.querySelector("input") as HTMLInputElement).focus();
        expect(keyIsForField()).toBe(true);
        expect(keyIsForLines()).toBe(true);
    });
});

describe("the Line section", () => {
    const open = () => {
        fieldEditMode.enter({ lines: true });
        fieldEditMode.select([toRef(forty)]);
        return render(
            <Providers>
                <ShortcutDispatcher />
                <div data-field-edit-pane="field" tabIndex={-1} />
                <LineDetail fp={college} />
            </Providers>,
        );
    };

    it("keeps its keys in Position, the names and its switches", () => {
        const keys = modeKeys();
        const view = open();
        for (const id of [
            "field-line-position",
            "field-line-name",
            "field-line-visible",
        ]) {
            view.getByTestId(id).focus();
            // Enter in a field saves it and gives the keyboard back to the field: its own test
            for (const key of ["h", "Delete", "ArrowRight", " ", "Tab"])
                press(key, { code: key === " " ? "Space" : undefined });
        }
        view.getByTestId("field-line-position").focus();
        press("Enter");
        for (const run of Object.values(keys)) expect(run).not.toBeCalled();
    });

    it("still lets ⌘/Ctrl chords and F6 through", () => {
        const undo = handle("performUndo");
        const pane = handle("fieldEditNextPane");
        const view = open();
        view.getByTestId("field-line-visible").focus();
        press("z", { ctrlKey: true, code: "KeyZ" });
        press("F6", { code: "F6" });
        expect(undo).toHaveBeenCalledTimes(1);
        expect(pane).toHaveBeenCalledTimes(1);
    });
});

describe("F6 between the field and the Field panel", () => {
    it("goes round the panes, onto each one's first control", () => {
        const view = render(
            <>
                <div
                    data-field-edit-pane="field"
                    tabIndex={-1}
                    data-testid="field"
                />
                <div data-field-edit-pane="panel">
                    <button type="button" disabled>
                        Delete
                    </button>
                    <button type="button" data-testid="panel-first">
                        X line
                    </button>
                </div>
            </>,
        );
        // From nowhere (the body) is from the field
        expect(focusFieldEditPane(1)).toBe("panel");
        expect(document.activeElement).toBe(view.getByTestId("panel-first"));
        expect(focusFieldEditPane(1)).toBe("field");
        expect(document.activeElement).toBe(view.getByTestId("field"));
        expect(focusFieldEditPane(-1)).toBe("panel");
    });
});

describe("the mode and the show", () => {
    function Entry() {
        useFieldEditModeEntry();
        return null;
    }

    it("ends with the show: closing it leaves the mode, with nothing picked or dragged", () => {
        const view = render(
            <Providers>
                <Entry />
            </Providers>,
        );
        act(() => {
            fieldEditMode.enter();
            fieldEditMode.select([toRef(forty)]);
            fieldEditMode.setDrag({
                kind: "move",
                axis: "x",
                steps: 4,
                overRuler: false,
                lines: [toRef(forty)],
            });
        });
        view.unmount();
        expect(fieldEditMode.get()).toMatchObject({
            active: false,
            selection: [],
            drag: null,
        });
    });

    it("starts outside it when a show opens", () => {
        fieldEditMode.enter();
        render(
            <Providers>
                <Entry />
            </Providers>,
        );
        expect(fieldEditMode.isActive()).toBe(false);
    });
});
