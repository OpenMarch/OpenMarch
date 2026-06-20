import { app, BrowserWindow, dialog } from "electron";
import Store from "electron-store";
import * as fs from "fs";
import * as path from "path";

const store = new Store();

/**
 * Streams an MP4 file to disk for the renderer's video export.
 *
 * The renderer encodes the video with MediaBunny and forwards byte chunks with
 * explicit positions (MP4 rewrites earlier byte ranges, e.g. for Fast Start),
 * so chunks are written positionally rather than appended.
 */
export class VideoExportService {
    private static fileHandle: fs.promises.FileHandle | null = null;
    private static filePath: string | null = null;

    /**
     * Prompt the user for a save location and open a file handle for writing.
     *
     * @param fileExtension - The extension of the output file (e.g. "mp4")
     * @returns The chosen file path, or null if the user cancelled
     */
    public static async start(fileExtension: string): Promise<string | null> {
        // Close any orphaned handle from a previous failed export
        await this.cleanup(false);

        if (
            process.env.PLAYWRIGHT_SESSION === "true" &&
            process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH
        ) {
            this.fileHandle = await fs.promises.open(
                process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH,
                "w",
            );
            this.filePath = process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH;
            return this.filePath;
        }

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

        this.fileHandle = await fs.promises.open(result.filePath, "w");
        this.filePath = result.filePath;
        return result.filePath;
    }

    /**
     * Write a chunk of bytes at the given byte offset in the output file.
     */
    public static async writeChunk(
        data: Uint8Array,
        position: number,
    ): Promise<void> {
        if (!this.fileHandle)
            throw new Error("Video export file is not open for writing");
        await this.fileHandle.write(data, 0, data.byteLength, position);
    }

    /**
     * Close the output file. On failure or cancellation, the partial file is
     * deleted.
     *
     * @param success - Whether the export completed successfully
     * @returns The final file path on success, otherwise null
     */
    public static async end(success: boolean): Promise<string | null> {
        const finalPath = this.filePath;
        await this.cleanup(success);
        return success ? finalPath : null;
    }

    private static async cleanup(keepFile: boolean): Promise<void> {
        if (this.fileHandle) {
            await this.fileHandle.close().catch(() => undefined);
            this.fileHandle = null;
        }
        if (this.filePath && !keepFile) {
            await fs.promises.unlink(this.filePath).catch(() => undefined);
        }
        this.filePath = null;
    }
}
