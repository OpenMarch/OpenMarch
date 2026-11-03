import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, readField, waitForField } from "../app.mjs";
import { goToPage, isolate } from "../timeline.mjs";

// The timeline's drawing on the field (#201; #189 user stories 18, 19, 20):
// dimmed marchers while a move is isolated, and "Zoom to collisions". Pathways and the isolation scene are pinned by the render
// comparisons (e2e/browser/render/timeline-render.spec.mts).

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move. The move over the page box
// that starts at beat 53 (as the timeline marks it) has 4 of the 95
// marchers; the others follow there.
test.use({
    showFile: path.join(desktop, "view3d-web/public/demos/part1-demo.dots"),
});

/** Turns a UI setting on (localStorage), then reloads so the app reads it. */
async function turnOn(page: Page, setting: string) {
    await page.evaluate((setting) => {
        const key = Object.keys(localStorage).find((k) =>
            /ui.?settings/i.test(k),
        )!;
        const stored = JSON.parse(localStorage.getItem(key)!);
        localStorage.setItem(
            key,
            JSON.stringify({ ...stored, [setting]: true }),
        );
    }, setting);
    await page.reload();
    await waitForField(page);
}

test("isolating a move dims the marchers outside it, and they can't be selected", async ({
    show,
}) => {
    const { page, query } = show;
    await waitForField(page);
    await isolate(page, 53);

    const members = await query<{ marcher_id: number }>(
        `SELECT DISTINCT a.marcher_id FROM timeline_assignments a
         JOIN timeline_transitions t ON a.transition_id = t.id
         WHERE a.start_beat = 54 AND a.end_beat = 62
         ORDER BY a.marcher_id`,
    );
    const inMove = members.map((m) => m.marcher_id);
    expect(inMove).toHaveLength(4);
    await expect
        .poll(async () =>
            (await drawnMarchers(page))
                .filter((m) => !m.dimmed)
                .map((m) => m.id)
                .sort((a, b) => a - b),
        )
        .toEqual(inMove);

    // A click on a dimmed marcher selects nothing
    const dimmed = (await drawnMarchers(page)).find(
        (m) => m.dimmed && m.onScreen,
    )!;
    await page.mouse.click(dimmed.screen.x, dimmed.screen.y);
    await page.waitForTimeout(200);
    expect((await readField(page)).selection).toEqual([]);

    // Leaving isolation dims nobody
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("timeline-isolation-bar")).toBeHidden();
    await expect
        .poll(async () => (await drawnMarchers(page)).some((m) => m.dimmed))
        .toBe(false);
});

test("zoom to collisions frames the collisions", async ({ show }) => {
    const { page } = show;
    await waitForField(page);
    await turnOn(page, "showCollisions");
    await goToPage(page, 53);
    const [a, b] = await drawnMarchers(page);
    const collision = {
        marcher1Id: a!.id,
        marcher2Id: b!.id,
        label: `${a!.drillNumber},${b!.drillNumber}`,
        x: a!.x + 3,
        y: a!.y + 2,
        distance: 6,
    };
    // A made-up collision at a known spot (real ones: collisions.spec.mts)
    await page.evaluate(
        (c) => window.openmarchCollisions!.show([c]),
        collision,
    );
    await page.getByRole("tab", { name: "Collisions" }).click();
    await page.getByRole("button", { name: "Review" }).first().click();
    await page.getByRole("button", { name: "Review" }).last().click();

    // The disc and its label, padded by 100 field units, at 70% of the zoom that fits them
    const field = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const width = 2 * collision.distance + 200;
    const height = 12 + collision.distance / 2 + collision.distance + 200;
    const zoom =
        Math.min(field.width / width, field.height / height, 1.5) * 0.7;
    await expect
        .poll(async () => (await readField(page)).viewport.zoom)
        .toBeCloseTo(zoom, 3);
    // Centered on them: the bounds' center within a pixel of the field's
    const { pan } = (await readField(page)).viewport;
    const centerY = (collision.y - 12 - 3 + collision.y + 6) / 2;
    expect(Math.abs(pan.x + collision.x * zoom - field.width / 2)).toBeLessThan(
        1,
    );
    expect(Math.abs(pan.y + centerY * zoom - field.height / 2)).toBeLessThan(1);
});
