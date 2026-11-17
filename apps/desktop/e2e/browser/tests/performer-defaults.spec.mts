import { test, expect } from "../fixtures.mjs";

test("Show settings set how marchers move by default", async ({
    show,
}, testInfo) => {
    const { page } = show;
    const saved = async () => {
        const rows = (await show.query(
            "SELECT json_data FROM workspace_settings WHERE id = 1",
        )) as { json_data: string }[];
        return rows[0]
            ? JSON.parse(rows[0].json_data).performerDefaults
            : undefined;
    };

    await page
        .getByRole("button", { name: /show settings/i })
        .first()
        .click();
    const section = page.getByRole("region", { name: "Performer defaults" });
    await expect(section).toBeVisible();
    const dot = section.getByRole("combobox", { name: "Dot marks" });
    const foot = section.getByRole("combobox", { name: "Step off on" });
    await expect(dot).toHaveText("Foot on the dot");
    await expect(foot).toHaveText("Left foot");
    await expect(
        section.getByRole("combobox", { name: "Direction changes" }),
    ).toHaveText("Round the corner");
    await expect(
        section.getByRole("combobox", { name: "Holding while others move" }),
    ).toHaveText("Mark time");

    await dot.click();
    await page.getByRole("option", { name: "Body center" }).click();
    await foot.click();
    await page.getByRole("option", { name: "Right foot" }).click();
    await expect(dot).toHaveText("Body center");
    await page.screenshot({
        path: testInfo.outputPath("performer-defaults.png"),
    });

    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect.poll(saved).toEqual({ dotMode: "body", stepOffFoot: "right" });
});
