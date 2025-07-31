import { parentPort } from "worker_threads";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../database/migrations/schema";
import path from "path";
import PDFDocument from "pdfkit";
import fs from "fs";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { Marcher } from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";
import { FieldProperties } from "@openmarch/core";

// =================================================================================================
// PDF Layout Functions
// =================================================================================================

function drawFullPageSheet(
    doc: PDFKit.PDFDocument,
    marcher: Marcher,
    pages: Page[],
    marcherPages: MarcherPage[],
    fieldProperties: FieldProperties,
    options: any,
) {
    // A4 size: 595.28 x 841.89 points
    const { width, height } = doc.page;
    const margin = 50;

    // Header
    doc.fontSize(18).text(
        `${marcher.name} (${marcher.section})`,
        margin,
        margin,
    );
    doc.fontSize(12).text(`Drill: ${marcher.drill_number}`, { align: "right" });
    doc.moveDown();

    // Table
    const tableTop = 150;
    const itemHeight = 30;
    const col1 = margin;
    const col2 = 150;
    const col3 = 250;
    const col4 = 400;

    // Table Header
    doc.fontSize(10)
        .text("Set", col1, tableTop)
        .text("Counts", col2, tableTop)
        .text("Side to Side", col3, tableTop)
        .text("Front to Back", col4, tableTop);

    doc.lineCap("butt")
        .moveTo(margin, tableTop + 20)
        .lineTo(width - margin, tableTop + 20)
        .stroke();

    // Table Rows
    let y = tableTop + 30;
    const sortedMarcherPages = marcherPages
        .filter((mp) => mp.marcher_id === marcher.id)
        .sort((a, b) => {
            const pageA = pages.find((p) => p.id === a.page_id);
            const pageB = pages.find((p) => p.id === b.page_id);
            return (pageA?.order ?? 0) - (pageB?.order ?? 0);
        });

    for (const mp of sortedMarcherPages) {
        if (y > height - margin) {
            doc.addPage();
            y = margin;
        }
        const page = pages.find((p) => p.id === mp.page_id) as Page;
        const coords = new ReadableCoords({
            x: mp.x,
            y: mp.y,
            roundingDenominator: options.roundingDenominator || 4,
        });

        doc.fontSize(9)
            .text(page.name, col1, y)
            .text(String(page.counts), col2, y)
            .text(coords.toVerboseStringX(), col3, y)
            .text(coords.toVerboseStringY(), col4, y);
        y += itemHeight;
    }
}

function drawQuarterPageSheet(
    doc: PDFKit.PDFDocument,
    sheetData: any,
    x: number,
    y: number,
) {
    const {
        marcher,
        pages,
        marcherPages,
        fieldProperties,
        options,
        quarterPageNumber,
    } = sheetData;
    const sheetWidth = (doc.page.width - 100) / 2 - 20;
    const sheetHeight = (doc.page.height - 100) / 2 - 20;

    doc.rect(x, y, sheetWidth, sheetHeight).stroke();

    // Header
    doc.fontSize(10).text(
        `${marcher.name} - Page ${quarterPageNumber}`,
        x + 10,
        y + 10,
    );
    doc.moveDown(0.5);

    // Table
    const tableTop = y + 40;
    const col1 = x + 10;
    const col2 = x + 50;
    const col3 = x + 150;

    doc.fontSize(8)
        .text("Set", col1, tableTop)
        .text("Side to Side", col2, tableTop)
        .text("Front to Back", col3, tableTop);
    doc.lineCap("butt")
        .moveTo(x + 10, tableTop + 15)
        .lineTo(x + sheetWidth - 10, tableTop + 15)
        .stroke();

    let rowY = tableTop + 25;
    for (const mp of marcherPages) {
        if (rowY > y + sheetHeight - 20) break; // Don't overflow
        const page = pages.find((p: Page) => p.id === mp.page_id);
        const coords = new ReadableCoords({
            x: mp.x,
            y: mp.y,
            roundingDenominator: options.roundingDenominator || 4,
        });
        doc.fontSize(7)
            .text(page?.name || "", col1, rowY)
            .text(coords.toTerseStringX(), col2, rowY)
            .text(coords.toTerseStringY(), col3, rowY);
        rowY += 20;
    }
}

