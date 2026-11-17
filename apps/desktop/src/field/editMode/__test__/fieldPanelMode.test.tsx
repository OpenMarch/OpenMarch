import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import ShortcutDispatcher from "@/shortcuts/ShortcutDispatcher";
import { registerActionHandler } from "@/shortcuts/registry";
import { fieldEditMode } from "../fieldEditModeStore";
import { toRef } from "../lines";
import {
    useFieldEditModeEntry,
    useFieldPanelActions,
} from "../useFieldEditModeActions";
import { CommitInput, parseNumber } from "../panel/settingsInputs";
import { LinesTab } from "../panel/LinesTab";
import { LineDetail } from "../panel/LineDetail";
import { lineRows } from "../panel/LinesList";
import { FieldEditOverlay } from "../FieldEditOverlay";

/**
 * The Field panel (#824): it opens on Setup, the Lines tab is the mode for lines, Escape drops the
 * pick and then shuts the panel, the drill's canvas keys are off while it's open, and the Lines
 * tab's Line section is the one place a line's values change.
 */

const apply = vi.hoisted(() =>
    vi.fn(async (..._args: unknown[]) => ({ diff: { ok: true } })),
);
vi.mock("../useApplyFieldEdits", async (original) => ({
    ...(await original<typeof import("../useApplyFieldEdits")>()),
    useApplyFieldEdits: () => apply,
}));

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const forty = college.xCheckpoints.find((c) => c.stepsFromCenterFront === 16)!;

beforeAll(async () => {
    await tolgee.run();
});

const offs: (() => void)[] = [];
afterEach(() => {
    cleanup();
    offs.splice(0).forEach((off) => off());
    fieldEditMode.exit();
    fieldEditMode.setMirror(true);
    fieldEditMode.setAxis("x");
    apply.mockClear();
});

function Providers({ children }: { children: ReactNode }) {
    return (
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <QueryClientProvider client={new QueryClient()}>
                {children}
            </QueryClientProvider>
        </TolgeeProvider>
    );
}

describe("the panel and Edit lines", () => {
    it("opens on Setup with Edit lines off", () => {
        fieldEditMode.enter();
        expect(fieldEditMode.get()).toMatchObject({
            active: true,
            lines: false,
            tab: "setup",
        });
    });

    it("makes the Lines tab the mode: another tab ends it, with nothing picked", () => {
        fieldEditMode.enter();
        fieldEditMode.setTab("lines");
        expect(fieldEditMode.get()).toMatchObject({
            lines: true,
            tab: "lines",
        });
        fieldEditMode.select([toRef(forty)]);
        fieldEditMode.setTab("appearance");
        expect(fieldEditMode.get()).toMatchObject({
            lines: false,
            tab: "appearance",
            selection: [],
        });
    });

    it("keeps Mirror sides across tabs", () => {
        fieldEditMode.enter({ lines: true });
        fieldEditMode.setMirror(false);
        fieldEditMode.setTab("setup");
        fieldEditMode.setTab("lines");
        expect(fieldEditMode.get().mirror).toBe(false);
    });

    it("has no lines mode while the panel is shut", () => {
        fieldEditMode.enter({ lines: true });
        expect(fieldEditMode.get()).toMatchObject({
            lines: true,
            tab: "lines",
        });
        fieldEditMode.exit();
        expect(fieldEditMode.get()).toMatchObject({
            active: false,
            lines: false,
        });
    });
});

describe("keys while the panel is open", () => {
    function PanelKeys() {
        useFieldEditModeEntry();
        useFieldPanelActions();
        return null;
    }

    it("Escape drops the pick, then shuts the panel", () => {
        render(
            <Providers>
                <ShortcutDispatcher />
                <PanelKeys />
            </Providers>,
        );
        act(() => {
            fieldEditMode.enter({ lines: true });
            fieldEditMode.select([toRef(forty)]);
        });
        const escape = () =>
            act(() => {
                fireEvent.keyDown(document.body, { key: "Escape" });
            });
        escape();
        expect(fieldEditMode.get()).toMatchObject({
            active: true,
            lines: true,
            selection: [],
        });
        escape();
        expect(fieldEditMode.isActive()).toBe(false);
    });

    it("Escape in a text field is the field's", () => {
        render(
            <Providers>
                <ShortcutDispatcher />
                <PanelKeys />
                <input data-testid="name" />
            </Providers>,
        );
        act(() => fieldEditMode.enter());
        const input = document.querySelector("input")!;
        input.focus();
        act(() => {
            fireEvent.keyDown(input, { key: "Escape" });
        });
        expect(fieldEditMode.isActive()).toBe(true);
    });

    it("turns the drill's canvas keys off, so a line key can't fall through to one", () => {
        const lockX = vi.fn();
        offs.push(
            registerActionHandler("lockX", {
                run: lockX,
                isEnabled: () => true,
            }),
        );
        render(
            <Providers>
                <ShortcutDispatcher />
            </Providers>,
        );
        const pressY = () =>
            act(() => {
                fireEvent.keyDown(document.body, { key: "y", code: "KeyY" });
            });
        pressY();
        expect(lockX).toHaveBeenCalledTimes(1);
        act(() => fieldEditMode.enter());
        pressY();
        expect(lockX).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+A doesn't pick the marchers while the panel is open (sims)", () => {
        const selectMarchers = vi.fn();
        offs.push(
            registerActionHandler("selectAllMarchers", {
                run: selectMarchers,
                isEnabled: () => true,
            }),
        );
        render(
            <Providers>
                <ShortcutDispatcher />
                <PanelKeys />
            </Providers>,
        );
        act(() => fieldEditMode.enter());
        act(() => {
            fireEvent.keyDown(document.body, {
                key: "a",
                code: "KeyA",
                ctrlKey: true,
            });
        });
        expect(selectMarchers).not.toHaveBeenCalled();
    });

    it("Escape in a setting's field drops the typing, saves nothing and keeps the panel open (roast)", () => {
        const onCommit = vi.fn();
        render(
            <Providers>
                <ShortcutDispatcher />
                <PanelKeys />
                <CommitInput
                    label="Step size"
                    stored="22.5"
                    current={22.5}
                    parse={(text) => parseNumber(text, { min: 0 })}
                    onCommit={onCommit}
                    testId="step"
                />
            </Providers>,
        );
        act(() => fieldEditMode.enter());
        const input =
            document.querySelector<HTMLInputElement>("[data-testid=step]")!;
        input.focus();
        fireEvent.change(input, { target: { value: "30" } });
        act(() => {
            fireEvent.keyDown(input, { key: "Escape" });
        });
        expect(onCommit).not.toHaveBeenCalled();
        expect(input.value).toBe("22.5");
        expect(fieldEditMode.isActive()).toBe(true);
    });
});

