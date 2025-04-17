import { dialog, BrowserWindow, app, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import sanitize from "sanitize-filename";

let instance: PDFExportService;

interface ExportSheet {
    name: string;
    drillNumber: string;
    section: string;
    renderedPage: string;
}

const headerHtml = ({ showName }: { showName: string }) =>
    `<div
        style="
            color: #444444;
            font-size: 12px;
        ">
        <span style="position: absolute; left: 1cm">
            ${showName}
        </span>
        <span style="position: absolute; right: 1cm">
            Created at ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
    </div>`;
const footerHtml = `
<div
    style="
        color: #444444;
        font-size: 12px;
        width: 100vw,
    ">
    <span style="position: absolute; left: 1cm; bottom: 0.4cm">
        <i>
            Made with OpenMarch, the free drill-writing
            app
        </i>
    </span>
    <svg
        height="0.8cm"
        id="Layer_1"
        data-name="Layer 1"
        xmlns="http://www.w3.org/2000/svg"
        viewbox="0 0 637.62 325.38"
        fill="#444444"
        style="position: absolute; right: 1cm; bottom: 0.2cm"
        >
        <path d="M188.86,119c-.35,1.14-.73,2.25-1.17,3.34a42.66,42.66,0,0,1-8.17,13,45.71,45.71,0,0,1-3.67,3.56,37.63,37.63,0,0,1-3.32,14.1,25.07,25.07,0,0,1-9.69,11,30.16,30.16,0,0,1-29.42,0,25.44,25.44,0,0,1-9.75-11,36.7,36.7,0,0,1-3.38-14.1,42.8,42.8,0,0,1-11.84-16.59c-.43-1.07-.81-2.16-1.14-3.26a52.7,52.7,0,0,0-2.57,16.85q0,13.59,5.54,23.84a40.22,40.22,0,0,0,15.27,16A43.47,43.47,0,0,0,148,181.48a44.32,44.32,0,0,0,22.77-5.73,39.33,39.33,0,0,0,15.23-16q5.38-10.26,5.39-23.84A54,54,0,0,0,188.86,119Z" />
        <path d="M189.83,107.22a42,42,0,0,1-2.13,7.16,42.66,42.66,0,0,1-79.25,0,41.83,41.83,0,0,1-2.14-7.18,1.06,1.06,0,0,1,1-1.26H188.8A1.06,1.06,0,0,1,189.83,107.22Z" />
        <path d="M190.06,61.26V99.4a2,2,0,0,1-2,2H108a2,2,0,0,1-2-2V61.11a3.94,3.94,0,0,1,.75-2.29c2.77-3.83,13.7-16.1,40.13-16.1s38.84,12.12,42.18,16A3.82,3.82,0,0,1,190.06,61.26Z" />
        <path d="M173.84,193.13,148.16,215.8l-26.29-22.67H105.32v88.38h14l.24-65.69,23.13,15.51h10.95l23.13-15.63-.24,65.81h14V193.13Z" />
        <polygon points="128.01 239.75 165.75 239.75 165.92 244.9 127.84 244.9 128.01 239.75" />
        <polygon points="130.17 254.8 163.99 254.8 164.14 259.95 130.02 259.95 130.17 254.8" />
        <polygon points="133.54 269.86 162.78 269.86 162.91 275.01 133.4 275.01 133.54 269.86" />
        <path d="M132.35,245.23a2.7,2.7,0,1,1-5.38,0,2.92,2.92,0,0,1,0-5.82,2.7,2.7,0,1,1,2.69,2.91A2.81,2.81,0,0,1,132.35,245.23Z" />
        <path d="M133.4,260.29a2.69,2.69,0,1,1-5.37,0,2.92,2.92,0,0,1,0-5.82,2.69,2.69,0,1,1,2.69,2.9A2.81,2.81,0,0,1,133.4,260.29Z" />
        <path d="M137,275.35a2.7,2.7,0,1,1-5.38,0,2.92,2.92,0,0,1,0-5.83,2.7,2.7,0,1,1,2.69,2.91A2.81,2.81,0,0,1,137,275.35Z" />
        <path d="M163.48,245.23a2.69,2.69,0,1,0,5.37,0,2.92,2.92,0,0,0,0-5.82,2.69,2.69,0,1,0-2.68,2.91A2.81,2.81,0,0,0,163.48,245.23Z" />
        <path d="M161.89,260.29a2.69,2.69,0,1,0,5.37,0,2.92,2.92,0,0,0,0-5.82,2.69,2.69,0,1,0-2.69,2.9A2.81,2.81,0,0,0,161.89,260.29Z" />
        <path d="M158.3,275.35a2.69,2.69,0,1,0,5.37,0,2.92,2.92,0,0,0,0-5.83,2.69,2.69,0,1,0-2.68,2.91A2.81,2.81,0,0,0,158.3,275.35Z" />
        <path d="M209.57,179.81v-86h31q10.32,0,17.07,3.5a23.67,23.67,0,0,1,10.08,9.4,28.76,28.76,0,0,1,.12,26.6,23.49,23.49,0,0,1-9.95,9.59q-6.77,3.62-17.32,3.62H224.32v33.3Zm14.75-45.34h15.36q8.72,0,12.53-3.87T256,120.22q0-6.77-3.81-10.57t-12.53-3.81H224.32Z" />
        <path d="M283.79,179.81v-86h55.53v11.92H298.53v24.7h37.11v11.67H298.53v25.8h40.79v11.92Z" />
        <path d="M354.8,179.81v-86h14.75L411,156V93.8H425.7v86H411l-41.41-62v62.05Z" />
        <path d="M206.31,281.19l31.48-86.07h16.48l31.47,86.07H270.13l-24.22-68.86-24.23,68.86Zm14-20.29,3.93-11.68h42.43l3.93,11.68Z" />
        <path d="M297.55,281.19V195.12h30.86q10.2,0,16.91,3.5a23.46,23.46,0,0,1,9.95,9.35,27.81,27.81,0,0,1,.07,26,23.33,23.33,0,0,1-10,9.47Q338.62,247,328,247H312.3v34.18Zm14.75-45.13h15.13q8.24,0,12.11-4a14.49,14.49,0,0,0,3.87-10.52,14,14,0,0,0-3.81-10.26q-3.81-3.89-12.17-3.88H312.3Zm30.13,45.13-18.08-38h16l18.93,38Z" />
        <path d="M412,282.66q-12.79,0-22.07-5.59a37.08,37.08,0,0,1-14.27-15.62,51.54,51.54,0,0,1-5-23.17q0-13.29,5-23.31A37.51,37.51,0,0,1,390,199.3q9.29-5.66,22.07-5.66,15.36,0,25.08,7.56t12.3,21.34H433.17a20,20,0,0,0-7-11.44q-5.3-4.17-14.26-4.18a25.28,25.28,0,0,0-14,3.75,24.07,24.07,0,0,0-9,10.82,41.21,41.21,0,0,0-3.13,16.79A40.31,40.31,0,0,0,389,254.94a24.14,24.14,0,0,0,9,10.69,25.28,25.28,0,0,0,14,3.75q9,0,14.26-3.87a18.4,18.4,0,0,0,7-10.76H449.4q-2.46,13-12.24,20.47T412,282.66Z" />
        <path d="M463.78,281.19V195.12h14.76v86.07Zm12.54-37.87v-12H521v12Zm41.81,37.87V195.12h14.75v86.07Z" />
    </svg>
</div>
`;

export class PDFExportService {
    static getService() {
        if (instance === undefined) {
            instance = new PDFExportService();
        }

        return instance;
    }

    private static async generateSinglePDF(pages: string[]) {
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
                    <div style="page-break-after: always">
                        <div class="page-content">${pageContent}</div>
                    </div>
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

    constructor() {
        ipcMain.handle("export:pdf", async (_, params) => {
            return await PDFExportService.export(
                params.sheets,
                params.organizeBySection,
            );
        });
    }
}

export const exportService = PDFExportService.getService();
