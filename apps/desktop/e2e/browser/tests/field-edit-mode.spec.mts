import type { Page } from "@playwright/test";
import type { FieldTestFieldEdit } from "../../../src/field/fieldTestApi";
import { test, expect } from "../fixtures.mjs";
import {
    createMarchers,
    dragFrom,
    drawnMarchers,
    waitForField,
    waitForIdle,
    waitForSettledField,
} from "../app.mjs";

// The Field panel (#824): its Lines tab is the mode where the canvas edits the field's lines.
// Rulers to drag lines out of (with Mirror sides on, the twin comes too), lines to pick,
// box-select and delete, an exact position typed in the tab's Line section, every edit one undo
// step, and Done or Escape to leave.
// The blank show's field is the high school football field (no end zones): X lines every 8 steps
// from -80 to 80, so S1 45 is -8 and S2 40 is 16.

// Each scenario is a long session of drags, undo steps and saves: three times the usual time
test.slow();

type Line = FieldTestFieldEdit["lines"][number];

const fieldEdit = (page: Page) =>
    page.evaluate(() => window.fieldTest?.fieldEdit?.() ?? null);

async function editState(page: Page): Promise<FieldTestFieldEdit> {
    await expect.poll(() => fieldEdit(page)).not.toBeNull();
    return (await fieldEdit(page))!;
}

const xSteps = async (page: Page) =>
    (await editState(page)).lines
        .filter((l) => l.axis === "x")
        .map((l) => l.steps);

const line = async (page: Page, axis: "x" | "y", steps: number) => {
    const found = (await editState(page)).lines.find(
        (l) => l.axis === axis && l.steps === steps,
    );
    expect(found, `${axis} line at ${steps}`).toBeDefined();
    return found as Line;
};

/** The X checkpoints' steps as saved */
async function savedXSteps(show: {
    query: <T>(sql: string) => Promise<T[]>;
}): Promise<number[]> {
    const [row] = await show.query<{ json_data: string }>(
        "SELECT json_data FROM field_properties",
    );
    return (
        JSON.parse(row!.json_data) as {
            xCheckpoints: { stepsFromCenterFront: number }[];
        }
    ).xCheckpoints
        .map((c) => c.stepsFromCenterFront)
        .sort((a, b) => a - b);
}

async function openPanel(page: Page) {
    await waitForField(page);
    await waitForSettledField(page);
    await page.locator("#sidebar-launcher-field").click();
    await expect(page.getByTestId("field-edit-panel")).toBeVisible();
}

/** Opens the Lines tab of an open Field panel: the mode for lines */
async function editLines(page: Page) {
    await page.getByTestId("field-tab-lines").click();
    await editState(page);
}

async function enterFromSidebar(page: Page) {
    await openPanel(page);
    await editLines(page);
}

test("the panel opens on Setup with the field shown, and the Lines tab is the mode for lines", async ({
    show,
}) => {
    const { page } = show;
    await waitForField(page);
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await openPanel(page);
    await expect(page.getByTestId("field-tab-setup")).toHaveAttribute(
        "data-state",
        "active",
    );
    // Nothing on the field is edited yet: no rulers, the drill as it is
    await expect(page.getByTestId("field-edit-overlay")).toHaveCount(0);
    await expect
        .poll(async () => (await drawnMarchers(page)).some((m) => m.dimmed))
        .toBe(false);
    // A line key does nothing, and doesn't reach the drill (Y is Lock Y there)
    const before = await savedXSteps(show);
    await page.keyboard.press("x");
    await expect.poll(() => savedXSteps(show)).toEqual(before);

    await editLines(page);
    await expect(page.getByTestId("field-edit-overlay")).toBeVisible();
    await expect(page.getByTestId("field-edit-hint")).toBeVisible();
    await expect
        .poll(async () => (await drawnMarchers(page)).every((m) => m.dimmed))
        .toBe(true);
    await expect(page.getByTestId("field-line-detail")).toContainText(
        "Pick a line",
    );

    // A row click picks its line, and the Line section shows it
    await page
        .getByTestId("field-lines-x")
        .locator("[data-field-line-row]")
        .first()
        .click();
    await expect(page.getByTestId("field-line-position")).toBeVisible();

    // Another tab ends it, with nothing picked
    await page.getByTestId("field-tab-appearance").click();
    await expect(page.getByTestId("field-edit-overlay")).toHaveCount(0);
    await page.getByTestId("field-tab-lines").click();
    await expect(page.getByTestId("field-line-position")).toHaveCount(0);
});

