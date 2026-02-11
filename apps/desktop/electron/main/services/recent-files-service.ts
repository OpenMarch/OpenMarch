import Store from "electron-store";
import * as path from "path";
import { existsSync } from "fs";

// Define types
export interface RecentFile {
    path: string;
    name: string;
    lastOpened: number; // timestamp
    svgPreview?: string; // SVG preview of the first page
    isMissing?: boolean; // Whether the file is missing
}

// Create a typed store
interface StoreSchema {
    recentFiles: RecentFile[];
    maxRecentFiles?: number;
}

// Initialize the store
const store = new Store<StoreSchema>({
    name: "recent",
    defaults: {
        recentFiles: [],
        maxRecentFiles: 10,
    },
});

/**
 * Adds a file to the recent files list
 * @param filePath The full path to the file
 * @param svgPreview Optional SVG preview of the file's first page
 */
export function addRecentFile(filePath: string, svgPreview?: string): void {
    if (!filePath) return;

    const maxRecentFiles = store.get("maxRecentFiles", 10);
    const recentFiles = store.get("recentFiles", []);

    // Extract the filename from the path
    const name = path.basename(filePath);

    // Create the new recent file entry
    const newRecentFile: RecentFile = {
        path: filePath,
        name,
        lastOpened: Date.now(),
        svgPreview,
    };

    // Filter out any existing entry with the same path
    const filteredFiles = recentFiles.filter((file) => file.path !== filePath);

    // Add the new file at the beginning of the array
    const updatedFiles = [newRecentFile, ...filteredFiles].slice(
        0,
        maxRecentFiles,
    );

    // Update the store
    store.set("recentFiles", updatedFiles);
}

/**
 * Gets all recent files
 * @returns Array of recent files sorted by most recently opened
 */
export function getRecentFiles(): RecentFile[] {
    const recentFiles = store.get("recentFiles", []);

    // Apply isMissing flag
    return recentFiles.map((file) => ({
        ...file,
        isMissing: !file.path || !existsSync(file.path),
    }));
}

/**
 * Clears all recent files
 */
export function clearRecentFiles(): void {
    console.log("clearRecentFiles");
    store.set("recentFiles", []);
}

/**
 * Removes a specific file from the recent files list
 * @param filePath The path of the file to remove
 */
export function removeRecentFile(filePath: string): void {
    if (!filePath) return;

    const recentFiles = store.get("recentFiles", []);
    const updatedFiles = recentFiles.filter((file) => file.path !== filePath);

    store.set("recentFiles", updatedFiles);
}

/**
 * Sets the maximum number of recent files to keep
 * @param max The maximum number of recent files
 */
export function setMaxRecentFiles(max: number): void {
    if (max < 1) return;

    store.set("maxRecentFiles", max);

    // Trim the existing list if necessary
    const recentFiles = store.get("recentFiles", []);
    if (recentFiles.length > max) {
        store.set("recentFiles", recentFiles.slice(0, max));
    }
}

/**
 * Updates the SVG preview for a specific recent file
 * @param filePath The path of the file to update
 * @param svgPreview The new SVG preview string
 * @returns boolean indicating if the update was successful
 */
export function updateRecentFileSvgPreview(
    filePath: string,
    svgPreview: string,
): boolean {
    if (!filePath || !svgPreview) return false;

    const recentFiles = store.get("recentFiles", []);
    const fileIndex = recentFiles.findIndex((file) => file.path === filePath);

    // If file not found in recent files
    if (fileIndex === -1) return false;

    // Update the SVG preview for the file
    recentFiles[fileIndex].svgPreview = svgPreview;

    // Save the updated list
    store.set("recentFiles", recentFiles);

    return true;
}
