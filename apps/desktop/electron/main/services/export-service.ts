import { dialog, BrowserWindow, app, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import sanitize from "sanitize-filename";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit doesn't have types
import SVGtoPDF from "svg-to-pdfkit";
import Page from "@/global/classes/Page";
import Store from "electron-store";

const store = new Store();

interface ExportSheet {
    name: string;
    drillNumber: string;
    section: string;
    renderedPage: string;
}

const headerHtml = ({ showName }: { showName: string }) =>
    `<div style="
        padding: 12px 24px;
        font-family: Arial, sans-serif;
        display: flex;
        align-items: center;
        justify-content: space-between;
    ">
    </div>`;

const footerHtml = `
<div style="
    padding: 8px 24px;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #999;
">
    Exported ${new Date().toLocaleDateString()}
</div>
`;

export class PDFExportService {
    private static async generateSinglePDF(
        pages: string[],
        quarterPages: boolean,
    ) {
        return new Promise<Buffer>((resolve, reject) => {
            console.log("generateSinglePDF called with:", {
                pageCount: pages.length,
                quarterPages,
                firstPageLength: pages[0]?.length || 0,
            });

            const win = new BrowserWindow({
                width: 1200,
                height: 800,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                },
            });

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                console.error("PDF generation timed out after 30 seconds");
                win.close();
                reject(new Error("PDF generation timed out after 30 seconds"));
            }, 30000);

            // Handle window errors
            win.webContents.on(
                "did-fail-load",
                (event, errorCode, errorDescription) => {
                    console.error("Failed to load content:", {
                        errorCode,
                        errorDescription,
                    });
                    clearTimeout(timeout);
                    win.close();
                    reject(
                        new Error(
                            `Failed to load content: ${errorDescription} (${errorCode})`,
                        ),
                    );
                },
            );

            win.on("closed", () => {
                clearTimeout(timeout);
            });

            // Create HTML for each marcher's coordinate sheet with proper page breaks
            // Extract the header from the first page to repeat it on all pages
            let extractedHeaderHtml = "";
            let modifiedPages = pages;

            if (pages.length > 0) {
                const firstPageContent = pages[0];
                const headerMatch = firstPageContent.match(
                    /<div[^>]*class="sheetHeader"[^>]*>.*?<\/div>/s,
                );
                if (headerMatch) {
                    extractedHeaderHtml = headerMatch[0];
                    // Remove header from all pages since we'll add it separately
                    modifiedPages = pages.map((page) =>
                        page.replace(
                            /<div[^>]*class="sheetHeader"[^>]*>.*?<\/div>/s,
                            "",
                        ),
                    );
                }
            }

            const combinedHtml = modifiedPages
                .map(
                    (pageContent, index) =>
                        `
                            <div class="marcher-sheet${index === 0 ? " first-sheet" : ""}">
                                ${extractedHeaderHtml}
                                ${pageContent}
                            </div>
                        `,
                )
                .join("");

            const htmlContent = `
                    <html>
                      <head>
                        <style>
                          @media print {
                            .marcher-sheet {
                              page-break-before: always;
                              page-break-after: always;
                              page-break-inside: avoid;
                              min-height: 100vh;
                              box-sizing: border-box;
                              padding: 1rem;
                              margin: 0;
                            }
                            
                            .marcher-sheet.first-sheet {
                              page-break-before: auto;
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
                            
                            /* Add some spacing between coordinate rows */
                            tbody tr {
                              page-break-inside: avoid;
                            }
                            
                            /* For quarter pages, use different layout */
                            ${
                                quarterPages
                                    ? `
                              .marcher-sheet {
                                page-break-before: auto;
                                page-break-after: auto;
                                min-height: auto;
                                padding: 0.5rem;
                              }
                            `
                                    : ""
                            }
                          }
                          
                          @page {
                            margin: ${quarterPages ? "0.5in" : "1in"};
                          }
                          
                          body {
                            margin: 0;
                            padding: 0;
                            font-family: Arial, sans-serif;
                          }
                        </style>
                      </head>
                      <body>${combinedHtml}</body>
                    </html>
                `;

            console.log("HTML content length:", htmlContent.length);
            console.log("Combined HTML length:", combinedHtml.length);
            console.log(
                "First 500 chars of HTML:",
                htmlContent.substring(0, 500),
            );

            // Instead of using data URL, write to a temporary file
            const tempDir = path.join(app.getPath("temp"), "openmarch-export");
            const tempFilePath = path.join(
                tempDir,
                `export-${Date.now()}.html`,
            );

            // Use async IIFE to handle the file operations
            (async () => {
                try {
                    // Ensure temp directory exists
                    await fs.promises.mkdir(tempDir, { recursive: true });

                    // Write HTML to temporary file
                    await fs.promises.writeFile(
                        tempFilePath,
                        htmlContent,
                        "utf8",
                    );
                    console.log("Wrote HTML to temp file:", tempFilePath);

                    // Load from file URL instead of data URL
                    win.loadFile(tempFilePath);

                    // Clean up temp file after window closes
                    win.on("closed", async () => {
                        try {
                            await fs.promises.unlink(tempFilePath);
                            console.log("Cleaned up temp file:", tempFilePath);
                        } catch (cleanupError) {
                            console.warn(
                                "Failed to clean up temp file:",
                                cleanupError,
                            );
                        }
                    });
                } catch (fileError) {
                    console.error("Error creating temp file:", fileError);
                    reject(
                        new Error(
                            `Failed to create temp file: ${fileError instanceof Error ? fileError.message : fileError}`,
                        ),
                    );
                    return;
                }
            })();

            win.webContents.on("did-finish-load", () => {
                win.webContents
                    .printToPDF({
                        margins: quarterPages
                            ? {
                                  marginType: "custom",
                                  top: 0.5,
                                  bottom: 0.5,
                                  left: 0.5,
                                  right: 0.5,
                              }
                            : {
                                  marginType: "custom",
                                  top: 1,
                                  bottom: 1,
                                  left: 1,
                                  right: 1,
                              },
                        pageSize: "Letter",
                        printBackground: true,
                        headerTemplate: headerHtml({
                            showName: PDFExportService.getCurrentFileName(),
                        }),
                        footerTemplate: footerHtml,
                        displayHeaderFooter: true,
                    })
                    .then((data) => {
                        clearTimeout(timeout);
                        win.close();
                        resolve(data);
                    })
                    .catch((error) => {
                        clearTimeout(timeout);
                        win.close();
                        reject(error);
                    });
            });
        });
    }

    private static async generateSeparatePDFs(
        sheets: ExportSheet[],
        outputPath: string,
    ) {
        const sectionMap = new Map<string, ExportSheet[]>();

        sheets.forEach((sheet) => {
            const section = sheet.section || "Other";
            if (!sectionMap.has(section)) {
                sectionMap.set(section, []);
            }
            sectionMap.get(section)!.push(sheet);
        });

        for (const [section, sectionSheets] of sectionMap) {
            const sectionDir = path.join(outputPath, sanitize(section));
            await fs.promises.mkdir(sectionDir, { recursive: true });

            for (const sheet of sectionSheets) {
                await new Promise<void>((resolve, reject) => {
                    const win = new BrowserWindow({
                        width: 1200,
                        height: 800,
                        show: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                    });

                    // Add timeout for individual sheet generation
                    const timeout = setTimeout(() => {
                        win.close();
                        reject(
                            new Error("Individual PDF generation timed out"),
                        );
                    }, 15000);

                    win.webContents.on(
                        "did-fail-load",
                        (event, errorCode, errorDescription) => {
                            clearTimeout(timeout);
                            win.close();
                            reject(
                                new Error(
                                    `Failed to load sheet content: ${errorDescription} (${errorCode})`,
                                ),
                            );
                        },
                    );

                    win.on("closed", () => {
                        clearTimeout(timeout);
                    });

                    win.loadURL(
                        `data:text/html;charset=utf-8,${encodeURIComponent(sheet.renderedPage)}`,
                    );

                    win.webContents.on("did-finish-load", () => {
                        // Get current filename and date for better file naming
                        const currentFileName =
                            PDFExportService.getCurrentFileName();
                        const date = new Date().toISOString().split("T")[0];
                        const fileName = `${currentFileName}-${date}-${sheet.drillNumber}${sheet.name ? " - " + sheet.name : ""}`;

                        const filePath = path.join(
                            sectionDir,
                            `${sanitize(fileName)}.pdf`,
                        );

                        win.webContents
                            .printToPDF({
                                margins: {
                                    marginType: "default",
                                },
                                pageSize: "Letter",
                                printBackground: true,
                                headerTemplate: headerHtml({
                                    showName:
                                        PDFExportService.getCurrentFileName(),
                                }),
                                footerTemplate: footerHtml,
                                displayHeaderFooter: true,
                            })
                            .then(async (data) => {
                                const blob = new Blob([data], {
                                    type: "application/pdf",
                                });
                                const arrayBuffer = await blob.arrayBuffer();
                                await fs.promises.writeFile(
                                    filePath,
                                    new Uint8Array(arrayBuffer),
                                );
                                clearTimeout(timeout);
                                win.close();
                                resolve();
                            })
                            .catch((error) => {
                                clearTimeout(timeout);
                                win.close();
                                reject(error);
                            });
                    });
                });
            }
        }
    }

    public static async export(
        sheets: ExportSheet[],
        organizeBySection: boolean,
        quarterPages: boolean,
    ) {
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
                );
            } else {
                const pdfBuffer = await PDFExportService.generateSinglePDF(
                    sheets.map((s) => s.renderedPage),
                    quarterPages,
                );

                result = await dialog.showSaveDialog({
                    title: "Save PDF",
                    defaultPath: `${PDFExportService.getDefaultPath()}.pdf`,
                    filters: [{ name: "PDF", extensions: ["pdf"] }],
                    properties: ["showOverwriteConfirmation"],
                });

                if (result.canceled || !result.filePath) {
                    return { success: false, path: "", cancelled: true };
                }

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

    private static getCurrentFileName(): string {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return "untitled";
        return path.basename(win.getTitle());
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
    public static async generateDocForMarcher(
        svgPages: string[],
        drillNumber: string,
        marcherCoordinates: string[],
        pages: Page[],
        showName: string,
        exportDir: string,
        individualCharts: boolean,
    ) {
        // For each marcher, create a PDF of their pages
        const pdfFileName = `${showName}-${drillNumber}.pdf`;
        const pdfFilePath = path.join(exportDir, sanitize(pdfFileName));
        const doc = new PDFDocument({
            size: "LETTER",
            layout: "landscape",
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        const stream = fs.createWriteStream(pdfFilePath);
        doc.pipe(stream);

        // Helper to draw bold header and value with proper wrapping and y advancement
        function drawLabelValue(
            doc: PDFKit.PDFDocument,
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

        // Set up margins and top bar height
        const margin = 20;
        const topBarHeight = 34;

        // Loop through each SVG page and create a PDF page for it
        for (let i = 0; i < svgPages.length; i++) {
            if (i > 0) doc.addPage();

            // Data for each page
            const page = pages?.[i];
            const setNumber = page?.name ?? "END";
            const counts = page?.counts != null ? String(page.counts) : "END";
            const measureNumbers =
                page?.measures && page.measures.length > 0
                    ? page.measures.length === 1
                        ? String(page.measures[0].number)
                        : `${page.measures[0].number}-${page.measures[page.measures.length - 1].number}`
                    : i === 0
                      ? "START"
                      : "END";
            const prevCoord = marcherCoordinates[i - 1] ?? "N/A";
            const currCoord = marcherCoordinates[i] ?? "N/A";
            const nextCoord = marcherCoordinates[i + 1] ?? "N/A";
            const notes = page?.notes ?? "";
            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;

            // Top bar, drill number, show name, and set number
            doc.rect(margin, margin, pageWidth - 2 * margin, topBarHeight).fill(
                "#ddd",
            );
            const titleBarY = margin + topBarHeight / 2 - 6;

            doc.fillColor("black").fontSize(16).font("Helvetica-Bold");
            doc.fillColor("black").text(`${drillNumber}`, margin, titleBarY, {
                width: pageWidth * 0.15,
                align: "center",
            });
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
                SVGtoPDF(doc, svgPages[i], margin, 65, {
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
            yMid = drawLabelValue(
                doc,
                "Notes:",
                notes,
                rightX,
                yRight,
                rightColWidth,
            );
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