test("enter the mode, drag a mirrored line out of the ruler, undo, and leave with Escape", async ({
    show,
}) => {
    const { page } = show;
    await waitForField(page);
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await enterFromSidebar(page);

    // Marchers step back and can't be picked
    await expect
        .poll(async () => (await drawnMarchers(page)).every((m) => m.dimmed))
        .toBe(true);
    const before = await xSteps(page);
    expect(before).toHaveLength(21);
    expect((await editState(page)).mirror).toBe(true);

    // Out of the top ruler, halfway between S2 45 (8) and S2 40 (16): a line at 12, and its twin
    const a = await line(page, "x", 8);
    const b = await line(page, "x", 16);
    const startX = (a.tab.x + b.tab.x) / 2;
    const ruler = (await editState(page)).rulers.x;
    await dragFrom(
        page,
        { x: startX, y: ruler.from.y },
        { x: 0, y: a.screen.y - ruler.from.y },
        {
            steps: 12,
            beforeRelease: async () => {
                const drag = (await editState(page)).drag;
                expect(drag).toMatchObject({
                    kind: "add",
                    axis: "x",
                    steps: 12,
                    overRuler: false,
                });
                await expect(
                    page.getByTestId("field-edit-readout"),
                ).toContainText("12 steps");
            },
        },
    );
    await waitForIdle(page);
    await expect.poll(() => xSteps(page)).toHaveLength(23);
    expect(await savedXSteps(show)).toContain(12);
    expect(await savedXSteps(show)).toContain(-12);
    // The new line is picked, its twin lit with it
    const added = await line(page, "x", 12);
    expect(added.selected).toBe(true);
    expect((await line(page, "x", -12)).highlighted).toBe(true);
    // One undo step takes both away
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => xSteps(page)).toEqual(before);
    expect(await savedXSteps(show)).not.toContain(12);

    // Escape drops the pick first, then leaves
    await line(page, "x", 8).then((l) =>
        page.mouse.click(l.screen.x, l.screen.y),
    );
    await expect
        .poll(async () => (await line(page, "x", 8)).selected)
        .toBe(true);
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await editState(page)).lines.some((l) => l.selected))
        .toBe(false);
    // Then the panel, keeping the changes
    await page.keyboard.press("Escape");
    await expect.poll(() => fieldEdit(page)).toBeNull();
    await expect(page.getByTestId("field-edit-panel")).toBeHidden();
    await expect
        .poll(async () => (await drawnMarchers(page)).some((m) => m.dimmed))
        .toBe(false);
});

test("box-select, keep every other and delete the ten 5-yard lines, as one undo step", async ({
    show,
}) => {
    const { page } = show;
    await waitForField(page);
    await waitForSettledField(page);
    // The panel's own key
    await page.keyboard.press("ControlOrMeta+Shift+e");
    await expect(page.getByTestId("field-edit-panel")).toBeVisible();
    await editLines(page);
    const before = await savedXSteps(show);

    // A thin box across the field, between the front sideline and the front hash, from just
    // inside the S1 goal line to just inside the S2 goal line
    const state = await editState(page);
    const front = state.lines.find((l) => l.axis === "y" && l.steps === 0)!;
    const hash = state.lines
        .filter((l) => l.axis === "y" && l.steps < 0)
        .sort((p, q) => q.steps - p.steps)[0]!;
    const y = (front.screen.y + hash.screen.y) / 2;
    const s1Goal = await line(page, "x", -80);
    const s1Five = await line(page, "x", -72);
    const s2Five = await line(page, "x", 72);
    const s2Goal = await line(page, "x", 80);
    const left = (s1Goal.screen.x + s1Five.screen.x) / 2;
    const right = (s2Five.screen.x + s2Goal.screen.x) / 2;
    await dragFrom(page, { x: left, y: y - 4 }, { x: right - left, y: 8 });
    await expect
        .poll(
            async () =>
                (await editState(page)).lines.filter((l) => l.selected).length,
        )
        .toBe(19);

    await page
        .getByTestId("field-line-detail")
        .getByRole("button", { name: "Keep every other" })
        .click();
    await expect
        .poll(async () =>
            (await editState(page)).lines
                .filter((l) => l.selected)
                .map((l) => l.steps),
        )
        .toEqual([-72, -56, -40, -24, -8, 8, 24, 40, 56, 72]);

    await page.keyboard.press("Delete");
    await waitForIdle(page);
    await expect
        .poll(() => savedXSteps(show))
        .toEqual([-80, -64, -48, -32, -16, 0, 16, 32, 48, 64, 80]);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedXSteps(show)).toEqual(before);
});

