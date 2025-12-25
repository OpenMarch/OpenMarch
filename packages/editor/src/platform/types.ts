/**
 * Platform Adapter Types
 *
 * These interfaces abstract platform-specific APIs, allowing the editor
 * to run in both Electron (desktop) and browser (web) environments.
 */

/**
 * SQL execution result from the platform's database driver
 */
export interface SqlProxyResult {
    rows: unknown[];
}

/**
 * Database adapter for executing SQL queries
 * Implementations: Electron IPC (desktop), sql.js (web)
 */
export interface DatabaseAdapter {
    /**
     * Execute a SQL query with parameters
     * Used by Drizzle ORM's SQLite proxy driver
     */
    sqlProxy(
        sql: string,
        params: unknown[],
        method: "run" | "all" | "values" | "get",
    ): Promise<SqlProxyResult>;

    /**
     * Execute raw SQL without parameter binding (for triggers, migrations, etc.)
     * Use with caution - no SQL injection protection
     */
    unsafeSqlProxy?(sql: string): Promise<SqlProxyResult>;
}

/**
 * Recent file entry
 */
export interface RecentFile {
    path: string;
    name: string;
    lastOpened: Date;
    thumbnailSvg?: string;
}

/**
 * File/project management operations
 */
export interface FileAdapter {
    /**
     * Check if a database/project is currently loaded
     */
    isReady(): Promise<boolean>;

    /**
     * Get the current file path (if any)
     */
    getCurrentPath(): Promise<string | null>;

    /**
     * Load a project file
     * @returns Success status and file path
     */
    loadProject(): Promise<{ success: boolean; filePath?: string }>;

    /**
     * Save current project to file
     */
    saveProject(): Promise<{ success: boolean; filePath?: string }>;

    /**
     * Create a new empty project
     */
    createProject(): Promise<{ success: boolean; filePath?: string }>;

    /**
     * Close current project (cleanup)
     */
    closeProject(): Promise<void>;

    /**
     * Get list of recently opened files
     */
    getRecentFiles(): Promise<RecentFile[]>;

    /**
     * Open a specific recent file
     */
    openRecentFile(filePath: string): Promise<boolean>;

    /**
     * Remove a file from recent files list
     */
    removeRecentFile(filePath: string): Promise<void>;

    /**
     * Clear recent files list
     */
    clearRecentFiles(): Promise<void>;
}

/**
 * Audio file metadata
 */
export interface AudioFileDetails {
    id: number;
    name: string;
    path: string;
    duration?: number;
    data?: ArrayBuffer;
}

/**
 * Audio file management
 */
export interface AudioAdapter {
    /**
     * Open file picker to select and insert audio file
     */
    insertAudioFile(): Promise<AudioFileDetails[] | null>;

    /**
     * Get metadata for all audio files in project
     */
    getAudioFiles(): Promise<AudioFileDetails[]>;

    /**
     * Get currently selected audio file
     */
    getSelectedAudioFile(): Promise<AudioFileDetails | null>;

    /**
     * Set the selected audio file
     */
    setSelectedAudioFile(audioFileId: number): Promise<AudioFileDetails | null>;

    /**
     * Update audio file metadata
     */
    updateAudioFiles(
        modifications: Array<{ id: number; [key: string]: unknown }>,
    ): Promise<AudioFileDetails[]>;

    /**
     * Delete an audio file from the project
     */
    deleteAudioFile(audioFileId: number): Promise<AudioFileDetails | null>;
}

/**
 * User settings/preferences
 */
export interface SettingsAdapter {
    /**
     * Get current UI theme
     */
    getTheme(): Promise<"light" | "dark" | "system">;

    /**
     * Set UI theme
     */
    setTheme(theme: "light" | "dark" | "system"): Promise<void>;

    /**
     * Get current language
     */
    getLanguage(): Promise<string>;

    /**
     * Set language
     */
    setLanguage(language: string): Promise<void>;

    /**
     * Get arbitrary setting value
     */
    getSetting<T>(key: string): Promise<T | undefined>;

    /**
     * Set arbitrary setting value
     */
    setSetting<T>(key: string, value: T): Promise<void>;
}

/**
 * History state for undo/redo
 */