describe("the Lines tab", () => {
    it("lets the axis switch change lists while a line is picked (roast)", () => {
        const view = render(
            <Providers>
                <LinesTab fp={college} />
            </Providers>,
        );
        act(() => {
            fieldEditMode.enter({ lines: true });
            fieldEditMode.select([toRef(forty)]);
        });
        expect(view.queryByTestId("field-lines-x")).not.toBeNull();
        act(() => {
            fireEvent.mouseDown(view.getByTestId("field-lines-axis-y"));
            fireEvent.click(view.getByTestId("field-lines-axis-y"));
        });
        expect(view.queryByTestId("field-lines-y")).not.toBeNull();
        expect(view.queryByTestId("field-lines-x")).toBeNull();
    });

    it("picks from the list: click, Ctrl-click to add, Shift-click for a range", () => {
        act(() => fieldEditMode.enter({ lines: true }));
        const view = render(
            <Providers>
                <LinesTab fp={college} />
            </Providers>,
        );
        const rows = [
            ...view.container.querySelectorAll<HTMLElement>(
                "[data-field-line-row]",
            ),
        ];
        const ids = () => fieldEditMode.get().selection.map((r) => r.id);
        const rowId = (i: number) =>
            Number(rows[i]!.dataset.fieldLineRow!.split(":")[1]);
        act(() => {
            fireEvent.click(rows[1]!);
        });
        expect(ids()).toEqual([rowId(1)]);
        act(() => {
            fireEvent.click(rows[3]!, { ctrlKey: true });
        });
        expect(ids()).toEqual([rowId(1), rowId(3)]);
        act(() => {
            fireEvent.click(rows[5]!, { shiftKey: true });
        });
        expect(ids()).toEqual([rowId(3), rowId(4), rowId(5)]);
    });

    it("has no buttons on its rows: they change nothing themselves", () => {
        act(() => fieldEditMode.enter({ lines: true }));
        const view = render(
            <Providers>
                <LinesTab fp={college} />
            </Providers>,
        );
        expect(
            view.container.querySelectorAll("[data-field-line-row] button"),
        ).toHaveLength(0);
    });

    it("lists the front-to-back lines back to front, top to bottom as the field is drawn", () => {
        const steps = lineRows(college, "y", true).map(
            (r) => r.lead.stepsFromCenterFront,
        );
        expect(steps[steps.length - 1]).toBe(0);
        expect(steps).toEqual([...steps].sort((a, b) => a - b));
    });
});

describe("hovering a line on the field", () => {
    it.each([
        [true, 2],
        [false, 1],
    ])(
        "with Mirror %s, draws %i hovered lines (a yard line and its twin)",
        (mirror, count) => {
            act(() => fieldEditMode.enter({ lines: true }));
            act(() => fieldEditMode.setMirror(mirror));
            const view = render(
                <Providers>
                    <FieldEditOverlay fp={college} />
                </Providers>,
            );
            act(() => fieldEditMode.setHover(toRef(forty)));
            // A hovered line is the faint accent one
            expect(
                view.container.querySelectorAll(
                    'line.stroke-accent[opacity="0.4"]',
                ),
            ).toHaveLength(count);
        },
    );
});