test("drag a line, type its exact position, and drag it back into the ruler to delete it", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);

    // Drag S2 40 (16) a step toward the 50: its twin S1 40 follows
    const forty = await line(page, "x", 16);
    const thirtyFive = await line(page, "x", 24);
    const stepPx = (thirtyFive.screen.x - forty.screen.x) / 8;
    await dragFrom(page, forty.screen, { x: -2 * stepPx, y: 0 }, { steps: 8 });
    await waitForIdle(page);
    await expect.poll(() => savedXSteps(show)).toContain(14);
    expect(await savedXSteps(show)).toContain(-14);

    // Double-click it: the keyboard goes to its Position in the panel. Type the 47.5 yard line:
    // 4 steps from the 50, still on side 2. Enter saves it and gives the keyboard back to the field
    const moved = await line(page, "x", 14);
    await page.mouse.dblclick(moved.screen.x, moved.screen.y);
    const position = page.getByTestId("field-line-position");
    await expect(position).toBeFocused();
    await position.fill("47.5yd");
    await expect(page.getByTestId("field-line-detail")).toContainText(
        "47.5 yard line",
    );
    await page.keyboard.press("Enter");
    await waitForIdle(page);
    await expect.poll(() => savedXSteps(show)).toContain(4);
    expect(await savedXSteps(show)).toContain(-4);
    await expect(position).not.toBeFocused();

    // Moving it named it from its new place; a name typed is its own step
    expect((await line(page, "x", 4)).shortName).toBe("47.5");
    const shortName = page.getByTestId("field-line-short-name");
    await shortName.fill("H47");
    await shortName.press("Enter");
    await expect
        .poll(async () => (await line(page, "x", 4)).shortName)
        .toBe("H47");
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await line(page, "x", 4)).shortName)
        .toBe("47.5");

    // One more undo puts the line back at 14
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedXSteps(show)).toContain(14);
    await expect.poll(() => xSteps(page)).toContain(14);

    // Back into its ruler: deleted, with its twin
    const back = await line(page, "x", 14);
    const ruler = (await editState(page)).rulers.x;
    await dragFrom(
        page,
        back.screen,
        { x: 0, y: ruler.from.y - back.screen.y },
        {
            steps: 12,
            beforeRelease: async () =>
                expect(page.getByTestId("field-edit-readout")).toContainText(
                    "delete",
                ),
        },
    );
    await waitForIdle(page);
    await expect.poll(() => savedXSteps(show)).not.toContain(14);
    expect(await savedXSteps(show)).not.toContain(-14);

    // Done leaves
    await page.getByTestId("field-edit-done").click();
    await expect.poll(() => fieldEdit(page)).toBeNull();
});

test("the panel's X puts the field back as it was when it opened, and undo brings the changes back", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);
    const before = await savedXSteps(show);
    await line(page, "x", 16).then((l) =>
        page.mouse.click(l.screen.x, l.screen.y),
    );
    await page.keyboard.press("Delete");
    await expect.poll(() => savedXSteps(show)).not.toContain(16);

    await page.getByTestId("field-edit-discard").click();
    await expect.poll(() => fieldEdit(page)).toBeNull();
    await expect(page.getByTestId("field-edit-panel")).toBeHidden();
    await expect.poll(() => savedXSteps(show)).toEqual(before);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedXSteps(show)).not.toContain(16);
});

