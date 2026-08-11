/* eslint-disable max-lines-per-function */
import { dialog, BrowserWindow, app, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import sanitize from "sanitize-filename";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit doesn't have types
import SVGtoPDF from "svg-to-pdfkit";
import Page from "../../../src/global/classes/Page";
import sanitizeHtml from "sanitize-html";

import Store from "electron-store";
import { getOrmConnection } from "../../database/database.services";
import { measureRangeString as _measureRangeString } from "../../../src/global/classes/Page.utils";
import logoSvgRaw from "@/assets/open-march-logo.svg?raw";

const store = new Store();

// Logo for HTML header/footer templates (data URI required by printToPDF)
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(
    logoSvgRaw.replace(/currentColor/g, "black"),
).toString("base64")}`;

const headerHtml = ({ showName }: { showName: string }) => `
<div style="
    padding: 4px 16px;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #999;
    width: 100%;
    box-sizing: border-box;
    height: 20px;
">
    <div style="flex: 1; text-align: left;">
        ${logoDataUri ? `<img src="${logoDataUri}" style="height: 16px; width: auto;" />` : "Logo not found"}
    </div>
    <div style="flex: 1; text-align: center; font-weight: bold; font-size: 8px;">
        ${showName}
    </div>
    <div style="flex: 1;"></div>
</div>
`;

// Function (not a const) so the export date is not frozen at app launch
const footerHtml = () => `
<div style="
    padding: 4px 16px;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 8px;
    color: #999;
    width: 100%;
    box-sizing: border-box;
    height: 16px;
">
    <div style="flex: 1; text-align: left;">Exported ${new Date().toLocaleDateString()}</div>
    <div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;">
        <img src="${logoDataUri}" style="height: 10px; width: auto; opacity: 0.55;" />
        <span>Made with OpenMarch</span>
    </div>
    <div style="flex: 1; text-align: right;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>
</div>
`;

function chunkArray<T>(array: T[], size: number): T[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

const printStyles = (quarterPages: boolean) => `
  @media print {
    .marcher-sheet {
      page-break-before: auto;
      min-height: 10in;
      width: 100%;
      box-sizing: border-box;
    }
    .marcher-sheet:not(:last-child) {
      page-break-after: always;
    }
    ${
        quarterPages
            ? `
      .grid-container {
        display: grid;
        grid-template-columns: 50% 50%;
        grid-template-rows: 50% 50%;
        height: 10in;
        width: 7.5in;
      }
      .grid-container:not(:last-child) {
        page-break-after: always;
      }
      .grid-item {
        box-sizing: border-box;
        padding: 0.1in;
        border: 1px solid #333;
      }
      .marcher-sheet {
        page-break-before: auto;
        page-break-after: auto;
        min-height: auto;
        padding: 0.5rem;
      }
    `
            : ""
    }

    /* Allow tables to break across pages but keep headers */
    table {
      page-break-inside: auto;
    }

    /* Ensure table headers repeat on each page */
    thead {
      display: table-header-group;
    }

    /* Ensure performer header repeats on each page */
    .sheetHeader {
      display: table-header-group;
      page-break-inside: avoid;
      page-break-after: avoid;
    }

    /* Keep coordinate rows whole across page breaks */
    tbody tr {
      page-break-inside: avoid;
    }
  }

  @page {
    margin: 0.5in;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
  }
