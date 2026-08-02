import { app, BrowserWindow, dialog } from "electron";
import { promises as fsPromises } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import * as DatabaseServices from "../../database/database.services";

const ILLUMINANT_API_URL = "https://illuminant.openmarch.com";

export type IlluminantHealthCheckResult = { ok: boolean };

export type IlluminantExportResult =
    | { success: true; filePath: string; exportDir: string }
    | { success: false; canceled: true }
    | { success: false; error: string };

export async function checkIlluminantHealth(): Promise<IlluminantHealthCheckResult> {
    try {
        const res = await fetch(`${ILLUMINANT_API_URL}/health`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { ok: false };
        const body = await res.json();
        return { ok: body?.status === "ok" };
    } catch {
        return { ok: false };
    }
}

async function errorMessageFromResponse(res: Response): Promise<string> {
    try {
        const body = await res.json();
        if (typeof body?.error === "string") return body.error;
    } catch {
        // response wasn't JSON; fall through to the generic message
    }
    return `Export failed with status ${res.status}`;
}

function defaultIlluminantSavePath(): string {
    const dbPath = DatabaseServices.getDbPath();
    const baseDir = dbPath ? dirname(dbPath) : app.getPath("documents");
    const baseName = dbPath ? basename(dbPath, extname(dbPath)) : "untitled";
    return join(baseDir, `${baseName}.illuminant`);
}

export async function exportIlluminantShow(
    requestBody: unknown,
): Promise<IlluminantExportResult> {
    let res: Response;
    try {
        res = await fetch(`${ILLUMINANT_API_URL}/api/export`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    if (!res.ok) {
        return { success: false, error: await errorMessageFromResponse(res) };
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    const win = BrowserWindow.getFocusedWindow();
    const saveDialogOptions = {
        title: "Save Illuminant Export",
        defaultPath: defaultIlluminantSavePath(),
        filters: [{ name: "Illuminant Show", extensions: ["illuminant"] }],
    };
    const dialogResult = win
        ? await dialog.showSaveDialog(win, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions);

    if (dialogResult.canceled || !dialogResult.filePath) {
        return { success: false, canceled: true };
    }

    await fsPromises.writeFile(dialogResult.filePath, buffer);

    return {
        success: true,
        filePath: dialogResult.filePath,
        exportDir: dirname(dialogResult.filePath),
    };
}