test("the Field panel's tabs hold the field's settings, each change one undo step", async ({
    show,
}) => {
    const { page } = show;
    await openPanel(page);
    const panel = page.getByTestId("field-edit-panel");
    for (const [tab, inside] of [
        ["setup", "Step size"],
        ["setup", "Side descriptions"],
        ["appearance", "Yard numbers"],
        ["appearance", "Import Image"],
        ["appearance", "Marchers and paths"],
    ] as const) {
        await page.getByTestId(`field-tab-${tab}`).click();
        await expect(panel.getByText(inside).first()).toBeVisible();
    }

    // Width and depth are read, not typed (owner, #824: a later issue)
    await page.getByTestId("field-tab-setup").click();
    await expect(page.getByTestId("field-width")).toContainText("160 steps");

    // The yard numbers' placement can be typed (B9)
    await page.getByTestId("field-tab-appearance").click();
    const yard = page.getByTestId("field-yard-homeStepsFromFrontToOutside");
    await yard.fill("12");
    await yard.press("Enter");
    await expect
        .poll(async () => {
            const [row] = await show.query<{ json_data: string }>(
                "SELECT json_data FROM field_properties",
            );
            return JSON.parse(row!.json_data).yardNumberCoordinates
                .homeStepsFromFrontToOutside;
        })
        .toBe(12);

    // Its own undo step, and the input follows the undo (B1)
    await page.keyboard.press("ControlOrMeta+z");
    await expect(yard).not.toHaveValue("12");
});

/** The saved X checkpoints, with what H and R change */
async function savedXLines(show: {
    query: <T>(sql: string) => Promise<T[]>;
}): Promise<
    { steps: number; visible: boolean; reference: boolean; name: string }[]
> {
    const [row] = await show.query<{ json_data: string }>(
        "SELECT json_data FROM field_properties",
    );
    return (
        JSON.parse(row!.json_data) as {
            xCheckpoints: {
                stepsFromCenterFront: number;
                visible: boolean;
                useAsReference: boolean;
                name: string;
            }[];
        }
    ).xCheckpoints
        .map((c) => ({
            steps: c.stepsFromCenterFront,
            visible: c.visible,
            reference: c.useAsReference,
            name: c.name,
        }))
        .sort((a, b) => a.steps - b.steps);
}

const savedX = async (show: Parameters<typeof savedXLines>[0], steps: number) =>
    (await savedXLines(show)).find((l) => l.steps === steps);

test("slide a line's ruler tab along its ruler: the line moves, and Escape lets go of a drag", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);
    const before = await savedXSteps(show);

    // S2 40's tab, two steps toward S2 35 along the top ruler: a move, never a delete
    const forty = await line(page, "x", 16);
    const thirtyFive = await line(page, "x", 24);
    const stepPx = (thirtyFive.tab.x - forty.tab.x) / 8;
    await dragFrom(
        page,
        forty.tab,
        { x: 2 * stepPx, y: 0 },
        {
            steps: 8,
            beforeRelease: async () => {
                expect((await editState(page)).drag).toMatchObject({
                    kind: "move",
                    steps: 18,
                    overRuler: false,
                });
                await expect(
                    page.getByTestId("field-edit-readout"),
                ).not.toContainText("delete");
            },
        },
    );
    await waitForIdle(page);
    await expect.poll(() => savedXSteps(show)).toContain(18);
    expect(await savedXSteps(show)).toContain(-18);
    expect(await savedXSteps(show)).toHaveLength(before.length);

    // Escape in the middle of a drag: nothing changes, the mode stays on
    const moved = await line(page, "x", 18);
    await page.mouse.move(moved.screen.x, moved.screen.y);
    await page.mouse.down();
    await page.mouse.move(moved.screen.x + 3 * stepPx, moved.screen.y, {
        steps: 6,
    });
    await expect.poll(async () => (await editState(page)).drag).not.toBeNull();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await editState(page)).drag).toBeNull();
    await page.mouse.up();
    await waitForIdle(page);
    expect(await savedXSteps(show)).toContain(18);
    expect(await fieldEdit(page)).not.toBeNull();

    // Escape while the button is down but before the drag starts: let go of the press, still
    // in the mode, and the line stays picked
    await page.mouse.move(moved.screen.x, moved.screen.y);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await fieldEdit(page)).not.toBeNull();
    expect((await line(page, "x", 18)).selected).toBe(true);
});

