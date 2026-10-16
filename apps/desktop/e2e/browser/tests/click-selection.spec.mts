import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    fieldCursorAt,
    inspectorMarchers,
    readField,
    selectedDrillNumbers,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Click selection on the field (#193; #189 user stories 23, 24, 30, 31, 32,
// 33). The field's selection is the app's: the inspector shows what the field
// selects, and a selection made elsewhere shows on the field.
//
// The "change:" scenarios are the rules-table changes decided in #189.

// Four trumpets and two baritones near the middle of the field, all in view.
const POSITIONS: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
    [5, 550, 450],
    [6, 750, 470],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        marchers: POSITIONS.map(([id]) =>
            id <= 4
                ? { id, section: "Trumpet", prefix: "T", order: id }
                : { id, section: "Baritone", prefix: "B", order: id - 4 },
        ),
        positions: [POSITIONS],
    }),
});

const screenOf = async (page: Page, drillNumber: string) => {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
};

/** A point on the field well away from every marcher. */
const emptyField = async (page: Page) => {
    const t1 = await screenOf(page, "T1");
    return { x: t1.x, y: t1.y - 120 };
};

const expectSelected = async (page: Page, drillNumbers: string[]) => {
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(drillNumbers);
    // Inspector and field agree
    await expect.poll(() => inspectorMarchers(page)).toEqual(drillNumbers);
};

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("clicking a marcher selects only that marcher", async ({ show }) => {
    const { page } = show;
    await clickMarcher(page, "T2");
    await expectSelected(page, ["T2"]);
    await clickMarcher(page, "B1");
    await expectSelected(page, ["B1"]);
});

test("Shift+click adds a marcher, and removes a selected one", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await expectSelected(page, ["T1", "T3"]);
    await clickMarcher(page, "B2", { add: true });
    await expectSelected(page, ["B2", "T1", "T3"]);
    await clickMarcher(page, "T1", { add: true });
    await expectSelected(page, ["B2", "T3"]);
});

test("clicking empty field clears the selection", async ({ show }) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T2", { add: true });
    await expectSelected(page, ["T1", "T2"]);
    const empty = await emptyField(page);
    await page.mouse.click(empty.x, empty.y);
    await expectSelected(page, []);
});

test("Ctrl/Cmd+A selects every marcher", async ({ show }) => {
    const { page } = show;
    await clickMarcher(page, "T2");
    await page.keyboard.press("ControlOrMeta+a");
    await expectSelected(page, ["B1", "B2", "T1", "T2", "T3", "T4"]);
});

test("hovering a marcher shows the pointer cursor", async ({ show }) => {
    const { page } = show;
    const t3 = await screenOf(page, "T3");
    await page.mouse.move(t3.x, t3.y);
    await expect.poll(() => fieldCursorAt(page, t3)).toBe("pointer");

    const empty = await emptyField(page);
    await page.mouse.move(empty.x, empty.y);
    await expect.poll(() => fieldCursorAt(page, empty)).toBe("default");
});

test("a selection made outside the field shows on the field", async ({
    show,
}) => {
    const { page } = show;
    await page.getByRole("tab", { name: "Select", exact: true }).click();
    await page
        .getByRole("tabpanel", { name: "Select" })
        .getByRole("button", { name: "Baritone", exact: true })
        .click();
    await expectSelected(page, ["B1", "B2"]);
    expect((await readField(page)).selection).toEqual([5, 6]);
});

test("change: clicking one of several selected marchers selects only it (user story 23)", async ({
    show,
}) => {
    const { page } = show;
    await page.keyboard.press("ControlOrMeta+a");
    await expect.poll(() => selectedDrillNumbers(page)).toHaveLength(6);
    await clickMarcher(page, "T2");
    await waitForIdle(page);
    await expectSelected(page, ["T2"]);
});

test("change: clicking empty field inside a selection's box clears it (user story 30)", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T4", { add: true });
    await expectSelected(page, ["T1", "T4"]);
    // Halfway between T2 and T3, inside the box from T1 to T4
    const t2 = await screenOf(page, "T2");
    const t3 = await screenOf(page, "T3");
    await page.mouse.click((t2.x + t3.x) / 2, (t2.y + t3.y) / 2);
    await waitForIdle(page);
    await expectSelected(page, []);
});

test("change: Shift+click on empty field keeps the selection (rules table: Shift adds)", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T2", { add: true });
    await expectSelected(page, ["T1", "T2"]);
    const empty = await emptyField(page);
    await page.keyboard.down("Shift");
    await page.mouse.click(empty.x, empty.y);
    await page.keyboard.up("Shift");
    await waitForIdle(page);
    await expectSelected(page, ["T1", "T2"]);
});

test("change: Ctrl/Cmd+A keeps every marcher selected when they all are (user story 31)", async ({
    show,
}) => {
    const { page } = show;
    await page.keyboard.press("ControlOrMeta+a");
    await expect.poll(() => selectedDrillNumbers(page)).toHaveLength(6);
    await page.keyboard.press("ControlOrMeta+a");
    await waitForIdle(page);
    await expectSelected(page, ["B1", "B2", "T1", "T2", "T3", "T4"]);
});

test("change: a press that moves under 4 screen px is a click and moves nothing (rules table: Click vs drag)", async ({
    show,
}) => {
    const { page } = show;
    const before = await savedPositions(show, 0);
    const t2 = await screenOf(page, "T2");
    await page.mouse.move(t2.x, t2.y);
    await page.mouse.down();
    // Slowly: a click has no time limit, only a distance one
    await page.waitForTimeout(400);
    await page.mouse.move(t2.x + 2, t2.y + 2, { steps: 4 });
    await page.mouse.up();
    await waitForIdle(page);
    await expectSelected(page, ["T2"]);
    expect(await savedPositions(show, 0)).toEqual(before);
    await expectCanvasMatchesShow(show);
});
