import { Page, expect } from "@playwright/test";

/**
 * Utility functions for wizard E2E tests
 */

export interface WizardTestData {
    projectName: string;
    designer?: string;
    client?: string;
    environment?: "indoor" | "outdoor";
    ensembleType?: string;
    performers?: Array<{
        quantity: number;
        section: string;
    }>;
    musicMethod?: "tempo_only" | "xml" | "mp3" | "skip";
    tempo?: number;
    startCount?: number;
}

/**
 * Starts the wizard from the launch page
 */
export async function startWizard(page: Page): Promise<void> {
    await expect(page.getByText("Welcome to OpenMarch")).toBeVisible({
        timeout: 10000,
    });
    await page.getByRole("button", { name: /create new/i }).click();
    await expect(page.getByText("Guided Setup")).toBeVisible({ timeout: 5000 });
}

/**
 * Fills out the Project step
 */
export async function fillProjectStep(
    page: Page,
    data: { projectName: string; designer?: string; client?: string },
): Promise<void> {
    await expect(page.getByText("Project Information")).toBeVisible();

    await page.getByPlaceholder("My Show").fill(data.projectName);

    if (data.designer) {
        await page.getByPlaceholder("Designer Name").fill(data.designer);
    }

    if (data.client) {
        await page
            .getByPlaceholder("Client/Organization Name")
            .fill(data.client);
    }
}

/**
 * Fills out the Ensemble step
 */
export async function fillEnsembleStep(
    page: Page,
    data: { environment: "indoor" | "outdoor"; ensembleType?: string },
): Promise<void> {
    await expect(page.getByText("Ensemble")).toBeVisible();

    const environmentSelect = page
        .getByRole("button", { name: new RegExp(data.environment, "i") })
        .first();
    await environmentSelect.click();
    await page
        .getByRole("option", { name: new RegExp(data.environment, "i") })
        .click();

    if (data.ensembleType) {
        const ensembleTypeSelect = page
            .getByRole("button", { name: new RegExp(data.ensembleType, "i") })
            .first();
        await ensembleTypeSelect.click();
        await page
            .getByRole("option", { name: new RegExp(data.ensembleType, "i") })
            .click();
    }
}

/**
 * Fills out the Performers step
 */
export async function fillPerformersStep(
    page: Page,
    performers: Array<{ quantity: number; section: string }>,
): Promise<void> {
    await expect(page.getByText("Add Performers")).toBeVisible();

    for (const performer of performers) {
        await page
            .getByRole("spinbutton", { name: /quantity/i })
            .fill(performer.quantity.toString());
        await page.getByRole("combobox", { name: /section/i }).click();
        await page
            .getByRole("option", { name: new RegExp(performer.section, "i") })
            .click();
        await page.getByRole("button", { name: /create/i }).click();

        // Wait for performer to be added
        await expect(
            page.getByText(new RegExp(`${performer.section[0]}\\d+`)),
        ).toBeVisible({ timeout: 2000 });
    }
}

/**
 * Fills out the Music step
 */
export async function fillMusicStep(
    page: Page,
    data: {
        method: "tempo_only" | "xml" | "mp3" | "skip";
        tempo?: number;
        startCount?: number;
    },
): Promise<void> {
    await expect(page.getByText("Add Music")).toBeVisible();

    const musicMethodSelect = page
        .getByRole("button", {
            name: new RegExp(
                data.method === "tempo_only" ? "tempo only" : data.method,
                "i",
            ),
        })
        .first();
    await musicMethodSelect.click();
    await page
        .getByRole("option", {
            name: new RegExp(
                data.method === "tempo_only" ? "tempo only" : data.method,
                "i",
            ),
        })
        .click();

    if (data.method === "tempo_only") {
        if (data.tempo) {
            await page
                .getByRole("spinbutton", { name: /tempo/i })
                .fill(data.tempo.toString());
        }
        if (data.startCount) {
            await page
                .getByRole("spinbutton", { name: /start count/i })
                .fill(data.startCount.toString());
        }
    }
}

/**
 * Navigates through wizard steps using Next button
 */
export async function navigateWizardSteps(
    page: Page,
    stepsToNavigate: number,
): Promise<void> {
    for (let i = 0; i < stepsToNavigate; i++) {
        await page.getByRole("button", { name: /next/i }).click();
        // Small delay to ensure step transition completes
        await page.waitForTimeout(300);
    }
}

/**
 * Completes the wizard
 */
export async function completeWizard(page: Page): Promise<void> {
    await page.getByRole("button", { name: /complete/i }).click();
    await expect(page.getByText("Timeline")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("canvas").nth(1)).toBeVisible({ timeout: 5000 });
}

/**
 * Completes the entire wizard with provided data
 */
export async function completeWizardWithData(
    page: Page,
    data: WizardTestData,
): Promise<void> {
    await startWizard(page);

    // Project step
    await fillProjectStep(page, {
        projectName: data.projectName,
        designer: data.designer,
        client: data.client,
    });
    await page.getByRole("button", { name: /next/i }).click();

    // Ensemble step
    if (data.environment) {
        await fillEnsembleStep(page, {
            environment: data.environment,
            ensembleType: data.ensembleType,
        });
    }
    await page.getByRole("button", { name: /next/i }).click();

    // Field step (no input needed, just proceed)
    await page.getByRole("button", { name: /next/i }).click();

    // Performers step
    if (data.performers && data.performers.length > 0) {
        await fillPerformersStep(page, data.performers);
    }
    await page.getByRole("button", { name: /next/i }).click();

    // Music step
    if (data.musicMethod) {
        await fillMusicStep(page, {
            method: data.musicMethod,
            tempo: data.tempo,
            startCount: data.startCount,
        });
    }

    // Complete
    await completeWizard(page);
}

/**
 * Verifies the wizard is on a specific step
 */
export async function verifyWizardStep(
    page: Page,
    stepTitle: string,
): Promise<void> {
    await expect(page.getByText(stepTitle)).toBeVisible();
}

/**
 * Verifies wizard progress indicator shows correct step
 */
export async function verifyWizardProgress(
    page: Page,
    stepNumber: number,
): Promise<void> {
    const stepIndicator = page
        .locator('[class*="rounded-full"]')
        .filter({ hasText: stepNumber.toString() });
    await expect(stepIndicator.first()).toHaveClass(/bg-accent/);
}
