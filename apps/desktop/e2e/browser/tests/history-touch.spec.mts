import { test, expect } from "../fixtures.mjs";
import {
    dragMarcher,
    expectCanvasMatchesShow,
    multiFingerTap,
} from "../app.mjs";
import { savedPosition } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Undo and redo on a tablet (tablet plan 1.6): a two-finger tap on the field
// undoes, a three-finger tap redoes, each through the same Undo and Redo
// actions as the keys, with a short "Undone"/"Redone" note. The edit is a
// mouse drag (one finger only navigates for now); the taps are fingers.

const PAGE_0: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0],
    }),
    touchScreen: true,
});

test("two-finger tap undoes the last edit, three-finger tap redoes it", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const before = await savedPosition(show, 1);

    await dragMarcher(page, "T1", { x: 120, y: 0 });
    await expect
        .poll(async () => (await savedPosition(show, 1)).x)
        .toBeGreaterThan(before.x + 1);
    const moved = await savedPosition(show, 1);

    // Low on the field, clear of the marchers
    const box = await page.getByTestId("fieldCanvas").boundingBox();
    if (!box) throw new Error("The field is not on screen");
    const at = { x: box.x + box.width / 2, y: box.y + box.height * 0.85 };

    await multiFingerTap(page, at, 2);
    await expect.poll(() => savedPosition(show, 1)).toEqual(before);
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();
    await expectCanvasMatchesShow(show);

    await multiFingerTap(page, at, 3);
    await expect.poll(() => savedPosition(show, 1)).toEqual(moved);
    await expect(page.getByText("Redone", { exact: true })).toBeVisible();
    await expectCanvasMatchesShow(show);
});
