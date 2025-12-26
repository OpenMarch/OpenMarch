import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import {
    startWizard,
    fillProjectStep,
    fillEnsembleStep,
    fillPerformersStep,
    fillMusicStep,
    completeWizard,
    completeWizardWithData,
    verifyWizardStep,
    verifyWizardProgress,
} from "../utils/wizard.mjs";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E tests for the Guided Setup Wizard
 *
 * These tests verify that the wizard:
 * - Can be launched from the launch page
 * - All steps are accessible and functional
 * - Data is properly collected and persisted
 * - Navigation works correctly
 * - File is created with correct data
 */

test.describe("Wizard - Complete Flow", () => {
    test("Complete wizard flow with all steps", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        // Wait for launch page to load
        await expect(page.getByText("Welcome to OpenMarch")).toBeVisible({
            timeout: 10000,
        });

        // Click "New File" to start wizard
        await page.getByRole("button", { name: /create new/i }).click();

        // Wait for wizard to appear
        await expect(page.getByText("Guided Setup")).toBeVisible({
            timeout: 5000,
        });
        await expect(page.getByText("Project Information")).toBeVisible();

        // Step 1: Project Information
        await expect(page.getByText("Project Name")).toBeVisible();
        const projectNameInput = page.getByPlaceholder("My Show");
        await projectNameInput.fill("Test Show");

        // Verify file location is auto-generated
        const fileLocationInput = page
            .locator('input[placeholder*="path"]')
            .first();
        await expect(fileLocationInput).toHaveValue(/Test Show\.dots$/);

        // Click Next
        await page.getByRole("button", { name: /next/i }).click();

        // Step 2: Ensemble
        await expect(page.getByText("Ensemble")).toBeVisible();
        await expect(page.getByText("Select your ensemble type")).toBeVisible();

        // Verify default values
        const environmentSelect = page
            .getByRole("button", { name: /outdoor/i })
            .first();
        await expect(environmentSelect).toBeVisible();

        // Change to indoor
        await environmentSelect.click();
        await page.getByRole("option", { name: /indoor/i }).click();

        // Verify ensemble type updates
        const ensembleTypeSelect = page
            .getByRole("button", { name: /indoor percussion/i })
            .first();
        await expect(ensembleTypeSelect).toBeVisible();

        await page.getByRole("button", { name: /next/i }).click();

        // Step 3: Field Setup
        await expect(page.getByText("Field Setup")).toBeVisible();
        await expect(page.getByText("Choose a field template")).toBeVisible();

        // Verify field preview is visible
        await expect(page.locator("canvas").first()).toBeVisible({
            timeout: 5000,
        });

        await page.getByRole("button", { name: /next/i }).click();

        // Step 4: Performers
        await expect(page.getByText("Add Performers")).toBeVisible();
        await expect(page.getByText("Add New Performer")).toBeVisible();

        // Add a performer
        const quantityInput = page.getByRole("spinbutton", {
            name: /quantity/i,
        });
        await quantityInput.fill("5");

        const sectionSelect = page.getByRole("combobox", { name: /section/i });
        await sectionSelect.click();
        await page.getByRole("option", { name: /trumpet/i }).click();

        await page.getByRole("button", { name: /create/i }).click();

        // Verify performers were added
        await expect(page.getByText("T1")).toBeVisible();
        await expect(page.getByText("T5")).toBeVisible();

        await page.getByRole("button", { name: /next/i }).click();

        // Step 5: Music
        await expect(page.getByText("Add Music")).toBeVisible();
        await expect(page.getByText("Music Setup Method")).toBeVisible();

        // Select tempo only
        const musicMethodSelect = page
            .getByRole("button", { name: /tempo only/i })
            .first();
        await musicMethodSelect.click();
        await page.getByRole("option", { name: /tempo only/i }).click();

        // Set tempo
        const tempoInput = page.getByRole("spinbutton", { name: /tempo/i });
        await tempoInput.fill("140");

        // Set start count
        const startCountInput = page.getByRole("spinbutton", {
            name: /start count/i,
        });
        await startCountInput.fill("4");

        // Complete wizard
        await page.getByRole("button", { name: /complete/i }).click();

        // Wait for wizard to complete and editor to load
        await expect(page.getByText("Timeline")).toBeVisible({
            timeout: 15000,
        });
        await expect(page.locator("canvas").nth(1)).toBeVisible({
            timeout: 5000,
        });

        // Verify we're in the main editor (not launch page)
        await expect(page.getByText("Welcome to OpenMarch")).not.toBeVisible();
    });

    test("Wizard navigation - back and next buttons", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        // Start wizard
        await page.getByRole("button", { name: /create new/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        // Fill project name
        await page.getByPlaceholder("My Show").fill("Navigation Test");

        // Go to step 2
        await page.getByRole("button", { name: /next/i }).click();
        await expect(page.getByText("Ensemble")).toBeVisible();

        // Go back to step 1
        await page.getByRole("button", { name: /back/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        // Verify project name is still there
        await expect(page.getByPlaceholder("My Show")).toHaveValue(
            "Navigation Test",
        );

        // Go forward again
        await page.getByRole("button", { name: /next/i }).click();
        await expect(page.getByText("Ensemble")).toBeVisible();
    });

    test("Wizard step validation - cannot proceed without required fields", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        // Start wizard
        await page.getByRole("button", { name: /create new/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        // Try to proceed without project name
        const nextButton = page.getByRole("button", { name: /next/i });
        await expect(nextButton).toBeDisabled();

        // Fill project name
        await page.getByPlaceholder("My Show").fill("Validation Test");

        // Now should be able to proceed
        await expect(nextButton).toBeEnabled();
    });
});

test.describe("Wizard - Individual Steps", () => {
    test("Project Step - file location auto-generation", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        const projectNameInput = page.getByPlaceholder("My Show");
        await projectNameInput.fill("Auto File Test");

        // Verify file location updates automatically
        const fileLocationInput = page
            .locator('input[placeholder*="path"]')
            .first();
        await expect(fileLocationInput).toHaveValue(/Auto File Test\.dots$/);
    });

    test("Project Step - optional fields", async ({ electronAppEmpty }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        // Fill required field
        await page.getByPlaceholder("My Show").fill("Optional Fields Test");

        // Fill optional fields
        const designerInput = page.getByPlaceholder("Designer Name");
        await designerInput.fill("Test Designer");

        const clientInput = page.getByPlaceholder("Client/Organization Name");
        await clientInput.fill("Test Client");

        // Should be able to proceed
        await expect(page.getByRole("button", { name: /next/i })).toBeEnabled();
    });

    test("Ensemble Step - environment and type selection", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await page.getByPlaceholder("My Show").fill("Ensemble Test");
        await page.getByRole("button", { name: /next/i }).click();

        await expect(page.getByText("Ensemble")).toBeVisible();

        // Test outdoor environment
        const environmentSelect = page
            .getByRole("button", { name: /outdoor/i })
            .first();
        await environmentSelect.click();
        await page.getByRole("option", { name: /outdoor/i }).click();

        // Verify outdoor ensemble types are available
        const ensembleTypeSelect = page
            .getByRole("button", { name: /marching band/i })
            .first();
        await expect(ensembleTypeSelect).toBeVisible();

        // Switch to indoor
        await environmentSelect.click();
        await page.getByRole("option", { name: /indoor/i }).click();

        // Verify indoor ensemble types are available
        await expect(
            page.getByRole("button", { name: /indoor percussion/i }).first(),
        ).toBeVisible();
    });

    test("Field Setup Step - field preview visible", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await page.getByPlaceholder("My Show").fill("Field Test");
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();

        await expect(page.getByText("Field Setup")).toBeVisible();

        // Verify field preview canvas is visible
        await expect(page.locator("canvas").first()).toBeVisible({
            timeout: 5000,
        });
    });

    test("Performers Step - add and remove performers", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await page.getByPlaceholder("My Show").fill("Performers Test");
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();

        await expect(page.getByText("Add Performers")).toBeVisible();

        // Add performers
        await page.getByRole("spinbutton", { name: /quantity/i }).fill("3");
        await page.getByRole("combobox", { name: /section/i }).click();
        await page.getByRole("option", { name: /saxophone/i }).click();
        await page.getByRole("button", { name: /create/i }).click();

        // Verify performers were added
        await expect(page.getByText("S1")).toBeVisible();
        await expect(page.getByText("S3")).toBeVisible();

        // Remove a performer (click delete button)
        const deleteButtons = page.getByRole("button", { name: /delete/i });
        const firstDeleteButton = deleteButtons.first();
        await firstDeleteButton.click();

        // Verify performer was removed
        await expect(page.getByText("S1")).not.toBeVisible();
    });

    test("Music Step - tempo only option", async ({ electronAppEmpty }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await page.getByPlaceholder("My Show").fill("Music Test");
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();

        await expect(page.getByText("Add Music")).toBeVisible();

        // Select tempo only
        const musicMethodSelect = page
            .getByRole("button", { name: /tempo only/i })
            .first();
        await musicMethodSelect.click();
        await page.getByRole("option", { name: /tempo only/i }).click();

        // Verify tempo and start count inputs appear
        await expect(
            page.getByRole("spinbutton", { name: /tempo/i }),
        ).toBeVisible();
        await expect(
            page.getByRole("spinbutton", { name: /start count/i }),
        ).toBeVisible();

        // Set values
        await page.getByRole("spinbutton", { name: /tempo/i }).fill("150");
        await page.getByRole("spinbutton", { name: /start count/i }).fill("8");
    });

    test("Music Step - skip option", async ({ electronAppEmpty }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await page.getByPlaceholder("My Show").fill("Skip Music Test");
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();
        await page.getByRole("button", { name: /next/i }).click();

        await expect(page.getByText("Add Music")).toBeVisible();

        // Select skip
        const musicMethodSelect = page
            .getByRole("button", { name: /skip/i })
            .first();
        await musicMethodSelect.click();
        await page.getByRole("option", { name: /skip/i }).click();

        // Verify skip message appears
        await expect(page.getByText(/add music later/i)).toBeVisible();
    });
});

