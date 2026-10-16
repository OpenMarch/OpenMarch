/* eslint-disable no-console, max-lines-per-function -- one journey, step by step */
// cspell:words pdfkit
/**
 * Library import review end to end (package C1.10; ADR 0002 D-13, owner
 * decisions Q60–Q68, Q76): Import… in the Assets sidebar tab opens the
 * review, main's `dialog.showOpenDialog` is stubbed to "pick" files, and
 * each import lands in a Library under this test's own user data dir; after
 * Add, the review closes onto the Assets tab's Library with the new items
 * highlighted.
 *
 * Covered: a GLB needing the kind, units, rotate, simplify and a grip set by
 * a click, then Add; the same file again as "Add new version"; a model with
 * no artwork slot, its surface picked from the material list (Q67); a
 * rejection on the same screen; a mixed pick shown inline, then Choose files
 * again; a PNG with no print size, sized by default with no DPI line (Q75,
 * Q77); a two-page PDF with two aspects, its 36 × 54 in page printing on
 * Silk (Q68).
 *
 * Fixtures are made at test time from the committed model-import fixtures,
 * with sharp and pdfkit. With `IMPORT_REVIEW_SCREENSHOTS=<dir>` set, the run
 * also saves a screenshot of each main state there, in the dark theme.
 */
import { markQualityNoticeSeen, test } from "../fixtures.mjs";
import { expect, type Page } from "playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, "../..");
const requireFromDesktop = createRequire(path.join(DESKTOP, "package.json"));
const MAIN_FILE = path.join(DESKTOP, "dist-electron/main/index.js");
const MODEL_FIXTURES = path.join(
    DESKTOP,
    "electron/main/model-import/__test__/fixtures",
);
const SCREENSHOTS = process.env.IMPORT_REVIEW_SCREENSHOTS ?? null;
/** Inspecting, converting and rendering PDFs runs in a worker: be patient. */
const SLOW = 120_000;

test.describe.configure({ timeout: 6 * 60_000 });

// ------------------------------------------------------------------ fixtures

interface Fixtures {
    mace: string;
    riser: string;
    overCap: string;
    png: string;
    pdf: string;
}

/**
 * A drum major mace needing every choice: the dense flag (over the 2k
 * triangle cap) in centimeters, Z-up, with no grips and no kit stamp, so a
 * plain Library import asks for the kind first. Plus a riser with no
 * artwork slot, a model over 4× the cap, a 600 × 900 px PNG with no print
 * size and a two-page PDF (36 × 54 in, then 4 × 8 ft).
 */
async function makeFixtures(dir: string): Promise<Fixtures> {
    await fs.ensureDir(dir);
    const { NodeIO } = requireFromDesktop(
        "@gltf-transform/core",
    ) as typeof import("@gltf-transform/core");
    const sharp = requireFromDesktop("sharp") as typeof import("sharp");
    const PDFDocument = requireFromDesktop("pdfkit") as typeof import("pdfkit");

    const io = new NodeIO();
    const doc = await io.read(path.join(MODEL_FIXTURES, "equipment-dense.glb"));
    const root = doc.getRoot();
    for (const scene of root.listScenes()) scene.setExtras({});
    for (const node of root.listNodes()) {
        if (node.getName().startsWith("OM_grip")) node.dispose();
    }
    const top = root.listScenes()[0].listChildren()[0];
    top.setScale([100, 100, 100]);
    top.setRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    const mace = path.join(dir, "drum_major_mace.glb");
    await fs.writeFile(mace, await io.writeBinary(doc));

    const riser = path.join(dir, "riser.glb");
    await fs.copyFile(path.join(MODEL_FIXTURES, "prop-no-extras.glb"), riser);
    const overCap = path.join(dir, "dense_flag.glb");
    await fs.copyFile(
        path.join(MODEL_FIXTURES, "equipment-over-4x.glb"),
        overCap,
    );

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c4dff"/><stop offset="1" stop-color="#e0306a"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><ellipse cx="300" cy="450" rx="170" ry="260" fill="#f5d76e" opacity="0.8"/></svg>`;
    const png = path.join(dir, "flag_front.png");
    await sharp(Buffer.from(svg)).png().toFile(png);

    const pdfDoc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => pdfDoc.on("end", resolve));
    pdfDoc.addPage({ size: [36 * 72, 54 * 72], margin: 0 });
    pdfDoc.rect(0, 0, 36 * 72, 54 * 72).fill("#2d4f9e");
    pdfDoc.circle(18 * 72, 27 * 72, 12 * 72).fill("#f5d76e");
    pdfDoc.addPage({ size: [48 * 72, 96 * 72], margin: 0 });
    pdfDoc.rect(0, 0, 48 * 72, 96 * 72).fill("#1f7a4d");
    pdfDoc.rect(8 * 72, 16 * 72, 32 * 72, 64 * 72).fill("#ffffff");
    pdfDoc.end();
    await done;
    const pdf = path.join(dir, "winter_guard_silks.pdf");
    await fs.writeFile(pdf, Buffer.concat(chunks));

    return { mace, riser, overCap, png, pdf };
}

