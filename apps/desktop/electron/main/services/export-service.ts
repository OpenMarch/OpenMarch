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

    public static async exportSvgPagesToPdf(
        svgPages: string[],
        options: { fileName?: string } = {},
    ) {
        try {
            const { fileName = "drill-charts.pdf" } = options;

            // Show save dialog
            const result = await dialog.showSaveDialog({
                title: "Save Drill Charts PDF",
                defaultPath: path.join(app.getPath("documents"), fileName),
                filters: [{ name: "PDF", extensions: ["pdf"] }],
                properties: ["showOverwriteConfirmation"],
            });

            if (result.canceled || !result.filePath) {
                throw new Error("Export cancelled");
            }

            // Create PDF document in landscape mode
            const doc = new PDFDocument({
                size: "LETTER",
                layout: "landscape",
                margins: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                },
            });

            // Create write stream
            const stream = fs.createWriteStream(result.filePath);
            doc.pipe(stream);

            // Process each SVG page
            for (let i = 0; i < svgPages.length; i++) {
                if (i > 0) {
                    doc.addPage();
                }

                try {
                    // Convert SVG to PDF using svg-to-pdfkit with better scaling
                    SVGtoPDF(doc, svgPages[i], 40, 40, {
                        width: doc.page.width - 80,
                        height: doc.page.height - 80,
                        preserveAspectRatio: "xMidYMid meet",
                    });
                } catch (svgError: unknown) {
                    console.warn(
                        `Error processing SVG page ${i + 1}:`,
                        svgError,
                    );
                    // Continue with other pages even if one fails
                    doc.fontSize(12).text(
                        `Error rendering page ${i + 1}: ${svgError instanceof Error ? svgError.message : "Unknown error"}`,
                        50,
                        50,
                    );
                }
            }

            // Finalize the PDF
            doc.end();

            // Wait for the stream to finish
            await new Promise<void>((resolve, reject) => {
                stream.on("finish", resolve);
                stream.on("error", reject);
            });

            return { success: true, filePath: result.filePath };
        } catch (error) {
            console.error("PDF export error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    public static async generateSeparateSVGPages(
        svgPages: string[][],
        drillNumbers: string[],
        marcherCoordinates: string[][],
        pages: Page[],
        showPath: string,
    ) {
        // Prompt user for export location
        const result = await dialog.showSaveDialog({
            title: "Select Export Location",
            defaultPath: path.join(
                app.getPath("downloads"),
                showPath || "drill-charts-export",
            ),
            properties: ["createDirectory", "showOverwriteConfirmation"],
            buttonLabel: "Export Here",
        });
        if (result.canceled || !result.filePath) {
            throw new Error("Export cancelled");
        }

        // Create export directory
        const exportDir = result.filePath;
        await fs.promises.mkdir(exportDir, { recursive: true });

        // Generate base file name
        const showName = path.basename(
            path.basename(showPath) === path.basename(result.filePath)
                ? showPath
                : result.filePath,
        );
        const filePaths: string[] = [];

        // Loop through each marcher's SVG pages
        for (let marcher = 0; marcher < svgPages.length; marcher++) {
            const pdfFileName = `${showName}-${drillNumbers[marcher]}.pdf`;
            const pdfFilePath = `${exportDir}/${sanitize(pdfFileName)}`;
            let htmlPages: string[] = [];

            for (let i = 0; i < svgPages[marcher].length; i++) {
                // Generate HTML
                const page = pages?.[i];

                htmlPages.push(
                    PDFExportService.generateDrillHtml({
                        drillNumber: drillNumbers[marcher],
                        showTitle: showName,
                        setNumber: page?.name ?? "END",
                        counts:
                            page?.counts != null ? String(page.counts) : "END",
                        measureNumbers:
                            page?.measures && page.measures.length > 0
                                ? page.measures.length === 1
                                    ? String(page.measures[0].number)
                                    : `${page.measures[0].number}-${page.measures[page.measures.length - 1].number}`
                                : i === 0
                                  ? "START"
                                  : "END",
                        prevCoord: marcherCoordinates[marcher][i - 1] ?? "N/A",
                        currCoord: marcherCoordinates[marcher][i] ?? "N/A",
                        nextCoord: marcherCoordinates[marcher][i + 1] ?? "N/A",
                        notes: page?.notes ?? "",
                        svg: svgPages[marcher][i],
                    }),
                );
            }

            // Create a hidden BrowserWindow for PDF
            const win = new BrowserWindow({
                width: 1400,
                height: 900,
                show: false,
                webPreferences: {
                    offscreen: true,
                },
            });

            win.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(htmlPages.join(""))}`,
            );
            await new Promise((resolve) =>
                win.webContents.once("did-finish-load", resolve),
            );

            // Print to PDF
            const pdfData = await win.webContents.printToPDF({
                pageSize: "Letter",
                landscape: true,
                printBackground: true,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
            });

            fs.writeFileSync(pdfFilePath, pdfData);
            filePaths.push(pdfFilePath);
            win.destroy();
        }

        return { success: true, filePaths };
    }

    private static generateDrillHtml({
        drillNumber,
        showTitle,
        setNumber,
        counts,
        measureNumbers,
        prevCoord,
        currCoord,
        nextCoord,
        notes,
        svg,
    }: {
        drillNumber: string;
        showTitle: string;
        setNumber: string;
        counts: string;
        measureNumbers: string;
        prevCoord: string;
        currCoord: string;
        nextCoord: string;
        notes: string;
        svg: string;
    }): string {
        return `
            <html>
                <head>
                    <style>
                        body { margin: 0; font-family: Arial, sans-serif; }
                        .page-content {
                            margin: 32px;
                        }
                        .top-table {
                            display: table;
                            width: 100%;
                            table-layout: fixed;
                            margin-top: 0;
                            margin-bottom: 16px;
                            overflow: hidden;
                        }
                        .top-row { display: table-row; }
                        .top-cell {
                            display: table-cell;
                            background: #ddd;
                            padding: 12px;
                            border-right: 1px dotted #888;
                            text-align: center;
                            font-size: 18px;
                        }
                        .top-cell:first-child{
                            width: 10%;
                        }
                        .top-cell:last-child {
                            width: 20%;
                        }
                        .top-cell:nth-child(2) {
                            width: 70%;
                        }
                        .top-cell:last-child { border-right: none; }
                        .svg-container {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            margin: 0 0 16px 0;
                        }
                        .svg-container svg {
                            max-width: 100%;
                            max-height: 1000px;
                            height: auto;
                            width: auto;
                            display: block;
                        }
                        .bottom-table {
                            width: 100%;
                            margin-top: 16px;
                            display: table;
                            table-layout: fixed;
                        }
                        .bottom-row { display: table-row; }
                        .bottom-cell {
                            display: table-cell;
                            vertical-align: top;
                            padding: 8px 12px;
                            font-size: 13px;
                        }
                        .bottom-cell:first-child{
                            width: 18%;
                        }
                        .bottom-cell:last-child {
                            width: 26%;
                        }
                        .bottom-cell:nth-child(2) {
                            width: 56%;
                        }
                        .notes {
                            white-space: pre-line;
                            font-size: 13px;
                        }
                    </style>
                </head>
                <body style="font-family: Arial, sans-serif">
                    <div class="page-content">
                        <div class="top-table">
                            <div class="top-row" style="font-weight: bold">                 
                                <div class="top-cell">${drillNumber}</div>
                                <div class="top-cell">${showTitle}</div>
                                <div class="top-cell">Set: ${setNumber}</div>
                            </div>
                        </div>
                        <div class="svg-container">
                            ${svg}
                        </div>
                        <div class="bottom-table">
                            <div class="bottom-row">
                                <div class="bottom-cell">
                                    <b>Set:</b> ${setNumber}<br>
                                    <b>Counts:</b> ${counts}<br>
                                    <b>Measures:</b> ${measureNumbers}
                                </div>
                                <div class="bottom-cell">
                                    <b>Previous Coordinate:</b> ${prevCoord}<br>
                                    <b>Current Coordinate:</b> ${currCoord}<br>
                                    <b>Next Coordinate:</b> ${nextCoord}
                                </div>
                                <div class="bottom-cell">
                                    <b>Notes:</b> <br>${notes}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="page-break-after: always"></div>
                </body>
            </html>
        `;
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