export interface HistoryState {
    canUndo: boolean;
    canRedo: boolean;
    undoStackLength: number;
    redoStackLength: number;
}

/**
 * Undo/redo history management
 */
export interface HistoryAdapter {
    /**
     * Undo last action
     */
    undo(): Promise<void>;

    /**
     * Redo last undone action
     */
    redo(): Promise<void>;

    /**
     * Get current undo stack length
     */
    getUndoStackLength(): Promise<number>;

    /**
     * Get current redo stack length
     */
    getRedoStackLength(): Promise<number>;

    /**
     * Flatten undo groups above a certain threshold
     */
    flattenUndoGroupsAbove(group: number): Promise<void>;

    /**
     * Subscribe to history action events
     * @returns Unsubscribe function
     */
    onHistoryAction(
        callback: (response: { type: "undo" | "redo" }) => void,
    ): () => void;
}

/**
 * Window management (optional - only for desktop)
 */
export interface WindowAdapter {
    /**
     * Minimize the window
     */
    minimize(): void;

    /**
     * Maximize/restore the window
     */
    maximize(): void;

    /**
     * Close the window
     */
    close(): void;

    /**
     * Open the application menu
     */
    openMenu(): void;

    /**
     * Whether running on macOS
     */
    isMacOS: boolean;
}

/**
 * Export functionality (optional - platform-specific)
 */
export interface ExportAdapter {
    /**
     * Export to PDF
     */
    exportPdf(params: {
        sheets: Array<{
            name: string;
            section: string;
            renderedPage: string;
        }>;
        organizeBySection: boolean;
        quarterPages: boolean;
    }): Promise<{ success: boolean; filePath?: string }>;

    /**
     * Create a directory for exporting files
     */
    createExportDirectory(
        defaultName: string,
    ): Promise<{ success: boolean; path?: string }>;

    /**
     * Generate individual coordinate sheets for a marcher
     */
    generateDocForMarcher(args: {
        svgPages: string[];
        drillNumber: string;
        marcherCoordinates: string[];
        pages: Array<{ name: string; id: number }>;
        showName: string;
        exportDir: string;
        individualCharts: boolean;
        notesAppendixPages?: Array<{ pageName: string; notes: string }>;
    }): Promise<{ success: boolean }>;

    /**
     * Open the export directory in file explorer
     */
    openExportDirectory(exportDir: string): Promise<void>;

    /**
     * Show save dialog for file export
     */
    showSaveDialog(options: {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<{ canceled: boolean; filePath?: string }>;
}

/**
 * Logging adapter
 */
export interface LogAdapter {
    /**
     * Log a message
     */
    log(
        level: "log" | "info" | "warn" | "error",
        message: string,
        ...args: unknown[]
    ): void;
}

/**
 * Environment information
 */
export interface EnvironmentInfo {
    isPlaywrightSession: boolean;
    isCodegen: boolean;
    platform: "electron" | "web";
}

/**
 * Platform capabilities - what features are available
 */
export interface PlatformCapabilities {
    /** Can export to PDF */
    canExportPdf: boolean;
    /** Has native window controls */
    hasWindowControls: boolean;
    /** Can access local filesystem directly */
    hasFileSystem: boolean;
    /** Can use native file dialogs */
    hasNativeDialogs: boolean;
    /** Platform identifier */
    platform: "electron" | "web";
}

/**
 * Complete platform adapter interface
 * Implementations provide platform-specific behavior
 */
export interface PlatformAdapter {
    /** Platform capabilities */
    capabilities: PlatformCapabilities;

    /** Database operations */
    database: DatabaseAdapter;

    /** File/project operations */
    file: FileAdapter;

    /** Audio operations */
    audio: AudioAdapter;

    /** Settings/preferences */
    settings: SettingsAdapter;

    /** Undo/redo history */
    history: HistoryAdapter;

    /** Logging */
    log: LogAdapter;

    /** Environment info */
    env: EnvironmentInfo;

    /** Window management (optional - desktop only) */
    window?: WindowAdapter;

    /** Export functionality (optional - desktop only) */
    export?: ExportAdapter;

    /**
     * Initialize the platform adapter
     * Called once when the editor mounts
     */
    initialize(): Promise<void>;

    /**
     * Cleanup when editor unmounts
     */
    destroy(): Promise<void>;
}
