import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, expectCanvasMatchesShow, readField } from "../app.mjs";
import { savedPosition } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Collision detection (#226; #189 user story 19): two marchers dragged onto
// the same spot are listed in the Collisions tab, and its "Review" frames
// them on the field. Going to another page with collisions keeps the tab open
// on that page's. Undo takes the collision away again.

// Four trumpets 100 units apart on the home page, a page 1 where they march 40
// units down field, and a page 2 where T4 closes in on T3.
const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 304],
    [3, 703, 304],
    [4, 803, 304],
];
const PAGE_1: SeedPosition[] = PAGE_0.map(([id, x, y]) => [id, x, y + 40]);
const PAGE_2: SeedPosition[] = PAGE_1.map(([id, x, y]) =>
    id === 4 ? [id, 705, y] : [id, x, y],
);

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [1, 9],
        measureStarts: [1, 5, 9, 13],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0, PAGE_1, PAGE_2],
    }),
    // The markers, and so the field's "Review" framing, show with this on
    uiSettings: { showCollisions: true },
});

test("marchers dragged onto the same spot are a collision to review", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const collisionsTab = page.getByRole("tab", { name: "Collisions" });
    await expect(collisionsTab).toBeHidden();

    // T1 onto T2, on the home page
    const drawn = await drawnMarchers(page);
    const t1 = drawn.find((m) => m.drillNumber === "T1")!;
    const t2 = drawn.find((m) => m.drillNumber === "T2")!;
    await page.mouse.move(t1.screen.x, t1.screen.y);
    await page.mouse.down();
    await page.mouse.move(t2.screen.x, t2.screen.y, { steps: 10 });
    await page.mouse.up();
    await expect
        .poll(async () => (await savedPosition(show, 1)).x)
        .toBeGreaterThan(600);
    await expectCanvasMatchesShow(show);

    // The tab lists the pair
    await expect(collisionsTab).toBeVisible();
    await collisionsTab.click();
    await expect(page.getByText("1 Collision Found")).toBeVisible();
    await page.getByRole("button", { name: "Review" }).first().click();
    await expect(page.getByText("T1 ↔ T2")).toBeVisible();

    // "Review" frames the collision: the disc between them (as wide as they
    // are apart) and its label, padded by 100 field units, centered, at 70%
    // of the zoom that fits them
    const a = await savedPosition(show, 1);
    const b = await savedPosition(show, 2);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    await page.getByRole("button", { name: "Review" }).last().click();
    const field = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const width = 2 * distance + 200;
    const height = 12 + distance / 2 + distance + 200;
    const zoom =
        Math.min(field.width / width, field.height / height, 1.5) * 0.7;
    await expect
        .poll(async () => (await readField(page)).viewport.zoom)
        .toBeCloseTo(zoom, 3);
    const { pan } = (await readField(page)).viewport;
    const centerY = (y - 12 - distance / 2 + y + distance) / 2;
    expect(Math.abs(pan.x + x * zoom - field.width / 2)).toBeLessThan(1);
    expect(Math.abs(pan.y + centerY * zoom - field.height / 2)).toBeLessThan(1);

    // Page 1 reports T4 closing in on T3 on the way to page 2: the tab stays
    // open and lists that pair instead
    await page.keyboard.press("Escape");
    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    await expect(collisionsTab).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Review" }).first().click();
    await expect(page.getByText("T3 ↔ T4")).toBeVisible();
    await expect(page.getByText("T1 ↔ T2")).toBeHidden();
    await expect(collisionsTab).toHaveAttribute("aria-selected", "true");

    // Back on the home page, undo puts T1 back, and the collision goes
    await page.keyboard.press("Escape");
    await page.keyboard.press("q");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeHidden();
    await expectCanvasMatchesShow(show);
    await expect(page.getByText("T1 ↔ T2")).toBeHidden();
    await expect(collisionsTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await savedPosition(show, 1)).x)
        .toBeCloseTo(503, 0);
    await expect(collisionsTab).toBeHidden();
});