// ------------------------------------------------------------------ helpers

async function launch(databasePath: string, userData: string) {
    const app = await electron.launch({
        executablePath: requireFromDesktop("electron") as string,
        args: [
            MAIN_FILE,
            databasePath,
            `--user-data-dir=${userData}`,
            "--no-audio",
            "--disable-audio-output",
            "--disable-audio-input",
        ],
        env: {
            ...process.env,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
        },
    });
    app.process().stderr?.on("data", (data) => {
        console.log("[MAIN STDERR]", data.toString().trim());
    });
    await markQualityNoticeSeen(app);
    return app;
}

/** Makes main's next file dialog answer `paths`. */
async function stubPick(app: ElectronApplication, paths: string[]) {
    await app.evaluate(({ dialog }, filePaths) => {
        dialog.showOpenDialog = (async () => ({
            canceled: false,
            filePaths,
        })) as unknown as typeof dialog.showOpenDialog;
    }, paths);
}

/** Opens the Assets sidebar tab unless it's open already. */
async function openAssets(page: Page) {
    if (!(await page.getByTestId("assets-panel").count())) {
        await page.getByTestId("assets-tab").click();
    }
    await expect(page.getByTestId("import-to-library")).toBeVisible({
        timeout: SLOW,
    });
}

async function startImport(
    app: ElectronApplication,
    page: Page,
    paths: string[],
) {
    await stubPick(app, paths);
    await openAssets(page);
    await page.getByTestId("import-to-library").click();
    await expect(page.getByTestId("import-review-host")).toBeVisible();
}

const panel = (page: Page) => page.getByTestId("import-panel");

async function expectPhase(page: Page, phase: string) {
    await expect(panel(page)).toHaveAttribute("data-phase", phase, {
        timeout: SLOW,
    });
}

async function expectAddReady(page: Page) {
    await expect(page.getByTestId("import-add")).toBeEnabled({
        timeout: SLOW,
    });
}

/** After Add: the review closes onto the Library, the item highlighted (Q76). */
async function expectInLibrary(page: Page, name: string) {
    await expect(page.getByTestId("import-review-host")).toHaveCount(0, {
        timeout: SLOW,
    });
    const items = page
        .getByTestId("library-browser")
        .getByTestId("library-item")
        .filter({ hasText: name });
    await expect(items.first()).toBeVisible({ timeout: SLOW });
    await expect(items.first()).toHaveAttribute("data-highlighted", "true");
    return items;
}

async function closeReview(page: Page) {
    if (!(await page.getByTestId("import-review-host").count())) return;
    const close = page.getByTestId("import-close");
    if (await close.count()) await close.click();
    else await page.getByTestId("import-cancel").click();
    await expect(page.getByTestId("import-review-host")).toHaveCount(0);
}

async function screenshot(page: Page, name: string) {
    if (!SCREENSHOTS) return;
    // Let the preview finish drawing and the canvas settle.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`) });
}

// ------------------------------------------------------------------ test

