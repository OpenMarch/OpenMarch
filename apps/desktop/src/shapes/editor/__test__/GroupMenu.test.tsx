import { shortcutStillRuns } from "@/components/timeline/timelineHotkeys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { lineTool } from "../../line/lineTool";
import type { LineParams } from "../../line/lineGeometry";
import { setShapeField } from "../../field/shapeField";
import { shapeContextFor } from "../../field/shapeFieldContext";
import { useShapePointerStore } from "../../field/shapePointer";
import { groupColor } from "../../field/groupDrawing";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../../tool/shapeToolStore";
import { toolEnvFor } from "../../tool/toolEnv";
import { openTool, pointerMove, press, release } from "../../tool/toolMachine";
import { ShapeEditor } from "../ShapeEditorBar";
import { stubPointerCapture } from "./pointerEvents";

/**
 * A Line's interval groups in the real floating editor (owner feedback on #526): one interval
 * number for one group, one button opening the group menu for two or more, rows edited in place,
 * the field told which group is lit, and the switch between the two keeping focus without adding
 * undo steps.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const field = {
    fieldProperties: () => fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
};
const marchers = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));

const tool = () => useShapeToolStore.getState().tool!;
const spacing = () => (tool().params as LineParams).spacing;

function renderEditor() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <ShapeEditor stepPx={STEP} />
        </QueryClientProvider>,
    );
}

/** Opens a number for typing, as a keyboard or screen reader does, and types `text` */
function typeInto(testId: string, text: string) {
    fireEvent.click(screen.getByTestId(testId), { detail: 0 });
    const input = screen.getByTestId(`${testId}-input`);
    act(() => input.focus());
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
}

/** Opens the group menu from its button, from the keyboard */
function openMenu() {
    const button = screen.getByTestId("shape-groups-menu");
    act(() => button.focus());
    fireEvent.keyDown(button, { key: " " });
    fireEvent.click(button);
    return screen.getByTestId("shape-groups-content");
}

let restorePointerCapture: () => void;
beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    restorePointerCapture = stubPointerCapture();
    setShapeField(field);
    const ctx = { ...field, fieldProperties };
    const env = toolEnvFor(ctx);
    let t = openTool(lineTool, marchers);
    t = press(t, { x: 30 * STEP, y: 20 * STEP }, env);
    t = pointerMove(t, { x: 44 * STEP, y: 20 * STEP }, env);
    t = release(t, shapeContextFor(ctx));
    openShapeTool(t, null, null);
});

afterEach(() => {
    cleanup();
    closeShapeTool();
    setShapeField(null);
    restorePointerCapture();
    localStorage.clear();
    vi.unstubAllGlobals();
});

