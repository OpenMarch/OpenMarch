import { expect, test } from "@playwright/test";

const CMS_URL = process.env.PAYLOAD_CMS_URL ?? "http://localhost:3000";

async function getPublishedPostsCount(): Promise<number> {
    const res = await fetch(
        `${CMS_URL}/api/posts?limit=1&where[status][equals]=published`,
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { totalDocs: number };
    return data.totalDocs ?? 0;
}

test.describe("CMS blogs on home page", () => {
    test("blogs section exists and renders", async ({ page }) => {
        await page.goto("/");

        const blogsSection = page.locator("#blogs");
        await expect(blogsSection).toBeVisible();
        await expect(blogsSection.locator("h1")).toContainText(
            "The latest updates from us",
        );
    });

    test("when posts are present in CMS, they show with correct title, author, and image", async ({
        page,
    }) => {
        const postCount = await getPublishedPostsCount();
        test.skip(postCount === 0, "CMS has no published posts to verify");

        await page.goto("/");

        const payloadCard = page.locator("#blogs a[href*='payload-']").first();
        await expect(payloadCard).toBeVisible();
        await expect(payloadCard.locator("h2")).toBeVisible();
        await expect(payloadCard.locator("p").first()).toContainText("by ");
        await expect(payloadCard.locator("img[alt]").first()).toBeVisible();
    });

    test("when no posts are present in CMS, no payload-sourced blog cards", async ({
        page,
    }) => {
        const postCount = await getPublishedPostsCount();
        test.skip(postCount > 0, "CMS has posts; cannot verify empty state");

        await page.goto("/");

        const payloadLinks = page.locator("#blogs a[href*='payload-']");
        await expect(payloadLinks).toHaveCount(0);
    });
});