describe("the Line section", () => {
    const show = (picked: (typeof forty)[]) => {
        act(() => {
            fieldEditMode.enter({ lines: true });
            fieldEditMode.select(picked.map(toRef));
        });
        return render(
            <Providers>
                <div data-field-edit-pane="field" tabIndex={-1} />
                <LineDetail fp={college} />
            </Providers>,
        );
    };

    it("says how to pick while nothing is", () => {
        const view = show([]);
        expect(view.getByTestId("field-line-detail").textContent).toContain(
            "Pick a line",
        );
        expect(view.queryByTestId("field-line-position")).toBeNull();
    });

    it("moves the line (and its twin) when a position is typed, as one edit", () => {
        const view = show([forty]);
        const position = view.getByTestId(
            "field-line-position",
        ) as HTMLInputElement;
        expect(position.value).toBe("16");
        position.focus();
        fireEvent.change(position, { target: { value: "+4" } });
        act(() => {
            fireEvent.keyDown(position, { key: "Enter" });
        });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0]![0]).toMatchObject({
            edit: "moveCheckpoints",
            args: { to: 20, mirror: true },
        });
        // Enter gives the keyboard back to the field
        expect(
            document.activeElement?.getAttribute("data-field-edit-pane"),
        ).toBe("field");
    });

    it("saves a name on Enter, as one edit, and gives the keyboard back to the field", () => {
        const view = show([forty]);
        const name = view.getByTestId(
            "field-line-short-name",
        ) as HTMLInputElement;
        name.focus();
        fireEvent.change(name, { target: { value: "H40" } });
        act(() => {
            fireEvent.keyDown(name, { key: "Enter" });
        });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0]![0]).toMatchObject({
            edit: "updateCheckpoints",
            args: { patch: { shortName: "H40" }, mirror: true },
        });
        expect(
            document.activeElement?.getAttribute("data-field-edit-pane"),
        ).toBe("field");
    });

    it("gives a cleared name back the one its position gives it, shown while the box is empty", () => {
        const renamed = {
            ...college,
            xCheckpoints: college.xCheckpoints.map((c) =>
                c.id === forty.id ? { ...c, name: "Home 40" } : c,
            ),
        } as typeof college;
        act(() => {
            fieldEditMode.enter({ lines: true });
            fieldEditMode.select([toRef(forty)]);
        });
        const view = render(
            <Providers>
                <div data-field-edit-pane="field" tabIndex={-1} />
                <LineDetail fp={renamed} />
            </Providers>,
        );
        const name = view.getByTestId("field-line-name") as HTMLInputElement;
        expect(name.placeholder).toBe("40 yard line");
        name.focus();
        fireEvent.change(name, { target: { value: "  " } });
        act(() => {
            fireEvent.keyDown(name, { key: "Enter" });
        });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0]![0]).toMatchObject({
            edit: "updateCheckpoints",
            args: { patch: { name: "40 yard line" } },
        });
    });

    it("saves nothing when a cleared name already is the automatic one", () => {
        const view = show([forty]);
        const name = view.getByTestId("field-line-name") as HTMLInputElement;
        name.focus();
        fireEvent.change(name, { target: { value: "" } });
        act(() => {
            fireEvent.keyDown(name, { key: "Enter" });
        });
        expect(apply).not.toHaveBeenCalled();
        expect(name.value).toBe("40 yard line");
    });

    it("puts the typing back on Escape and saves nothing", () => {
        const view = show([forty]);
        const position = view.getByTestId(
            "field-line-position",
        ) as HTMLInputElement;
        position.focus();
        fireEvent.change(position, { target: { value: "30" } });
        act(() => {
            fireEvent.keyDown(position, { key: "Escape" });
        });
        expect(position.value).toBe("16");
        expect(apply).not.toHaveBeenCalled();
        expect(fieldEditMode.get().selection).toHaveLength(1);
    });

    it("flips Visible at once, one edit", () => {
        const view = show([forty]);
        act(() => {
            fireEvent.click(view.getByTestId("field-line-visible"));
        });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0]![0]).toMatchObject({
            edit: "updateCheckpoints",
            args: { patch: { visible: false } },
        });
    });

    it("says Mixed for a switch some picked lines have on", () => {
        const fortyFive = college.xCheckpoints.find(
            (c) => c.stepsFromCenterFront === 8,
        )!;
        const fp = {
            ...college,
            xCheckpoints: college.xCheckpoints.map((c) => ({
                ...c,
                visible: c.id !== fortyFive.id,
            })),
        } as typeof college;
        act(() => {
            fieldEditMode.enter({ lines: true });
            fieldEditMode.select([toRef(forty), toRef(fortyFive)]);
        });
        const view = render(
            <Providers>
                <LineDetail fp={fp} />
            </Providers>,
        );
        const detail = view.getByTestId("field-line-detail");
        expect(detail.textContent).toContain("2 lines");
        expect(detail.textContent).toContain("Mixed");
        expect(
            view.getByTestId("field-line-visible").getAttribute("aria-checked"),
        ).toBe("false");
    });

    it("comes to Position with its text picked on a double-click or Enter", () => {
        const view = show([]);
        act(() => fieldEditMode.editPosition(toRef(forty)));
        const position = view.getByTestId("field-line-position");
        expect(document.activeElement).toBe(position);
        expect(fieldEditMode.get().focusPosition).toBe(false);
    });
});