test("imports models and artwork through the review", async ({
    setupDb,
}, testInfo) => {
    const fixtures = await makeFixtures(
        path.join(testInfo.outputDir, "import-files"),
    );
    const userData = path.join(testInfo.outputDir, "user-data");
    await fs.remove(userData);
    if (SCREENSHOTS) await fs.ensureDir(SCREENSHOTS);

    const app = await launch(setupDb.databasePath, userData);
    try {
        const page = await app.firstWindow();
        await app.evaluate(({ BrowserWindow, nativeTheme }, dark) => {
            if (dark) nativeTheme.themeSource = "dark";
            BrowserWindow.getAllWindows()
                .find((w) => w.isVisible())
                ?.setSize(1440, 900);
        }, SCREENSHOTS !== null);
        if (SCREENSHOTS) {
            // Store the theme the editor reads at start, then start it again.
            await page.evaluate(() =>
                (
                    window as unknown as {
                        electron: { setTheme(theme: string): Promise<void> };
                    }
                ).electron.setTheme("dark"),
            );
            await page.reload();
            await expect(page.locator("html")).toHaveClass(/dark/, {
                timeout: SLOW,
            });
        }
        await openAssets(page);
        await expect(page.getByTestId("library-empty")).toBeVisible();

        await test.step("a model needing every choice, grip set by a click", async () => {
            await startImport(app, page, [fixtures.mace]);
            await expectPhase(page, "review");
            await expect(page.getByTestId("import-kind")).toBeVisible();
            await expect(page.getByTestId("import-add")).toHaveAttribute(
                "data-blocker",
                "needsKind",
            );
            await screenshot(page, "01-model-needs-kind");

            await page.getByTestId("import-kind-equipment").click();
            await expectAddReady(page);
            await expect(page.getByTestId("import-units-cm")).toHaveAttribute(
                "aria-pressed",
                "true",
            );
            for (const id of [
                "import-choice-rotate",
                "import-choice-simplify",
                "import-choice-grip",
            ]) {
                await expect(page.getByTestId(id)).toHaveAttribute(
                    "data-state",
                    "checked",
                );
            }
            // The flag's silk is marked in the file: no surface question.
            await expect(page.getByTestId("import-surface")).toHaveCount(0);
            await expect(page.getByTestId("import-stage-model")).toBeVisible();
            await screenshot(page, "02-model-choices");

            await page.getByTestId("import-before").click();
            await expect(
                page.getByTestId("import-stage-before-after"),
            ).toHaveText("Before", { timeout: SLOW });
            await page.getByTestId("import-after").click();
            await expect(
                page.getByTestId("import-stage-before-after"),
            ).toHaveText("After");

            // Click the model until a point lands on it.
            await page.getByTestId("import-grip-pick").click();
            await expect(
                page.getByTestId("import-stage-picking"),
            ).toBeVisible();
            const canvas = page.locator(
                '[data-testid="import-stage-model"] canvas',
            );
            const box = (await canvas.boundingBox())!;
            let picked = false;
            for (const fy of [0.3, 0.4, 0.5, 0.6]) {
                for (const fx of [0.5, 0.45, 0.4, 0.55, 0.35]) {
                    await page.mouse.click(
                        box.x + box.width * fx,
                        box.y + box.height * fy,
                    );
                    await page.waitForTimeout(300);
                    if (
                        !(await page
                            .getByTestId("import-stage-picking")
                            .count())
                    )
                        picked = true;
                    if (picked) break;
                }
                if (picked) break;
            }
            expect(picked).toBe(true);
            await expect(
                page.getByTestId("import-group-choices"),
            ).toContainText("Set by your click on the model.", {
                timeout: SLOW,
            });
            await expectAddReady(page);
            await screenshot(page, "03-model-grip-set");

            await page.getByTestId("import-add").click();
            await expectInLibrary(page, "drum major mace");
            await screenshot(page, "04-model-added");
        });

        await test.step("the same file again adds a new version", async () => {
            await startImport(app, page, [fixtures.mace]);
            await expectPhase(page, "review");
            await page.getByTestId("import-kind-equipment").click();
            await expectAddReady(page);
            await expect(page.getByTestId("import-match")).toBeVisible();
            await expect(page.getByTestId("import-add")).toHaveText(
                "Add new version",
            );
            await screenshot(page, "05-model-reimport");
            await page.getByTestId("import-add").click();
            // A new version of the same item, not a second item.
            const maces = await expectInLibrary(page, "drum major mace");
            await expect(maces).toHaveCount(1);
        });

        await test.step("a model with no slot: pick its artwork surface", async () => {
            await startImport(app, page, [fixtures.riser]);
            await expectPhase(page, "review");
            await page.getByTestId("import-kind-prop").click();
            await expectAddReady(page);
            const surface = page.getByTestId("import-surface");
            await expect(surface).toBeVisible();
            await expect(
                page.getByTestId("import-surface-none"),
            ).toHaveAttribute("aria-checked", "true");
            await expect(page.getByTestId("import-surface-0")).toContainText(
                "Wood",
            );
            await page.getByTestId("import-surface-0").hover();
            await expect(page.getByTestId("import-stage-surface")).toHaveText(
                "Artwork surface: Wood",
            );
            await page.getByTestId("import-surface-0").click();
            await expect(page.getByTestId("import-surface-0")).toHaveAttribute(
                "aria-checked",
                "true",
            );
            await expectAddReady(page);
            await screenshot(page, "06-model-artwork-surface");
            await page.getByTestId("import-add").click();
            await expectInLibrary(page, "riser");
        });

        await test.step("a rejection shows on the same screen", async () => {
            await startImport(app, page, [fixtures.overCap]);
            await expectPhase(page, "review");
            const cant = page.getByTestId("import-group-cant");
            await expect(cant).toBeVisible({ timeout: SLOW });
            await expect(cant).toContainText("starter kit");
            await expect(page.getByTestId("import-add")).toHaveAttribute(
                "data-blocker",
                "rejected",
            );
            await screenshot(page, "07-model-rejected");
            await closeReview(page);
        });

        await test.step("a mixed pick, then a PNG sized by default", async () => {
            await startImport(app, page, [fixtures.mace, fixtures.png]);
            await expectPhase(page, "error");
            await expect(page.getByTestId("import-error")).toBeVisible();
            await screenshot(page, "08-mixed-selection");

            await stubPick(app, [fixtures.png]);
            await page.getByTestId("import-retry").click();
            await expectPhase(page, "review");
            await expect(page.getByTestId("import-stage-image")).toBeVisible({
                timeout: SLOW,
            });
            // A default size is pre-selected, and there is no DPI or
            // print-readiness line (Q75, Q77).
            await expect(page.getByTestId("import-dpi")).toHaveCount(0);
            await expectAddReady(page);
            await screenshot(page, "09-png-default-size");
            await page.getByTestId("import-add").click();
            await expectInLibrary(page, "flag front");
        });

        await test.step("a two-page PDF with two aspects", async () => {
            await startImport(app, page, [fixtures.pdf]);
            await expectPhase(page, "review");
            await expect(page.getByTestId("import-size-0")).toBeVisible({
                timeout: SLOW,
            });
            await expect(page.getByTestId("import-size-1")).toBeVisible();
            // 36 × 54 in is the silk template: it prints on Silk (Q68).
            await expect(
                page.getByTestId("import-size-0-surface-silk"),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(page.getByTestId("import-add")).toHaveText(
                "Add 2 to Library",
            );
            await expect(page.getByTestId("import-stage-image")).toBeVisible({
                timeout: SLOW,
            });
            await screenshot(page, "10-pdf-two-aspects");
            await page.getByTestId("import-add").click();
            await expectInLibrary(page, "winter guard silks (page 1)");
            await expectInLibrary(page, "winter guard silks (page 2)");
            await expect(
                page
                    .getByTestId("library-group-silks")
                    .getByTestId("library-item")
                    .filter({ hasText: "(page 1)" }),
            ).toHaveCount(1);
            await screenshot(page, "11-pdf-added");
        });
    } finally {
        await app.close();
    }
});