describe("a line's interval groups in the floating editor", () => {
    it("shows one interval as the one number, and no group menu", () => {
        renderEditor();
        expect(screen.getByTestId("shape-editor-interval")).toBeTruthy();
        expect(screen.queryByTestId("shape-groups-menu")).toBeNull();
    });

    it("turns the number into the group menu's button when a list is typed, keeping focus, in one undo step", async () => {
        renderEditor();
        const steps = tool().past.length;
        typeInto("shape-editor-interval", "2*3+4*2");
        const button = screen.getByTestId("shape-groups-menu");
        expect(screen.getByTestId("shape-groups-summary").textContent).toBe(
            "Multiple intervals",
        );
        expect(screen.queryByTestId("shape-editor-interval")).toBeNull();
        // Not while the Enter that applied the list is still going: it would press the button
        expect(document.activeElement).not.toBe(button);
        await waitFor(() => expect(document.activeElement).toBe(button));
        expect(screen.queryByTestId("shape-groups-content")).toBeNull();
        expect(tool().past.length).toBe(steps + 1);
    });

    it("leaves Enter on its button to place the shape, as from the interval; Space and the arrow down open it", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const button = screen.getByTestId("shape-groups-menu");
        act(() => button.focus());
        const reached = vi.fn();
        document.addEventListener("keydown", reached);
        const enter = new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            button.dispatchEvent(enter);
        });
        document.removeEventListener("keydown", reached);
        // Reaches the app's keys, and doesn't press the button
        expect(reached).toHaveBeenCalled();
        expect(enter.defaultPrevented).toBe(true);
        expect(shortcutStillRuns(enter)).toBe(true);
        expect(screen.queryByTestId("shape-groups-content")).toBeNull();
        fireEvent.keyDown(button, { key: "ArrowDown" });
        expect(screen.getByTestId("shape-groups-content")).toBeTruthy();
    });

    it("sums the groups up instead with the numbers style", () => {
        localStorage.setItem("openmarch:groupSummary", "numbers");
        renderEditor();
        typeInto("shape-editor-interval", "2*3+3*2+4");
        expect(screen.getByTestId("shape-groups-summary").textContent).toBe(
            "2·3 + 3·2 + rest·4",
        );
    });

    it("lists a row per group with its color, marchers, count and interval", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+3*2+4");
        const menu = openMenu();
        expect(
            menu.querySelector<HTMLInputElement>("[data-group-list]")!.value,
        ).toBe("2*3+3*2+4");
        const row = (i: number, part: string) =>
            screen.getByTestId(`shape-group-${i}-${part}`);
        expect(row(0, "marchers").textContent).toBe("First 2");
        expect(row(1, "marchers").textContent).toBe("Next 3");
        expect(row(2, "marchers").textContent).toBe("Last 3");
        expect(row(2, "count").textContent).toBe("3");
        expect(screen.getByTestId("shape-group-2").dataset.rest).toBe("true");
        expect([0, 1, 2].map((i) => row(i, "color").dataset.color)).toEqual(
            [0, 1, 2].map(groupColor),
        );
        expect(useShapePointerStore.getState().groupMenu).toEqual({
            lit: null,
        });
    });

    it("lights a row's group on the field while it's pointed at or focused", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+3*2+4");
        openMenu();
        fireEvent.pointerEnter(screen.getByTestId("shape-group-1"));
        expect(useShapePointerStore.getState().groupMenu).toEqual({ lit: 1 });
        fireEvent.pointerLeave(screen.getByTestId("shape-groups"));
        expect(useShapePointerStore.getState().groupMenu).toEqual({
            lit: null,
        });
        act(() => screen.getByTestId("shape-group-2-interval").focus());
        expect(useShapePointerStore.getState().groupMenu).toEqual({ lit: 2 });
    });

    it("edits a row's count and interval in place, each one undo step", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        openMenu();
        const steps = tool().past.length;
        typeInto("shape-group-1-interval", "2.5");
        // Typed, the interval stays unlocked with the groups as typed
        expect(spacing().mode).toBe("fit");
        const groups = (
            spacing() as { groups: { interval: number; count?: number }[] }
        ).groups;
        expect(groups[1]!.interval).toBeCloseTo(2.5 * STEP);
        typeInto("shape-group-0-count", "3");
        expect(
            (spacing() as { groups: { count?: number }[] }).groups[0]!.count,
        ).toBe(3);
        expect(tool().past.length).toBe(steps + 2);
    });

    it("takes a whole list in the field at the top, and keeps nonsense to fix", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const menu = openMenu();
        const list = menu.querySelector<HTMLInputElement>("[data-group-list]")!;
        fireEvent.change(list, { target: { value: "2**" } });
        fireEvent.keyDown(list, { key: "Enter" });
        expect(list.getAttribute("aria-invalid")).toBe("true");
        fireEvent.change(list, { target: { value: "1*3+2*2+5" } });
        fireEvent.keyDown(list, { key: "Enter" });
        expect(screen.getByTestId("shape-group-2").dataset.rest).toBe("true");
        expect(screen.getByTestId("shape-group-0-count").textContent).toBe("1");
    });

    it("names the button and the menu by what they show", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const button = screen.getByTestId("shape-groups-menu");
        expect(button.getAttribute("aria-label")).toBe(
            "Multiple intervals: 2·3 + 6·2",
        );
        expect(openMenu().getAttribute("aria-label")).toBe("Interval groups");
    });

    it("takes the numbers summary as the button's name with the numbers style", () => {
        localStorage.setItem("openmarch:groupSummary", "numbers");
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const button = screen.getByTestId("shape-groups-menu");
        expect(button.hasAttribute("aria-label")).toBe(false);
        expect(button.textContent).toBe("2·3 + 6·2");
    });

    it("puts a list being typed back on Esc, and keeps the menu open", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const menu = openMenu();
        const list = menu.querySelector<HTMLInputElement>("[data-group-list]")!;
        act(() => list.focus());
        fireEvent.change(list, { target: { value: "5*1" } });
        fireEvent.keyDown(list, { key: "Escape" });
        expect(screen.getByTestId("shape-groups-content")).toBeTruthy();
        expect(list.value).toBe("2*3+4*2");
    });

    it("cancels a row's number being typed on Esc, and keeps the menu open", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        openMenu();
        fireEvent.click(screen.getByTestId("shape-group-1-interval"), {
            detail: 0,
        });
        const input = screen.getByTestId("shape-group-1-interval-input");
        act(() => input.focus());
        fireEvent.change(input, { target: { value: "7" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.getByTestId("shape-groups-content")).toBeTruthy();
        expect(screen.queryByTestId("shape-group-1-interval-input")).toBeNull();
        expect(screen.getByTestId("shape-group-1-interval").textContent).toBe(
            "2",
        );
    });

    it("closes on Esc with nothing being typed", async () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const menu = openMenu();
        const list = menu.querySelector<HTMLInputElement>("[data-group-list]")!;
        act(() => list.focus());
        fireEvent.keyDown(list, { key: "Escape" });
        await waitFor(() =>
            expect(screen.queryByTestId("shape-groups-content")).toBeNull(),
        );
    });

    it("applies a list understood when the field is left, and drops one that isn't", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        const menu = openMenu();
        const list = menu.querySelector<HTMLInputElement>("[data-group-list]")!;
        act(() => list.focus());
        fireEvent.change(list, { target: { value: "2**" } });
        fireEvent.blur(list);
        expect(list.value).toBe("2*3+4*2");
        fireEvent.change(list, { target: { value: "1*3+2*2+5" } });
        fireEvent.blur(list);
        expect(screen.getByTestId("shape-group-2").dataset.rest).toBe("true");
        expect(list.value).toBe("1*3+2*2+5");
    });

    it("lights nothing after × until a row is pointed at again", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+3*2+4");
        openMenu();
        fireEvent.pointerEnter(screen.getByTestId("shape-group-1"));
        const remove = screen.getByTestId("shape-group-1-remove");
        act(() => remove.focus());
        expect(useShapePointerStore.getState().groupMenu).toEqual({ lit: 1 });
        fireEvent.click(remove);
        expect(screen.queryByTestId("shape-group-2")).toBeNull();
        expect(useShapePointerStore.getState().groupMenu).toEqual({
            lit: null,
        });
    });

    it("adds a group from the menu", () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        openMenu();
        fireEvent.click(screen.getByTestId("shape-group-add"));
        expect(screen.getByTestId("shape-group-2")).toBeTruthy();
    });

    it("goes back to the one number with focus when groups are removed down to one, in one undo step each", async () => {
        renderEditor();
        typeInto("shape-editor-interval", "2*3+4*2");
        openMenu();
        const steps = tool().past.length;
        const remove = screen.getByTestId("shape-group-1-remove");
        act(() => remove.focus());
        fireEvent.click(remove);
        expect(screen.queryByTestId("shape-groups-menu")).toBeNull();
        expect(screen.queryByTestId("shape-groups-content")).toBeNull();
        const number = screen.getByTestId("shape-editor-interval");
        expect(number.textContent).toBe("3");
        await waitFor(() => expect(document.activeElement).toBe(number));
        expect(tool().past.length).toBe(steps + 1);
        // The field's colors go with the menu
        expect(useShapePointerStore.getState().groupMenu).toBeNull();
    });
});
