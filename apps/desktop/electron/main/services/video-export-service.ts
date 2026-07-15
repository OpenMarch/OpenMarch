import { app, BrowserWindow, dialog } from "electron";
import Store from "electron-store";
import { randomUUID } from "node:crypto";
import * as fs from "fs";
import * as path from "path";

const store = new Store();

type VideoExportSession = {
    fileHandle: fs.promises.FileHandle;
    filePath: string;
};

/**
 * Streams an MP4 file to disk for the renderer's video export.
 *
 * The renderer encodes the video with MediaBunny and forwards byte chunks with
 * explicit positions (MP4 rewrites earlier byte ranges, e.g. for Fast Start),
 * so chunks are written positionally rather than appended.
 */
export class VideoExportService {
    private static sessions = new Map<string, VideoExportSession>();

    /**
     * Prompt the user for a save location and open a file handle for writing.
     *
     * @param fileExtension - The extension of the output file (e.g. "mp4")
     * @returns Session id and chosen file path, or null if the user cancelled
     */
    public static async start(
        fileExtension: string,
    ): Promise<{ sessionId: string; filePath: string } | null> {
        // Close any orphaned handles from previous failed exports
        await this.cleanupAll(false);

        const sessionId = randomUUID();
        let filePath: string;

        if (
            process.env.PLAYWRIGHT_SESSION === "true" &&
            process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH
        ) {
            filePath = process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH;
        } else {
            const date = new Date().toISOString().split("T")[0];
            const win = BrowserWindow.getFocusedWindow();
            const currentFileName = win
                ? win
                      .getTitle()
                      .replace(/^OpenMarch - /, "")
                      .replace(/\.[^/.]+$/, "")
                : "untitled";
            const currentFilePath = store.get("databasePath") as string;
            const baseDir = currentFilePath
                ? path.dirname(currentFilePath)
                : app.getPath("documents");

            const result = await dialog.showSaveDialog({
                title: "Export Video",
                defaultPath: path.join(
                    baseDir,
                    `${currentFileName}-${date}.${fileExtension}`,
                ),
                filters: [{ name: "Video", extensions: [fileExtension] }],
                properties: ["showOverwriteConfirmation", "createDirectory"],
            });

            if (result.canceled || !result.filePath) return null;
            filePath = result.filePath;
        }

        const fileHandle = await fs.promises.open(filePath, "w");
        this.sessions.set(sessionId, { fileHandle, filePath });
        return { sessionId, filePath };
    }

    /**
     * Write a chunk of bytes at the given byte offset in the output file.
     */
    public static async writeChunk(
        sessionId: string,
        data: Uint8Array,
        position: number,
    ): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error("Invalid or expired video export session");
        }

        let bufferOffset = 0;
        let filePosition = position;

        while (bufferOffset < data.byteLength) {
            const { bytesWritten } = await session.fileHandle.write(
                data,
                bufferOffset,
                data.byteLength - bufferOffset,
                filePosition,
            );
            if (bytesWritten === 0) {
                throw new Error("Failed to write video export chunk");
            }
            bufferOffset += bytesWritten;
            filePosition += bytesWritten;
        }
    }

    /**
     * Close the output file. On failure or cancellation, the partial file is
     * deleted.
     *
     * @param success - Whether the export completed successfully
     * @returns The final file path on success, otherwise null
     */
    public static async end(
        sessionId: string,
        success: boolean,
    ): Promise<string | null> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error("Invalid or expired video export session");
        }

        const finalPath = session.filePath;
        await this.cleanupSession(sessionId, success);
        return success ? finalPath : null;
    }

    private static async cleanupSession(
        sessionId: string,
        keepFile: boolean,
    ): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        await session.fileHandle.close().catch(() => undefined);
        if (!keepFile) {
            await fs.promises.unlink(session.filePath).catch(() => undefined);
        }
        this.sessions.delete(sessionId);
    }

    private static async cleanupAll(keepFile: boolean): Promise<void> {
        await Promise.all(
            [...this.sessions.keys()].map((sessionId) =>
                this.cleanupSession(sessionId, keepFile),
            ),
        );
    }
}
