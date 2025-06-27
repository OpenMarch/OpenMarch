import { dialog, BrowserWindow, app } from "electron";
import * as path from "path";
import * as fs from "fs";
import sanitize from "sanitize-filename";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit doesn't have types
import SVGtoPDF from "svg-to-pdfkit";

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
                    (pageContent) => `
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
                                  marginType: "default", // or set custom values (e.g. top: 36, bottom: 36, etc.)
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