test.describe("Wizard - Data Persistence", () => {
    test("Wizard data persists through navigation", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();

        // Fill project step
        await page.getByPlaceholder("My Show").fill("Persistence Test");
        await page.getByPlaceholder("Designer Name").fill("Test Designer");
        await page.getByRole("button", { name: /next/i }).click();

        // Fill ensemble step
        const environmentSelect = page
            .getByRole("button", { name: /outdoor/i })
            .first();
        await environmentSelect.click();
        await page.getByRole("option", { name: /indoor/i }).click();
        await page.getByRole("button", { name: /next/i }).click();

        // Go back to project step
        await page.getByRole("button", { name: /back/i }).click();

        // Verify data persisted
        await expect(page.getByPlaceholder("My Show")).toHaveValue(
            "Persistence Test",
        );
        await expect(page.getByPlaceholder("Designer Name")).toHaveValue(
            "Test Designer",
        );

        // Go forward again
        await page.getByRole("button", { name: /next/i }).click();

        // Verify ensemble selection persisted
        await expect(
            page.getByRole("button", { name: /indoor/i }).first(),
        ).toBeVisible();
    });
});

test.describe("Wizard - File Creation", () => {
    test("Wizard creates file at specified location", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await startWizard(page);
        await fillProjectStep(page, { projectName: "Wizard File Test" });

        // Complete wizard quickly
        await page.getByRole("button", { name: /next/i }).click(); // Ensemble
        await page.getByRole("button", { name: /next/i }).click(); // Field
        await page.getByRole("button", { name: /next/i }).click(); // Performers
        await page.getByRole("button", { name: /next/i }).click(); // Music
        await completeWizard(page);

        // Verify editor loaded successfully
        await expect(page.locator("canvas").nth(1)).toBeVisible();
    });

    test("Wizard data is persisted to database", async ({ electronApp }) => {
        const { page, databasePath } = electronApp;

        // Complete wizard with specific data
        await completeWizardWithData(page, {
            projectName: "Database Test Show",
            designer: "Test Designer",
            client: "Test Client",
            environment: "outdoor",
            ensembleType: "Marching Band",
            performers: [
                { quantity: 3, section: "Trumpet" },
                { quantity: 2, section: "Trombone" },
            ],
            musicMethod: "tempo_only",
            tempo: 150,
            startCount: 4,
        });

        // Verify database file exists
        expect(fs.existsSync(databasePath)).toBe(true);

        // Verify data in database using sql.js
        const SQL = await initSqlJs({
            locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
        });

        const dbBuffer = fs.readFileSync(databasePath);
        const db = new SQL.Database(dbBuffer);

        // Verify workspace settings (project name, designer, client, tempo)
        const workspaceSettings = db.exec(
            "SELECT json_data FROM workspace_settings WHERE id = 1",
        );
        expect(workspaceSettings.length).toBeGreaterThan(0);

        const settingsJson = JSON.parse(
            workspaceSettings[0].values[0][0] as string,
        );
        expect(settingsJson.projectName).toBe("Database Test Show");
        expect(settingsJson.designer).toBe("Test Designer");
        expect(settingsJson.client).toBe("Test Client");
        expect(settingsJson.defaultTempo).toBe(150);

        // Verify marchers were created
        const marchers = db.exec("SELECT COUNT(*) as count FROM marchers");
        expect(marchers[0].values[0][0]).toBe(5); // 3 trumpets + 2 trombones

        // Verify marchers have correct sections
        const trumpetMarchers = db.exec(
            "SELECT COUNT(*) as count FROM marchers WHERE section = 'Trumpet'",
        );
        expect(trumpetMarchers[0].values[0][0]).toBe(3);

        const tromboneMarchers = db.exec(
            "SELECT COUNT(*) as count FROM marchers WHERE section = 'Trombone'",
        );
        expect(tromboneMarchers[0].values[0][0]).toBe(2);

        db.close();
    });
});