`;

/**
 * Wrap rendered coordinate sheets in a printable HTML document. In quarter
 * page mode, sheets are arranged into 2x2 grids; otherwise each sheet starts
 * on its own page and may flow onto more (the print styles keep the table
 * headers repeating and rows unbroken).
 */
function buildSheetDocumentHtml(
    sheets: string[],
    quarterPages: boolean,
): string {
    const combinedHtml = quarterPages
        ? chunkArray(sheets, 4)
              .map(
                  (chunk) => `<div class="grid-container">
                      ${chunk.map((sheet) => `<div class="grid-item">${sheet}</div>`).join("")}
                  </div>`,
              )
              .join("")
        : sheets
              .map((sheet) => `<div class="marcher-sheet">${sheet}</div>`)
              .join("");

    return `<html>
      <head>
        <meta charset="UTF-8" />
        <title>PDF Export</title>
        <style>${printStyles(quarterPages)}</style>
      </head>
      <body>${combinedHtml}</body>
    </html>`;
}

/**
 * Render an HTML document to a PDF buffer in a hidden window with the
 * OpenMarch header/footer. Handles temp file plumbing, timeout, and cleanup.
 */
async function printHtmlToPdf(
    htmlContent: string,
    margins: Electron.PrintToPDFOptions["margins"],
    timeoutMs = 30000,
): Promise<Buffer> {
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "openmarch-export-"),
    );
    const tempFile = path.join(tempDir, "export.html");
    await fs.promises.writeFile(tempFile, htmlContent, { mode: 0o600 });

    const win = new BrowserWindow({ width: 1200, height: 800, show: false });
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () =>
                        reject(
                            new Error(
                                `PDF generation timed out after ${timeoutMs / 1000} seconds`,
                            ),
                        ),
                    timeoutMs,
                );
            }),
            (async () => {
                await win.loadFile(tempFile);
                return await win.webContents.printToPDF({
                    margins,
                    pageSize: "Letter",
                    printBackground: true,
                    headerTemplate: headerHtml({
                        showName: PDFExportService.getCurrentFilename(),
                    }),
                    footerTemplate: footerHtml(),
                    displayHeaderFooter: true,
                });
            })(),
        ]);
    } finally {
        clearTimeout(timeout);
        win.destroy();
        await fs.promises
            .rm(tempDir, { recursive: true, force: true })
            .catch(() => {});
    }
}

// Modified from Page.ts for export purposes
const measureRangeString = (page: Page): string => {
    try {
        if (!page.measures || page.measures.length === 0) return "START";
        else return _measureRangeString(page);
    } catch (err) {
        return "N/A";
    }
};

interface ExportSheet {
    name: string;
    drillNumber: string;
    section: string;
    renderedPage: string;
}

const FOOTER_BRANDING = "Made with OpenMarch";

// svg-to-pdfkit prefers the root width/height attributes over the options,
// so strip them to make the logo scale to the footer size (viewBox remains)
const footerLogoSvg = (() => {
    const rootTagEnd = logoSvgRaw.indexOf(">");
    const rootTag = logoSvgRaw
        .slice(0, rootTagEnd)
        .replace(/\s(width|height)="[^"]*"/g, "");
    return (rootTag + logoSvgRaw.slice(rootTagEnd)).replace(
        /currentColor/g,
        "#666666",
    );
})();

/**
 * Draw the OpenMarch branding footer (export date, logo + "Made with
 * OpenMarch", page numbers) at the bottom of the current PDFKit page.
 */
function drawPdfFooter(
    doc: InstanceType<typeof PDFDocument>,
    pageNumber: number,
    totalPages: number,
): void {
    const pageWidth = doc.page.width;
    const footerY = doc.page.height - 19;
    // Clear the bottom margin so drawing near the page edge doesn't trigger
    // an automatic page break
    const oldMargins = doc.page.margins;
    doc.page.margins = { ...oldMargins, bottom: 0 };

    doc.fillColor("#666666").fontSize(8).font("Helvetica");
    doc.text(`Exported ${new Date().toLocaleDateString()}`, 30, footerY, {
        lineBreak: false,
    });

    const logoHeight = 9;
    const logoWidth = logoHeight * (54 / 32);
    const gap = 4;
    const brandingX =
        (pageWidth - (logoWidth + gap + doc.widthOfString(FOOTER_BRANDING))) /
        2;
    try {
        SVGtoPDF(doc, footerLogoSvg, brandingX, footerY - 1, {
            width: logoWidth,
            height: logoHeight,
        });
    } catch {
        // Branding text alone if the logo fails to render
    }
    doc.text(FOOTER_BRANDING, brandingX + logoWidth + gap, footerY, {
        lineBreak: false,
    });

    const pageLabel = `Page ${pageNumber} of ${totalPages}`;
    doc.text(
        pageLabel,
        pageWidth - 30 - doc.widthOfString(pageLabel),
        footerY,
        {
            lineBreak: false,
        },
    );

    doc.page.margins = oldMargins;
}

export class PDFExportService {
    // Cache for the field image to avoid repeated DB queries during bulk exports
    private static fieldImageCache: string | null | undefined = undefined;

    /**
     * Clear the field image cache. Call this when starting a new export session
     * or when the field image might have changed.
     */
    public static clearFieldImageCache() {
        this.fieldImageCache = undefined;
    }

    private static generateSinglePDF(sheets: string[], quarterPages: boolean) {
        return printHtmlToPdf(
            buildSheetDocumentHtml(sheets, quarterPages),
            quarterPages
                ? { top: 0.75, bottom: 0.5, left: 0, right: 0 }
                : { top: 0.75, bottom: 0.5, left: 0.25, right: 0.25 },
        );
    }

    private static async generateSeparatePDFs(
        sheets: ExportSheet[],
        outputPath: string,
        quarterPages: boolean,
    ) {
        // Group sheets by section
        const sectionMap = new Map<string, ExportSheet[]>();
        sheets.forEach((sheet) => {
            const section = sheet.section || "Other";
            if (!sectionMap.has(section)) sectionMap.set(section, []);
            sectionMap.get(section)!.push(sheet);
        });

        const currentFileName = PDFExportService.getCurrentFilename();
        const date = new Date().toISOString().split("T")[0];

        if (quarterPages) {
            // One PDF per section, each page a 2x2 grid of quarter sheets
            await fs.promises.mkdir(outputPath, { recursive: true });

            for (const [section, sectionSheets] of sectionMap) {
                const pdfBuffer = await printHtmlToPdf(
                    buildSheetDocumentHtml(
                        sectionSheets.map((s) => s.renderedPage),
                        true,
                    ),
                    { top: 0.75, bottom: 0.5, left: 0, right: 0 },
                );
                const fileName = `${currentFileName}-${date}-${section}.pdf`;
                await fs.promises.writeFile(
                    path.join(outputPath, sanitize(fileName)),
                    new Uint8Array(pdfBuffer),
                );
            }
        } else {
            // One PDF per marcher, organized into section folders
            for (const [section, sectionSheets] of sectionMap) {
                const sectionDir = path.join(outputPath, sanitize(section));
                await fs.promises.mkdir(sectionDir, { recursive: true });

                for (const sheet of sectionSheets) {
                    const pdfBuffer = await printHtmlToPdf(
                        buildSheetDocumentHtml([sheet.renderedPage], false),
                        { top: 0.75, bottom: 0.5, left: 0.25, right: 0.25 },
                        15000,
                    );
                    const fileName = `${currentFileName}-${date}-${sheet.drillNumber}${sheet.name ? " - " + sheet.name : ""}`;
                    await fs.promises.writeFile(
                        path.join(sectionDir, `${sanitize(fileName)}.pdf`),
                        new Uint8Array(pdfBuffer),
                    );
                }
            }
        }
    }

    public static async export(
        sheets: ExportSheet[],
        organizeBySection: boolean,
        quarterPages: boolean,
    ) {
        // Clear the field image cache at the start of a new export session
        this.clearFieldImageCache();

        try {
            let result: Electron.SaveDialogReturnValue;
            if (organizeBySection) {
                result = await dialog.showSaveDialog({
                    title: "Select Export Location",
                    defaultPath: PDFExportService.getDefaultPath(),
                    properties: [
                        "createDirectory",
                        "showOverwriteConfirmation",
                    ],
                    buttonLabel: "Export Here",
                });

                if (result.canceled || !result.filePath) {
                    return { success: false, path: "", cancelled: true };
                }
                await PDFExportService.generateSeparatePDFs(
                    sheets,
                    result.filePath,
                    quarterPages,
                );
            } else {
                result = await dialog.showSaveDialog({
                    title: "Save PDF",
                    defaultPath: `${PDFExportService.getDefaultPath()}.pdf`,
                    filters: [{ name: "PDF", extensions: ["pdf"] }],
                    properties: ["showOverwriteConfirmation"],
                });

                if (result.canceled || !result.filePath) {
                    return { success: false, path: "", cancelled: true };
                }

                const pdfBuffer = await PDFExportService.generateSinglePDF(
                    sheets.map((s) => s.renderedPage),
                    quarterPages,
                );

                await fs.promises.writeFile(
                    result.filePath,
                    new Uint8Array(pdfBuffer),
                );
            }
            return { success: true, path: result.filePath };
        } catch (error) {
            return {
                success: false,
                path: "",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private static getDefaultPath(): string {
        const date = new Date().toISOString().split("T")[0];
        const win = BrowserWindow.getFocusedWindow();
        const currentFileName = win
            ? win.getTitle().replace(/\.[^/.]+$/, "")
            : "untitled";

        // Get the directory where the current .dots file is saved
        const currentFilePath = store.get("databasePath") as string;
        const baseDir = currentFilePath
            ? path.dirname(currentFilePath)
            : app.getPath("documents");

        return path.join(
            baseDir,
            `${currentFileName}-${date}-coordinate-sheets`,
        );
    }

    /**
     * Open the export directory in the file explorer
     * @param exportDir - The directory to open
     */
    public static async openExportDirectory(
        exportDir: string,
    ): Promise<string> {
        return await shell.openPath(exportDir);
    }

    /**
     * Create a directory for exporting files
     * @param defaultName - Default name for the export directory
     * @returns An object containing the export name and directory path
     */
    public static async createExportDirectory(
        defaultName: string,
    ): Promise<{ exportName: string; exportDir: string }> {
        // Clear the field image cache at the start of a new export session
        this.clearFieldImageCache();

        // Generate default path similar to coordinate sheets but with "charts"
        const date = new Date().toISOString().split("T")[0];
        const currentFileName = defaultName || "untitled";

        // Get the directory where the current .dots file is saved
        const currentFilePath = store.get("databasePath") as string;
        const baseDir = currentFilePath
            ? path.dirname(currentFilePath)
            : app.getPath("documents");

        const defaultPath = path.join(
            baseDir,
            `${currentFileName}-${date}-charts`,
        );

        // Prompt user for export location
        const result = await dialog.showSaveDialog({
            title: "Select Export Location",
            defaultPath: defaultPath,
            properties: ["createDirectory", "showOverwriteConfirmation"],
            buttonLabel: "Export Here",
        });

        // Error handling
        if (result.canceled) {
            throw new Error("Export cancelled");
        }
        if (!result.filePath) {
            throw new Error("No file path selected for export");
        }

        // Create export directory
        const exportDir = result.filePath;
        await fs.promises.mkdir(exportDir, { recursive: true });

        // Generate base file name
        const exportName = path.basename(
            path.basename(defaultName) === path.basename(result.filePath)
                ? defaultName
                : result.filePath,
        );

        return { exportName, exportDir };
    }

    /**
     * Helper function to get field image as base64 data URI from the database.
     * This is cached to avoid repeated DB queries during bulk exports.
     * The cache is cleared automatically when starting a new export session.
     */
    private static async getFieldImageDataUri(): Promise<string | null> {
        // Return cached value if available (undefined means not yet fetched, null means no image)
        if (this.fieldImageCache !== undefined) {
            return this.fieldImageCache;
        }

        try {
            // Access the database in the main process
            const db = getOrmConnection();
            const result = await db.query.field_properties.findFirst({
                columns: { image: true },
            });

            if (!result?.image) {
                this.fieldImageCache = null;
                return null;
            }

            // Convert Uint8Array to base64
            const base64 = Buffer.from(result.image).toString("base64");
            const mimeType = "image/png"; // Adjust if you detect the actual format
            const dataUri = `data:${mimeType};base64,${base64}`;

            // Cache the result
            this.fieldImageCache = dataUri;
            return dataUri;
        } catch (error) {
            console.error("Error fetching field image:", error);
            this.fieldImageCache = null;
            return null;
        }
    }

    /**
     * Generate a PDF for each marcher based on their SVG pages and coordinates
     * This will create a single PDF for each marcher with their respective pages.
     * @param svgPages
     * @param drillNumber
     * @param marcherCoordinates
     * @param pages
     * @param showName
     * @param exportDir
     * @param individualCharts
     */
    // eslint-disable-next-line max-lines-per-function
    public static async generateDocForMarcher(args: {
        svgPages: string[];
        drillNumber: string;
        marcherCoordinates: string[];
        pages: Page[];
        showName: string;
        exportDir: string;
        individualCharts: boolean;
        notesAppendixPages?: { pageName: string; notes: string }[];
    }) {
        const {
            svgPages,
            drillNumber,
            marcherCoordinates,
            pages,
            showName,
            exportDir,
            individualCharts,
            notesAppendixPages = [],
        } = args;
        // Debug: Confirm this is drill chart export
        console.debug(
            `🎺 DRILL CHART EXPORT - generateDocForMarcher called - ${drillNumber}`,
        );

        // Fetch the field image once from the database in the main process
        const fieldImageDataUri = await this.getFieldImageDataUri();

        // Replace the placeholder in all SVG pages with the actual image data
        const PLACEHOLDER = "OPENMARCH_FIELD_IMAGE_PLACEHOLDER";
        // The placeholder might be resolved to an absolute URL by the browser (e.g., http://localhost:5173/PLACEHOLDER)
        // so we need to match any URL that contains the placeholder
        const processedSvgPages = svgPages.map((svg) => {
            if (fieldImageDataUri && svg.includes(PLACEHOLDER)) {
                return svg.replace(PLACEHOLDER, fieldImageDataUri);
            }
            return svg;
        });
        // For each marcher, create a PDF of their pages
        const pdfFileName = `${showName}-${drillNumber}.pdf`;
        const pdfFilePath = path.join(exportDir, sanitize(pdfFileName));
        const doc = new PDFDocument({
            size: "LETTER",
            layout: "landscape",
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            bufferPages: true,
        });
        const stream = fs.createWriteStream(pdfFilePath);
        doc.pipe(stream);

        // Helper to draw bold header and value with proper wrapping and y advancement
        function drawLabelValue(
            doc: InstanceType<typeof PDFDocument>,
            label: string,
            value: string,
            x: number,
            y: number,
            width: number,
            fontSize: number = 11,
        ): number {
            doc.fontSize(fontSize).font("Helvetica-Bold");
            doc.text(label, x, y, {
                width: width,
                continued: true,
            });

            doc.font("Helvetica");
            doc.text(` ${value}`, {
                width: width,
                continued: false,
            });

            const afterY = doc.y;
            return afterY + 2;
        }

        const renderHtmlText = (
            doc: InstanceType<typeof PDFDocument>,
            html: string,
            x: number,
            y: number,
            width: number,
            baseFontSize: number = 10,
        ): number => {
            if (!html) return y;

            // Sanitize HTML using sanitize-html library to prevent XSS and CodeQL warnings
            // Allow only tags we explicitly handle for formatting
            let text = "";
            try {
                text = sanitizeHtml(html, {
                    allowedTags: [
                        "h1",
                        "h2",
                        "h3",
                        "h4",
                        "h5",
                        "h6",
                        "p",
                        "div",
                        "br",
                        "strong",
                        "b",
                        "em",
                        "i",
                        "ul",
                        "ol",
                        "li",
                    ],
                    allowedAttributes: {}, // No attributes allowed
                });
            } catch (error) {
                console.error("Error sanitizing HTML:", error);
            }

            // Decode HTML entities
            const entityMap: Record<string, string> = {
                "&amp;": "&",
                "&lt;": "<",
                "&gt;": ">",
                "&quot;": '"',
                "&#39;": "'",
                "&apos;": "'",
            };
            text = text.replace(
                /&(?:amp|lt|gt|quot|#39|apos);/g,
                (match) => entityMap[match] || match,
            );
            text = text.replace(/&#(\d{1,6});/g, (match, num) => {
                const code = parseInt(num, 10);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });
            text = text.replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex) => {
                const code = parseInt(hex, 16);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });

            text = text.replace(/<li[^>]*>/gi, "• ");
            text = text.replace(/<\/li>/gi, "\n");
            text = text.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
            text = text.replace(/<(p|div)[^>]*>/gi, "\n");

            let currentY = y;

            // Extract and replace headings with placeholders to preserve them during splitting
            const headingPlaceholders: Array<{
                placeholder: string;
                type: "h1" | "h2" | "h3";
                content: string;
            }> = [];
            let placeholderCounter = 0;

            text = text.replace(
                /<h1[^>]*>([\s\S]*?)<\/h1>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H1_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h1",
                        content: sanitizeHtml(content, {
                            allowedTags: [],
                            allowedAttributes: {},
                        }).trim(),
                    });
                    return placeholder;
                },
            );

            text = text.replace(
                /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H2_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h2",
                        content: sanitizeHtml(content, {
                            allowedTags: [],
                            allowedAttributes: {},
                        }).trim(),
                    });
                    return placeholder;
                },
            );

            text = text.replace(
                /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H3_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h3",
                        content: sanitizeHtml(content, {
                            allowedTags: [],
                            allowedAttributes: {},
                        }).trim(),
                    });
                    return placeholder;
                },
            );

            const blockSplitRegex = /(?:<br\s*\/?>|<\/(?:p|div)\s*>)/gi;
            const blocks = text.split(blockSplitRegex);

            if (
                blocks.length === 0 ||
                (blocks.length === 1 && !blocks[0].trim())
            ) {
                blocks.length = 0;
                blocks.push(text);
            }

            for (const block of blocks) {
                const trimmedBlock = block.trim();
                if (!trimmedBlock) {
                    currentY += baseFontSize * 0.5;
                    continue;
                }

                // Check for heading placeholders
                const h1Placeholder = trimmedBlock.match(/__HEADING_H1_\d+__/);
                const h2Placeholder = trimmedBlock.match(/__HEADING_H2_\d+__/);
                const h3Placeholder = trimmedBlock.match(/__HEADING_H3_\d+__/);

                if (h1Placeholder) {
                    const placeholder = h1Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.5).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                } else if (h2Placeholder) {
                    const placeholder = h2Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.3).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                } else if (h3Placeholder) {
                    const placeholder = h3Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.1).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                }

                // Remove heading placeholders from block before processing
                const blockWithoutPlaceholders = trimmedBlock
                    .replace(/__HEADING_H[1-3]_\d+__/g, "")
                    .trim();
                if (!blockWithoutPlaceholders) {
                    currentY += baseFontSize * 0.5;
                    continue;
                }

                const formatTagsRegex =
                    /<(strong|b|em|i)(?:\s[^>]*)?>|<\/(strong|b|em|i)>/gi;
                const parts: Array<{
                    text: string;
                    bold: boolean;
                    italic: boolean;
                }> = [];
                let inBold = false;
                let inItalic = false;
                let lastIndex = 0;
                let match;

                formatTagsRegex.lastIndex = 0;

                while (
                    (match = formatTagsRegex.exec(blockWithoutPlaceholders)) !==
                    null
                ) {
                    if (match.index > lastIndex) {
                        const textBefore = blockWithoutPlaceholders.substring(
                            lastIndex,
                            match.index,
                        );
                        const cleanText = sanitizeHtml(textBefore, {
                            allowedTags: [],
                            allowedAttributes: {},
                        }).trim();
                        if (cleanText) {
                            parts.push({
                                text: cleanText,
                                bold: inBold,
                                italic: inItalic,
                            });
                        }
                    }

                    const tag = match[1] || match[2];
                    if (tag === "strong" || tag === "b") {
                        inBold = !inBold;
                    } else if (tag === "em" || tag === "i") {
                        inItalic = !inItalic;
                    }

                    lastIndex = match.index + match[0].length;
                }

                if (lastIndex < blockWithoutPlaceholders.length) {
                    const textAfter =
                        blockWithoutPlaceholders.substring(lastIndex);
                    // Strip all HTML tags completely to prevent injection vulnerabilities
                    // We handle formatting separately via the regex parsing above
                    const cleanText = sanitizeHtml(textAfter, {
                        allowedTags: [],
                        allowedAttributes: {},
                    }).trim();
                    if (cleanText) {
                        parts.push({
                            text: cleanText,
                            bold: inBold,
                            italic: inItalic,
                        });
                    }
                }

                if (parts.length === 0) {
                    // Use sanitizeHtml to strip tags instead of regex
                    const plainText = sanitizeHtml(blockWithoutPlaceholders, {
                        allowedTags: [],
                        allowedAttributes: {},
                    }).trim();

                    if (plainText) {
                        doc.fontSize(baseFontSize).font("Helvetica");
                        doc.text(plainText, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.2;
                    }
                } else {
                    doc.fontSize(baseFontSize);
                    let isFirst = true;
                    let startX = x;

                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        if (!part.text) continue;

                        let font = "Helvetica";
                        if (part.bold && part.italic) {
                            font = "Helvetica-BoldOblique";
                        } else if (part.bold) {
                            font = "Helvetica-Bold";
                        } else if (part.italic) {
                            font = "Helvetica-Oblique";
                        }

                        doc.font(font);
                        doc.text(
                            part.text,
                            isFirst ? x : startX,
                            isFirst ? currentY : doc.y,
                            {
                                width,
                                continued: i < parts.length - 1,
                            },
                        );

                        if (isFirst) {
                            isFirst = false;
                            startX = doc.x;
                        }
                    }

                    currentY = doc.y + baseFontSize * 0.2;
                }
            }

            return currentY;
        };

        // Set up margins and top bar height
        const margin = 20;
        const topBarHeight = 34;

        // Loop through each SVG page and create a PDF page for it
        for (let i = 0; i < processedSvgPages.length; i++) {
            if (i > 0) doc.addPage();

            // Data for each page
            const page = pages?.[i];
            const setNumber = page?.name ?? "END";
            const counts = page?.counts != null ? String(page.counts) : "END";
            const measureNumbers = measureRangeString(page);
            const prevCoord = marcherCoordinates[i - 1] ?? "N/A";
            const currCoord = marcherCoordinates[i] ?? "N/A";
            const nextCoord = marcherCoordinates[i + 1] ?? "N/A";
            const notesHtml = page?.notes ?? "";
            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;

            // Top bar with drill number, show name, and set number
            doc.rect(margin, margin, pageWidth - 2 * margin, topBarHeight).fill(
                "#ddd",
            );
            const titleBarY = margin + topBarHeight / 2 - 6;

            doc.fillColor("black").fontSize(16).font("Helvetica-Bold");
            doc.fillColor("black").text(
                `${drillNumber}`,
                margin + 10,
                titleBarY,
                {
                    width: pageWidth * 0.15,
                    align: "left",
                },
            );
            doc.text(showName, pageWidth * 0.15, titleBarY, {
                width: pageWidth * 0.65,
                align: "center",
            });
            doc.text(`Set: ${setNumber}`, pageWidth * 0.8, titleBarY, {
                width: pageWidth * 0.2,
                align: "center",
            });

            // Field SVG
            const maxSVGHeight = 425;
            const maxSVGWidth = pageWidth - 2 * margin;
            try {
                SVGtoPDF(doc, processedSvgPages[i], margin, 65, {
                    height: maxSVGHeight,
                    width: maxSVGWidth,
                    preserveAspectRatio: "xMidYMid meet",
                });
            } catch (svgError) {
                doc.fillColor("red")
                    .fontSize(20)
                    .text(
                        `Error rendering SVG: ${svgError instanceof Error ? svgError.message : svgError}`,
                        margin * 2,
                        pageHeight / 2,
                        {
                            height: maxSVGHeight,
                            width: maxSVGWidth,
                            continued: true,
                        },
                    );
                doc.fillColor("black");
            }

            // Set, Counts, Measures, Coordinates, and Notes setup
            const bottomY = doc.page.height - 110;
            const columnPadding = 12;
            const marginSize = margin * 1.5;
            const contentWidth = pageWidth - marginSize * 2 - columnPadding * 2;

            // Variable column widths (18%, 56%, 26%)
            // If main sheet, no middle coordinates column
            const leftColWidth = contentWidth * 0.18;
            const midColWidth = individualCharts ? contentWidth * 0.56 : 0;
            const rightColWidth = individualCharts
                ? contentWidth * 0.26
                : contentWidth * 0.82;
            const leftX = marginSize;
            const midX = leftX + leftColWidth + columnPadding;
            const rightX = individualCharts
                ? midX + midColWidth + columnPadding
                : leftX + leftColWidth + columnPadding;

            // Initialize Y positions for each column
            let yLeft = bottomY;
            let yMid = bottomY;
            let yRight = bottomY;

            // Left column (Set, Counts, Measures)
            yLeft = drawLabelValue(
                doc,
                "Set:",
                setNumber,
                leftX,
                yLeft,
                leftColWidth,
            );
            yLeft = drawLabelValue(
                doc,
                "Counts:",
                counts,
                leftX,
                yLeft,
                leftColWidth,
            );
            yLeft = drawLabelValue(
                doc,
                "Measures:",
                measureNumbers,
                leftX,
                yLeft,
                leftColWidth,
            );

            // Middle column (Coordinates)
            if (individualCharts) {
                yMid = drawLabelValue(
                    doc,
                    "Previous Coordinate:",
                    prevCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
                yMid = drawLabelValue(
                    doc,
                    "Current Coordinate:",
                    currCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
                yMid = drawLabelValue(
                    doc,
                    "Next Coordinate:",
                    nextCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
            }

            // Right column (Notes)
            doc.fontSize(11).font("Helvetica-Bold");
            doc.text("Notes:", rightX, yRight, {
                width: rightColWidth,
            });
            const notesStartY = doc.y + 2;
            if (notesHtml) {
                yRight = renderHtmlText(
                    doc,
                    notesHtml,
                    rightX,
                    notesStartY,
                    rightColWidth,
                    10,
                );
            } else {
                yRight = notesStartY;
            }

            // Footers are drawn in a single pass over all buffered pages
            // after the content (charts + notes appendix) is complete
        }

        // Notes appendix pages
        const appendixEntries = (notesAppendixPages ?? [])
            .map((entry) => ({
                pageName: entry.pageName,
                notesHtml: entry.notes ?? "",
            }))
            .filter((entry) => entry.notesHtml.trim().length > 0);

        if (appendixEntries.length > 0) {
            const drawAppendixHeaderOnCurrentPage = () => {
                const pageWidth = doc.page.width;
                const pageHeight = doc.page.height;

                doc.rect(
                    margin,
                    margin,
                    pageWidth - 2 * margin,
                    topBarHeight,
                ).fill("#ddd");
                const titleBarY = margin + topBarHeight / 2 - 6;

                doc.fillColor("black").fontSize(16).font("Helvetica-Bold");
                doc.text(`${drillNumber}`, margin + 10, titleBarY, {
                    width: pageWidth * 0.2,
                    align: "left",
                });
                doc.text(showName, pageWidth * 0.2, titleBarY, {
                    width: pageWidth * 0.6,
                    align: "center",
                });
                doc.text("Notes", pageWidth * 0.8, titleBarY, {
                    width: pageWidth * 0.2,
                    align: "center",
                });

                return {
                    pageWidth,
                    pageHeight,
                    startY: margin + topBarHeight + 20,
                };
            };

            const renderAppendixHeader = () => {
                doc.addPage({
                    size: "LETTER",
                    layout: "portrait",
                    margins: {
                        top: margin + topBarHeight + 20,
                        bottom: 60,
                        left: 0,
                        right: 0,
                    },
                });
                return drawAppendixHeaderOnCurrentPage();
            };

            const writeNotesEntry = (entry: {
                pageName: string;
                notesHtml: string;
            }) => {
                if (!entry.notesHtml) return;

                const { pageWidth, startY } = renderAppendixHeader();
                const contentWidth = pageWidth - 2 * margin;

                // Capture the start page index (the page we just added)
                const rangeStart = doc.bufferedPageRange();
                const startPageIndex = rangeStart.start + rangeStart.count - 1;

                const title = `Set ${entry.pageName}`;
                doc.fillColor("black").fontSize(12).font("Helvetica-Bold");
                doc.text(title, margin, startY, {
                    width: contentWidth,
                });
                const notesStartY = doc.y + 4;

                renderHtmlText(
                    doc,
                    entry.notesHtml,
                    margin,
                    notesStartY,
                    contentWidth,
                    10,
                );

                const rangeEnd = doc.bufferedPageRange();
                const endPageIndex = rangeEnd.start + rangeEnd.count - 1;

                // Entries that flow onto extra pages need the header repeated
                for (
                    let pageIdx = startPageIndex + 1;
                    pageIdx <= endPageIndex;
                    pageIdx++
                ) {
                    doc.switchToPage(pageIdx);
                    drawAppendixHeaderOnCurrentPage();
                }
            };

            for (const entry of appendixEntries) {
                writeNotesEntry(entry);
            }
        }

        // Branding footer with page numbers on every page
        const pageRange = doc.bufferedPageRange();
        for (
            let i = pageRange.start;
            i < pageRange.start + pageRange.count;
            i++
        ) {
            doc.switchToPage(i);
            drawPdfFooter(doc, i - pageRange.start + 1, pageRange.count);
        }

        doc.end();
        await new Promise<void>((resolve, reject) => {
            stream.on("finish", resolve);
            stream.on("error", reject);
        });

        return { success: true };
    }

    /**
     * Get the current filename from the focused window
     */
    public static getCurrentFilename(): string {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return "untitled";
        return win
            .getTitle()
            .replace(/^OpenMarch - /, "")
            .replace(/\.[^/.]+$/, "");
    }
}
