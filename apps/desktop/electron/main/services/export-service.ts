import { dialog, BrowserWindow, app } from "electron";
import * as path from "path";
import * as fs from "fs";
import sanitize from "sanitize-filename";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit doesn't have types
import SVGtoPDF from "svg-to-pdfkit";
import Page from "@/global/classes/Page";

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
            const win = new BrowserWindow({
                width: 1200,
                height: 800,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                },
            });

            // Create HTML for each group of four pages
            const combinedHtml = pages
                .map(
                    (pageContent) =>
                        `
                            <div class="page-content">${pageContent}</div>
                        `,
                )
                .join("");

            const htmlContent = `
                    <html>
                      <body>${combinedHtml}</body>
                    </html>
                `;

            win.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
            );

            win.webContents.on("did-finish-load", () => {
                win.webContents
                    .printToPDF({
                        margins: quarterPages
                            ? {
                                  marginType: "custom",
                                  top: 0,
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                              }
                            : {
                                  marginType: "default",
                              },
                        pageSize: "Letter",
                        printBackground: true,
                        headerTemplate: headerHtml({
                            showName: this.getCurrentFileName(),
                        }),
                        footerTemplate: footerHtml,
                        displayHeaderFooter: true,
                    })
                    .then((data) => {
                        win.close();
                        resolve(data);
                    })
                    .catch((error) => {
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
                await new Promise<void>((resolve) => {
                    const win = new BrowserWindow({
                        width: 1200,
                        height: 800,
                        show: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                    });

                    win.loadURL(
                        `data:text/html;charset=utf-8,${encodeURIComponent(sheet.renderedPage)}`,
                    );

                    win.webContents.on("did-finish-load", () => {
                        const filePath = path.join(
                            sectionDir,
                            `${sanitize(sheet.drillNumber + " - " + sheet.name)}.pdf`,
                        );

                        win.webContents
                            .printToPDF({
                                margins: {
                                    marginType: "default",
                                },
                                pageSize: "Letter",
                                printBackground: true,
                                headerTemplate: headerHtml({
                                    showName: this.getCurrentFileName(),
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
                                win.close();
                                resolve();
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
            if (organizeBySection) {
                const result = await dialog.showSaveDialog({
                    title: "Select Export Location",
                    defaultPath: this.getDefaultPath(),
                    properties: [
                        "createDirectory",
                        "showOverwriteConfirmation",
                    ],
                    buttonLabel: "Export Here",
                });

                if (result.canceled || !result.filePath) {
                    throw new Error("Export cancelled");
                }
                await this.generateSeparatePDFs(sheets, result.filePath);
            } else {
                const pdfBuffer = await this.generateSinglePDF(
                    sheets.map((s) => s.renderedPage),
                    quarterPages,
                );

                const result = await dialog.showSaveDialog({
                    title: "Save PDF",
                    defaultPath: `${this.getDefaultPath()}.pdf`,
                    filters: [{ name: "PDF", extensions: ["pdf"] }],
                    properties: ["showOverwriteConfirmation"],
                });

                if (!result.canceled && result.filePath) {
                    await fs.promises.writeFile(
                        result.filePath,
                        new Uint8Array(pdfBuffer),
                    );
                }
            }
            return { success: true };
        } catch (error) {
            return {
                success: false,
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
        return path.join(
            app.getPath("documents"),
            `${currentFileName}-${date}-coordinate-sheets`,
        );
    }

    /**
     * Create a directory for exporting files
     * @param defaultName - Default name for the export directory
     * @returns An object containing the export name and directory path
     */
    public static async createExportDirectory(
        defaultName: string,
    ): Promise<{ exportName: string; exportDir: string }> {
        // Prompt user for export location
        const result = await dialog.showSaveDialog({
            title: "Select Export Location",
            defaultPath: path.join(
                app.getPath("downloads"),
                defaultName || "Untitled",
            ),
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
