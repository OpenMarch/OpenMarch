import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import {
    fillProjectStep,
    openNewShowWizard,
} from "../utils/new-show-wizard.mjs";

const dialogOf = (page: Parameters<typeof openNewShowWizard>[0]) =>
    page.getByRole("dialog", { name: "New show" });

// Walks Project -> Activity -> Field -> Performers without skipping, leaving the
// wizard on the Performers step so the preset roster can be inspected
async function advanceToPerformersStep(
    page: Parameters<typeof openNewShowWizard>[0],
    projectName: string,
) {
    await openNewShowWizard(page);
    await fillProjectStep(page, projectName);
    const dialog = dialogOf(page);

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Field setup",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Performers",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
}

test("Activity step shows the ensemble size selector", async ({
    electronAppEmpty,
}) => {
    const { page } = electronAppEmpty;
    const dialog = dialogOf(page);

    await openNewShowWizard(page);
    await fillProjectStep(page, "Size Selector Test");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await expect(dialog.getByText("Ensemble size")).toBeVisible();
});

test("Performers step is pre-filled from the activity preset", async ({
    electronAppEmpty,
}) => {
    const { page } = electronAppEmpty;
    const dialog = dialogOf(page);

    await advanceToPerformersStep(page, "Preset Roster Test");

    // The default activity (Marching Band) seeds a roster, so the empty state is gone
    await expect(dialog.getByText("No performers added yet.")).toHaveCount(0);
    // Marching Band has trumpets at every size, so the group is always present
    await expect(
        dialog.getByRole("button", { name: /Trumpet \(\d+\)/ }),
    ).toBeVisible();
});