// =================================================================================================
// Main Export Logic
// =================================================================================================

async function handleExport(payload: any) {
    if (!parentPort) return;

    const { dbPath, filePath, quarterPages, organizeBySection, ...options } =
        payload;
    if (!dbPath || !filePath) {
        throw new Error("Database path or file path not provided.");
    }

    parentPort.postMessage({
        type: "progress",
        payload: { progress: 5, message: "Opening database..." },
    });

    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    const fieldProperties = await db.query.field_properties.findFirst();
    if (fieldProperties) {
        ReadableCoords.setFieldProperties(
            fieldProperties as unknown as FieldProperties,
        );
    }

    parentPort.postMessage({
        type: "progress",
        payload: { progress: 10, message: "Fetching data..." },
    });

    const marchers = await db.query.marchers.findMany();
    const pages = await db.query.pages.findMany();
    const marcherPages = await db.query.marcher_pages.findMany();

    parentPort.postMessage({
        type: "progress",
        payload: { progress: 20, message: "Generating PDF..." },
    });

    const doc = new PDFDocument({
        size: "LETTER",
        layout: "portrait",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    if (quarterPages) {
        const sheets: any[] = [];
        for (const marcher of marchers) {
            const marcherPagesForMarcher = marcherPages.filter(
                (mp: any) => mp.marcher_id === marcher.id,
            );
            const chunks = [];
            for (let i = 0; i < marcherPagesForMarcher.length; i += 22) {
                chunks.push(marcherPagesForMarcher.slice(i, i + 22));
            }
            chunks.forEach((chunk, index) => {
                sheets.push({
                    marcher,
                    pages,
                    marcherPages: chunk,
                    fieldProperties,
                    options,
                    quarterPageNumber: index + 1,
                });
            });
        }

        for (let i = 0; i < sheets.length; i += 4) {
            const sheetGroup = sheets.slice(i, i + 4);
            const positions = [
                { x: 50, y: 50 },
                { x: doc.page.width / 2 + 10, y: 50 },
                { x: 50, y: doc.page.height / 2 + 10 },
                { x: doc.page.width / 2 + 10, y: doc.page.height / 2 + 10 },
            ];
            sheetGroup.forEach((sheet, index) => {
                drawQuarterPageSheet(
                    doc,
                    sheet,
                    positions[index].x,
                    positions[index].y,
                );
            });
            if (i + 4 < sheets.length) {
                doc.addPage();
            }
        }
    } else {
        for (let i = 0; i < marchers.length; i++) {
            const marcher = marchers[i];
            drawFullPageSheet(
                doc,
                marcher as unknown as Marcher,
                pages as unknown as Page[],
                marcherPages as unknown as MarcherPage[],
                fieldProperties as unknown as FieldProperties,
                options,
            );
            if (i < marchers.length - 1) {
                doc.addPage();
            }
            parentPort.postMessage({
                type: "progress",
                payload: { progress: 20 + (i / marchers.length) * 80 },
            });
        }
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
    });

    parentPort.postMessage({ type: "success", payload: { path: filePath } });
}

/**
 * The main function for the export utility process.
 * This process is forked from the main Electron process to handle heavy, long-running tasks
 * like generating large PDF files, thus preventing the UI from freezing.
 */
function main() {
    if (!parentPort) {
        // This should not happen if the process is forked correctly.
        console.error("Utility process started without a parent port.");
        return;
    }

    // Listen for messages from the main process
    parentPort.on("message", (message) => {
        const { type, payload } = message;

        if (type === "start-export") {
            if (!parentPort) return;
            handleExport(payload).catch((error) => {
                if (!parentPort) return;
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                parentPort.postMessage({
                    type: "error",
                    payload: { error: errorMessage },
                });
            });
        }
    });

    // Signal that the process is ready to receive messages
    parentPort.postMessage({ type: "ready" });
}

main();