test("H, R and the arrows act on the picked line and its twin, each one undo step", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);
    const forty = await line(page, "x", 16);
    await page.mouse.click(forty.screen.x, forty.screen.y);
    await expect
        .poll(async () => (await line(page, "x", 16)).selected)
        .toBe(true);

    await page.keyboard.press("h");
    await expect
        .poll(async () => (await savedX(show, 16))?.visible)
        .toBe(false);
    expect((await savedX(show, -16))?.visible).toBe(false);

    const reference = (await savedX(show, 16))!.reference;
    await page.keyboard.press("r");
    await expect
        .poll(async () => (await savedX(show, 16))?.reference)
        .toBe(!reference);
    expect((await savedX(show, -16))?.reference).toBe(!reference);

    // Right: a step out from the 50 on side 2, and the twin a step out on side 1; Shift: half
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => savedXSteps(show)).toContain(17);
    expect(await savedXSteps(show)).toContain(-17);
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(() => savedXSteps(show)).toContain(17.5);
    expect(await savedXSteps(show)).toContain(-17.5);

    // Each key was its own undo step
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedXSteps(show)).toContain(17);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedXSteps(show)).toContain(16);
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await savedX(show, 16))?.reference)
        .toBe(reference);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await savedX(show, 16))?.visible).toBe(true);
});

test("Tab walks the lines from the field, and F6 takes the keyboard to the Field panel and back", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);
    // Entering from the sidebar's button gives the field the keyboard
    await expect(page.getByTestId("field-edit-overlay")).toBeFocused();
    const first = (await editState(page)).lines[0]!;
    await page.keyboard.press("Tab");
    await expect
        .poll(async () =>
            (await editState(page)).lines
                .filter((l) => l.selected)
                .map((l) => l.id),
        )
        .toEqual([first.id]);

    await page.keyboard.press("F6");
    await expect(
        page.getByTestId("field-edit-panel").locator(":focus"),
    ).toHaveCount(1);
    // Tab in the panel is the panel's: the pick stays
    await page.keyboard.press("Tab");
    await expect(
        page.getByTestId("field-edit-panel").locator(":focus"),
    ).toHaveCount(1);
    expect(
        (await editState(page)).lines
            .filter((l) => l.selected)
            .map((l) => l.id),
    ).toEqual([first.id]);

    await page.keyboard.press("F6");
    await expect(page.getByTestId("field-edit-overlay")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect
        .poll(
            async () =>
                (await editState(page)).lines.filter((l) => l.selected).length,
        )
        .toBe(1);
    expect((await editState(page)).lines.find((l) => l.selected)!.id).not.toBe(
        first.id,
    );

    // The panel's help says how
    await page.getByTestId("field-edit-keys").click();
    await expect(page.getByTestId("field-edit-keys-help")).toContainText("F6");
});

