import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    readField,
    selectedDrillNumbers,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql } from "../seed.mjs";

// The field's right-click menu (#315). A right-click that doesn't drag opens
// it at the pointer; a right-drag still pans. Right-clicking a marcher that
// isn't selected selects it first, and empty field keeps the selection. Its
// entries are registered actions: here, both Unset actions (Set vs Following, #304
// and #305) and the selection actions. The context-menu key and Shift+F10
// open it at the selection.
//
// The show is unset-here.spec's: pages flag at beats 9, 17 and 25 (measures
// 3, 5 and 7). Over page 2 T1 and T2 move and T3 holds. Over page 3 T1 and T3
// move and T2 holds, following page 2.
test.use({
    seedSql: [
        ...seedShowSql({
            beats: 32,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29],
            pageStarts: [1, 9, 17],
            marchers: [1, 2, 3].map((id) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [
                [
                    [1, 400, 300],
                    [2, 500, 300],
                    [3, 600, 300],
                ],
                [
                    [1, 400, 340],
                    [2, 500, 340],
                    [3, 600, 340],
                ],
                [
                    [1, 400, 380],
                    [2, 500, 380],
                    [3, 600, 340],
                ],
                [
                    [1, 400, 420],
                    [2, 500, 380],
                    [3, 600, 420],
                ],
            ],
        }),
        "DELETE FROM timeline_assignments WHERE transition_id = 2 AND marcher_id = 3",
        "DELETE FROM timeline_slot_destinations WHERE transition_id = 2 AND slot_index = 2",
        "UPDATE timeline_transitions SET slot_count = 2 WHERE id = 2",
        "DELETE FROM timeline_assignments WHERE transition_id = 3 AND marcher_id = 2",
        "DELETE FROM timeline_slot_destinations WHERE transition_id = 3 AND slot_index = 1",
        "UPDATE timeline_slot_destinations SET slot_index = 1 WHERE transition_id = 3 AND slot_index = 2",
        "UPDATE timeline_assignments SET slot_index = 1 WHERE transition_id = 3 AND marcher_id = 3",
        "UPDATE timeline_transitions SET slot_count = 2 WHERE id = 3",
        "DELETE FROM timeline_change_log",
    ],
});

const PAGE_2_BEFORE = { T1: "400,380", T2: "500,380", T3: "600,340" };
const PAGE_3 = { T1: "400,420", T2: "500,380", T3: "600,420" };

/** Each marcher's saved spot on page `pageId`'s flag, as "x,y" by drill number. */
const spots = async (show: Show, pageId: number) =>
    Object.fromEntries(
        (await savedPositions(show, pageId)).map((p) => [
            `T${p.id}`,
            `${Math.round(p.x)},${Math.round(p.y)}`,
        ]),
    );

const menu = (page: Page) => page.getByTestId("field-menu");
/**
 * The entry named `name`, followed by its shortcut if it has one, which a screen reader hears as
 * words ("Align horizontally Alt H").
 */
