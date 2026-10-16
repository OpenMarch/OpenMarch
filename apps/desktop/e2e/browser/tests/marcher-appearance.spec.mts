import { test, expect } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
} from "../app.mjs";
import { seedShowSql } from "../seed.mjs";
import type { DrawnMarcher } from "../app.mjs";

/**
 * Marchers look as their appearances say (fork #199): the cascade from tags,
 * sections and the field theme, every dot shape, and hidden marchers. A tag
 * appearance takes effect at its page's flag, so each page shows the
 * appearance of the last flag crossed.
 */

const BLUE = "rgba(0, 0, 255, 1)";
const BLACK = "rgba(0, 0, 0, 1)";
const GREEN = "rgba(0, 160, 0, 1)";
const YELLOW = "rgba(250, 200, 0, 1)";

// T1, T2 trumpets, F1, F2 flutes and B1, a baritone with no appearance. Pages
// 1 and 2 are eight counts each, so their flags are beats 9 and 17.
test.use({
    seedSql: [
        ...seedShowSql({
            beats: 24,
            measureStarts: [1, 5, 9, 13, 17, 21],
            pageStarts: [1, 9],
            marchers: [
                { id: 1, section: "Trumpet", prefix: "T", order: 1 },
                { id: 2, section: "Trumpet", prefix: "T", order: 2 },
                { id: 3, section: "Flute", prefix: "F", order: 1 },
                { id: 4, section: "Flute", prefix: "F", order: 2 },
                { id: 5, section: "Baritone", prefix: "B", order: 1 },
            ],
            // On page 2, F2 stands on F1 (and is drawn over it)
            positions: [0, 1, 2].map((page) =>
                [1, 2, 3, 4, 5].map(
                    (id) =>
                        [
                            id,
                            300 + (page === 2 && id === 4 ? 3 : id) * 60,
                            300 + page * 40,
                        ] as const,
                ),
            ),
        }),
        `INSERT INTO section_appearances (id, section, fill_color, outline_color, shape_type, visible, label_visible) VALUES
            (1, 'Trumpet', 'rgba(0,0,255,1)', 'rgba(0,0,0,1)', 'square', 1, 1),
            (2, 'Flute', 'rgba(0,160,0,1)', NULL, 'x', 1, 1)`,
        `INSERT INTO tags (id, name) VALUES (1, 'Solo'), (2, 'Exit')`,
        `INSERT INTO marcher_tags (marcher_id, tag_id) VALUES (2, 1), (4, 2)`,
        // From page 1's flag T2 is a yellow triangle with no label; from page
        // 2's, F2 is hidden
        `INSERT INTO tag_appearances (id, tag_id, start_page_id, priority, fill_color, shape_type, visible, label_visible) VALUES
            (1, 1, 1, 0, 'rgba(250,200,0,1)', 'triangle', 1, 0),
            (2, 2, 2, 0, NULL, NULL, 0, 0)`,
    ],
});

const looks = async (page: Parameters<typeof drawnMarchers>[0]) =>
    Object.fromEntries(
        (await drawnMarchers(page)).map((m: DrawnMarcher) => [
            m.drillNumber,
            m.look,
        ]),
    );

test("draws each marcher in its appearance at the page shown", async ({
    show,
}) => {
    const { page } = show;
    const [{ json }] = await show.query<{ json: string }>(
        "SELECT json_data AS json FROM field_properties",
    );
    const { defaultMarcher } = JSON.parse(json).theme;
    const css = (c: { r: number; g: number; b: number; a: number }) =>
        `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    const label = css(defaultMarcher.label);
    const shown = { visible: true, labelVisible: true, labelColor: label };
    const trumpet = { ...shown, shape: "square", fill: BLUE, outline: BLACK };
    const flute = { ...shown, shape: "x", fill: GREEN, outline: null };
    const baritone = {
        ...shown,
        shape: "circle",
        fill: css(defaultMarcher.fill),
        outline: css(defaultMarcher.outline),
    };

    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    await expect
        .poll(() => looks(page))
        .toEqual({
            T1: trumpet,
            T2: trumpet,
            F1: flute,
            F2: flute,
            B1: baritone,
        });

    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    await expect
        .poll(() => looks(page))
        .toEqual({
            T1: trumpet,
            T2: {
                ...trumpet,
                shape: "triangle",
                fill: YELLOW,
                labelVisible: false,
            },
            F1: flute,
            F2: flute,
            B1: baritone,
        });

    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 2" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    await expect
        .poll(async () => (await looks(page)).F2)
        .toEqual(
            expect.objectContaining({ visible: false, labelVisible: false }),
        );

    // Back on page 1, F2 shows again
    await page.keyboard.press("q");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expect.poll(async () => (await looks(page)).F2).toEqual(flute);
});

test("a click goes through a hidden marcher", async ({ show }) => {
    const { page } = show;
    await page.keyboard.press("e");
    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 2" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    await expect.poll(async () => (await looks(page)).F2?.visible).toBe(false);

    // F2, hidden, stands on F1: the click selects F1
    await clickMarcher(page, "F2");

    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["F1"]);
});