test("Add line adds a mirrored line, and the template sheet keeps the look or resets", async ({
    show,
}) => {
    const { page } = show;
    await enterFromSidebar(page);
    const before = await savedXSteps(show);

    // Mirror on: a pair, halfway into a gap (all gaps are 8 steps, so 4 steps off a line)
    await page.getByTestId("field-lines-add").click();
    await expect
        .poll(async () => (await savedXSteps(show)).length)
        .toBe(before.length + 2);
    const added = (await savedXSteps(show)).filter((s) => !before.includes(s));
    expect(added[0]).toBe(-added[1]!);

    // Hide the top labels (part of the look), then switch templates keeping the look
    await page.getByTestId("field-tab-appearance").click();
    await page.getByTestId("field-labels-top").click();
    await page.getByTestId("field-tab-setup").click();
    await page.getByTestId("field-template-select").click();
    await page
        .getByRole("option", { name: "College football field (no end zones)" })
        .click();
    const sheet = page.getByRole("alertdialog");
    await expect(sheet).toContainText("Switch to College football");
    await expect(page.getByTestId("field-template-diff")).toBeVisible();
    await expect(page.getByTestId("field-template-keep-look")).toBeChecked();
    await page.getByTestId("field-template-apply").click();
    await expect(page.getByTestId("field-template-select")).toContainText(
        "College football field (no end zones)",
    );
    const saved = async () => {
        const [row] = await show.query<{ json_data: string }>(
            "SELECT json_data FROM field_properties",
        );
        return JSON.parse(row!.json_data) as {
            name: string;
            topLabelsVisible: boolean;
        };
    };
    expect((await saved()).topLabelsVisible).toBe(false);
    // The template's own lines: the added pair is gone
    const template = await savedXSteps(show);
    expect(template).not.toContain(added[1]);

    // Add a line, then reset to the template: back to its lines
    await editLines(page);
    await page.getByTestId("field-lines-add").click();
    await expect
        .poll(async () => (await savedXSteps(show)).length)
        .toBe(template.length + 2);
    await page.getByTestId("field-tab-setup").click();
    await page.getByTestId("field-template-reset").click();
    await expect(sheet).toContainText("Reset to College football");
    await page.getByTestId("field-template-apply").click();
    await expect.poll(() => savedXSteps(show)).toEqual(template);
    // The kept look (the top labels hidden) is the one change left
    await expect(page.getByTestId("field-edit-changes")).toContainText(
        "1 change",
    );
    expect((await saved()).topLabelsVisible).toBe(false);
});

test("reopening the show leaves the mode", async ({ show }) => {
    const { page } = show;
    await enterFromSidebar(page);
    await line(page, "x", 16).then((l) =>
        page.mouse.click(l.screen.x, l.screen.y),
    );
    // A reload is how the app opens a show again; the mode is the open show's, never kept
    await page.reload();
    await waitForField(page);
    await expect(page.getByTestId("field-edit-panel")).toBeHidden();
    expect(await fieldEdit(page)).toBeNull();
});

test.describe("touch", () => {
    test.use({
        // The touch layout, pinned, as Settings › Touch & Input does
        initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    });

    /** Touches one point for `holdMs`, as a finger */
    async function touch(page: Page, at: { x: number; y: number }, holdMs = 0) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: at.x, y: at.y, id: 0 }],
        });
        if (holdMs > 0) await page.waitForTimeout(holdMs);
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        await cdp.detach();
    }

    test("a finger gets 44 px rulers, and a tap on a picked line goes to its position with the number pad", async ({
        show,
    }) => {
        const { page } = show;
        await enterFromSidebar(page);
        const state = await editState(page);
        // The rulers are 44 px thick: their middle is 22 px in
        const box = (await page
            .getByTestId("field-edit-overlay")
            .boundingBox())!;
        expect(state.rulers.x.from.y - box.y).toBeCloseTo(22, 0);
        expect(state.rulers.y.from.x - box.x).toBeCloseTo(22, 0);

        // A tap picks; Visible in the Line section hides the line and its twin
        const forty = await line(page, "x", 16);
        await touch(page, forty.screen);
        await expect
            .poll(async () => (await line(page, "x", 16)).selected)
            .toBe(true);
        await page.getByTestId("field-line-visible").click();
        await expect
            .poll(async () => (await savedX(show, 16))?.visible)
            .toBe(false);
        expect((await savedX(show, -16))?.visible).toBe(false);

        // A tap on the picked line goes to its position, with the number pad
        await touch(page, forty.screen);
        await expect(page.getByTestId("field-line-position")).toBeFocused();
        await expect(
            page.getByRole("group", { name: "Number pad" }),
        ).toBeVisible();
    });
});