const entry = (page: Page, name: string) =>
    menu(page).getByRole("menuitem", {
        name: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( .+)?$`,
        ),
    });

/** Where field point (x, y) is on screen, from where T1 is drawn and the zoom. */
async function screenAt(page: Page, x: number, y: number) {
    const t1 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T1")!;
    const { zoom } = (await readField(page)).viewport;
    return {
        x: t1.screen.x + (x - t1.x) * zoom,
        y: t1.screen.y + (y - t1.y) * zoom,
    };
}

/** A spot of empty field, well away from the marchers. */
const emptyField = (page: Page) => screenAt(page, 300, 200);

async function rightClickMarcher(page: Page, drillNumber: string) {
    const marcher = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    )!;
    await page.mouse.click(marcher.screen.x, marcher.screen.y, {
        button: "right",
    });
}

/** Opens the show at page 2's flag. */
async function atPage2(show: Show) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    await waitForIdle(page);
}

test("right-clicking a marcher that isn't selected selects it and opens the menu there; Unset here runs from it", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    await clickMarcher(page, "T1");
    await rightClickMarcher(page, "T2");

    await expect(menu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    // Opened at the pointer: its corner is by T2's dot
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    const box = (await menu(page).boundingBox())!;
    expect(Math.abs(box.x - t2.screen.x)).toBeLessThan(24);
    expect(Math.abs(box.y - t2.screen.y)).toBeLessThan(24);

    await entry(page, "Remove keyframe").click();
    await expect(menu(page)).toBeHidden();
    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual(PAGE_3);

    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spots(show, 2)).toEqual(PAGE_2_BEFORE);
});

test("right-clicking a selected marcher or empty field keeps the selection; the second Unset names the page that follows", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T2", { add: true });

    await rightClickMarcher(page, "T1");
    await expect(menu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T1", "T2"]);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();

    const empty = await emptyField(page);
    await page.mouse.click(empty.x, empty.y, { button: "right" });
    await expect(menu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T1", "T2"]);
    // T2 holds over page 3: that page follows its page 2 spot
    await entry(page, "Remove keyframe, Page 3 moves back too").click();
    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T1: "400,340", T2: "500,340" });
    await expect
        .poll(() => spots(show, 3))
        .toEqual({ ...PAGE_3, T2: "500,340" });
});

test("only offers Unset here and on Pages N–M when pages follow, and Unset is unavailable with nobody Set", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    // T1 moves again over page 3: no page follows its spot
    await rightClickMarcher(page, "T1");
    await expect(entry(page, "Remove keyframe")).toBeEnabled();
    await expect(
        menu(page).getByRole("menuitem", { name: /Unset here and on/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // T3 holds over page 2: it isn't Set here
    await rightClickMarcher(page, "T3");
    await expect(entry(page, "Remove keyframe")).toHaveAttribute(
        "data-disabled",
        "",
    );
    // Swap needs two marchers
    await expect(entry(page, "Swap two marchers")).toHaveAttribute(
        "data-disabled",
        "",
    );
    await expect(entry(page, "Align horizontally")).not.toHaveAttribute(
        "data-disabled",
    );
});

test("a selection action runs from the menu: Align horizontally", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    await clickMarcher(page, "T2");
    await clickMarcher(page, "T3", { add: true });
    await rightClickMarcher(page, "T3");
    await entry(page, "Align horizontally").click();
    // T2 and T3 share the average x on page 2, as the shortcut does
    await expect
        .poll(async () => {
            const page2 = await spots(show, 2);
            return [page2.T2.split(",")[0], page2.T3.split(",")[0]];
        })
        .toEqual(["550", "550"]);
});

test("a right-drag still pans and opens no menu", async ({ show }) => {
    const { page } = show;
    await atPage2(show);
    await clickMarcher(page, "T1");
    const before = (await readField(page)).viewport;
    const start = await emptyField(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(start.x + 80, start.y + 40, { steps: 8 });
    // Back to where it started: still a pan, not a click
    await page.mouse.move(start.x, start.y, { steps: 8 });
    await page.mouse.move(start.x + 60, start.y + 30, { steps: 4 });
    await page.mouse.up({ button: "right" });
    await waitForIdle(page);

    const after = (await readField(page)).viewport;
    expect(after.pan.x - before.pan.x).toBeCloseTo(60, 0);
    expect(after.pan.y - before.pan.y).toBeCloseTo(30, 0);
    await expect(menu(page)).toHaveCount(0);
    expect(await selectedDrillNumbers(page)).toEqual(["T1"]);
});

test("the context-menu key and Shift+F10 open it at the selection, only with one", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    await page.keyboard.press("Shift+F10");
    await expect(menu(page)).toHaveCount(0);

    await clickMarcher(page, "T2");
    await page.keyboard.press("Shift+F10");
    await expect(menu(page)).toBeVisible();
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    const box = (await menu(page).boundingBox())!;
    expect(Math.abs(box.x - t2.screen.x)).toBeLessThan(24);
    // The keyboard reaches the entries
    await expect(entry(page, "Remove keyframe")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();

    await page.keyboard.press("ContextMenu");
    await expect(menu(page)).toBeVisible();
});

test("a click outside the open menu only closes it: the field doesn't select", async ({
    show,
}) => {
    const { page } = show;
    await atPage2(show);
    await rightClickMarcher(page, "T1");
    await expect(menu(page)).toBeVisible();
    const t3 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T3")!;
    await page.mouse.click(t3.screen.x, t3.screen.y);
    await expect(menu(page)).toBeHidden();
    expect(await selectedDrillNumbers(page)).toEqual(["T1"]);
    // The next click selects as usual
    await clickMarcher(page, "T3");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T3"]);
});
