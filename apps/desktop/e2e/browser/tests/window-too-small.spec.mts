import { test, expect } from "../fixtures.mjs";

test("says when the window is too small, and comes back when it grows", async ({
    show,
}) => {
    const { page } = show;
    const notice = page.getByTestId("window-too-small");
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expect(notice).toBeHidden();

    await page.setViewportSize({ width: 700, height: 800 });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Make the window bigger");
    await expect(notice).toContainText("This window is 700 × 800.");
    // The zoom-out shortcut, as one shortcut of keycaps
    await expect(notice.locator(".keycaps .keycap")).toHaveCount(2);

    await page.setViewportSize({ width: 1200, height: 450 });
    await expect(notice).toContainText("This window is 1200 × 450.");

    await page.setViewportSize({ width: 768, height: 600 });
    await expect(notice).toBeHidden();
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
});

test("keeps focus and shortcuts away from the app behind it", async ({
    show,
}) => {
    const { page } = show;
    const notice = page.getByTestId("window-too-small");
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();

    await page.setViewportSize({ width: 700, height: 800 });
    await expect(notice).toBeVisible();
    const focusInNotice = () =>
        page.evaluate(() =>
            Boolean(
                document
                    .querySelector("[data-testid=window-too-small]")
                    ?.contains(document.activeElement),
            ),
        );
    await expect.poll(focusInNotice).toBe(true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await focusInNotice()).toBe(true);

    // Neither Escape nor a shortcut gets past it
    await page.keyboard.press("Escape");
    await expect(notice).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Search commands…")).toHaveCount(0);
});