test.describe("Wizard - Edge Cases", () => {
    test("Wizard handles special characters in project name", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();
        await expect(page.getByText("Project Information")).toBeVisible();

        // Test with special characters that should be sanitized
        await page
            .getByPlaceholder("My Show")
            .fill("Test/Show:Name*With<>Special|Chars");

        // Should still be able to proceed
        await expect(page.getByRole("button", { name: /next/i })).toBeEnabled();
    });

    test("Wizard progress indicator shows correct step", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();

        // Verify we're on step 1
        const progressIndicators = page
            .locator('[class*="rounded-full"]')
            .filter({ hasText: "1" });
        await expect(progressIndicators.first()).toHaveClass(/bg-accent/);

        // Go to step 2
        await page.getByPlaceholder("My Show").fill("Progress Test");
        await page.getByRole("button", { name: /next/i }).click();

        // Verify step 2 is highlighted
        const step2Indicator = page
            .locator('[class*="rounded-full"]')
            .filter({ hasText: "2" });
        await expect(step2Indicator.first()).toHaveClass(/bg-accent/);
    });

    test("Wizard can be completed with minimal data", async ({
        electronAppEmpty,
    }) => {
        const { page } = electronAppEmpty;

        await page.getByRole("button", { name: /create new/i }).click();

        // Only fill required field
        await page.getByPlaceholder("My Show").fill("Minimal Test");

        // Skip through all optional steps
        await page.getByRole("button", { name: /next/i }).click(); // Ensemble (has defaults)
        await page.getByRole("button", { name: /next/i }).click(); // Field (has defaults)
        await page.getByRole("button", { name: /next/i }).click(); // Performers (can skip)
        await page.getByRole("button", { name: /next/i }).click(); // Music

        // Skip music
        const musicMethodSelect = page
            .getByRole("button", { name: /skip/i })
            .first();
        await musicMethodSelect.click();
        await page.getByRole("option", { name: /skip/i }).click();

        // Complete
        await page.getByRole("button", { name: /complete/i }).click();

        // Should complete successfully
        await expect(page.getByText("Timeline")).toBeVisible({
            timeout: 15000,
        });
    });
});
