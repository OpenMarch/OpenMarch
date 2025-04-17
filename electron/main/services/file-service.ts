import { app, dialog, ipcMain } from "electron";
import * as fs from "fs";
import { windowService } from "./window-service";
import * as DatabaseServices from "../../database/database.services";
import CurrentDatabase from "../../database/versions/CurrentDatabase";

import { settingsService } from "./settings-service";
import { join } from "path";
import { sentryService } from "./sentry-service";
import AudioFile from "@/global/classes/AudioFile";
import { parseMxl } from "../../mxl/MxlUtil";

let instance: FileService;

class FileService {
    static getService() {
        console.log("instance", instance);
        if (!instance) {
            instance = new FileService();
        }

        return instance;
    }

    private constructor() {
        app.on("open-file", (event, path) => {
            event.preventDefault();
            this.setActiveDb(path);
        });

        ipcMain.handle("database:save", () => this.saveFile());
        ipcMain.handle("database:load", () => this.loadDatabaseFile());
        ipcMain.handle("database:create", async () => this.newFile());

        ipcMain.handle("audio:insert", async () => this.insertAudioFile());
        ipcMain.handle("measure:insert", async () =>
            this.launchImportMusicXmlFileDialogue(),
        );
    }

    /************************************** FILE SYSTEM INTERACTIONS **************************************/
    /**
     * Creates a new database file path to connect to.
     *
     * @returns 200 for success, -1 for failure
     */
    async newFile() {
        console.log("newFile");

        if (!windowService.activeWindow) return -1;

        // Get path to new file
        const path = await dialog.showSaveDialog(windowService.activeWindow, {
            buttonLabel: "Create New",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        });
        if (path.canceled || !path.filePath) return;

        this.setActiveDb(path.filePath, true);
        const dbVersion = new CurrentDatabase(DatabaseServices.connect);
        dbVersion.createTables();
        windowService.activeWindow?.webContents.reload();

        return 200;
    }

    /**
     * Opens a dialog to create a new database file path to connect to with the data of the current database.
     * I.e. Save As..
     * OpenMarch automatically saves changes to the database, so this is not a save function.
     *
     * @returns 200 for success, -1 for failure
     */
    saveFile() {
        console.log("saveFile");

        if (!windowService.activeWindow) return -1;

        const db = DatabaseServices.connect();

        // Save
        dialog
            .showSaveDialog(windowService.activeWindow, {
                buttonLabel: "Save Copy",
                filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
            })
            .then((path) => {
                if (path.canceled || !path.filePath) return -1;

                const serializedDb = db.serialize();
                const uint8Array = Uint8Array.from(serializedDb);

                fs.writeFileSync(path.filePath, uint8Array);

                this.setActiveDb(path.filePath);
                return 200;
            })
            .catch((err) => {
                console.log(err);
                return -1;
            });
    }

    /**
     * Opens a dialog to load a database file path to connect to.
     *
     * @returns 200 for success, -1 for failure
     */
    loadDatabaseFile() {
        console.log("loadDatabaseFile");

        if (!windowService.activeWindow) return -1;

        // If there is no previous path, open a dialog
        dialog
            .showOpenDialog(windowService.activeWindow, {
                filters: [
                    { name: "OpenMarch File", extensions: ["dots"] },
                    { name: "All Files", extensions: ["*"] },
                ],
            })
            .then((path) => {
                DatabaseServices.setDbPath(path.filePaths[0]);
                settingsService.setSetting("databasePath", path.filePaths[0]); // Save the path for next time

                // If the user cancels the dialog, and there is no previous path, return -1
                if (path.canceled || !path.filePaths[0]) return -1;

                this.setActiveDb(path.filePaths[0]);
                return 200;
            })
            .catch((err) => {
                console.log(err);
                return -1;
            });
    }

    /**
     * Closes the current database file.
     *
     * @returns 200 for success, -1 for failure
     */
    closeCurrentFile() {
        console.log("closeCurrentFile");

        if (!windowService.activeWindow) return -1;

        // Close the current file
        DatabaseServices.setDbPath("", false);
        settingsService.setSetting("databasePath", "");

        windowService.activeWindow?.webContents.reload();

        return 200;
    }

    // Audio files

    /**
     * Opens a dialog to import an audio file to the database.
     *
     * @returns 200 for success, -1 for failure (TODO, this function's return value is always error)
     */
    async insertAudioFile(): Promise<
        DatabaseServices.LegacyDatabaseResponse<AudioFile[]>
    > {
        console.log("insertAudioFile");

        if (!windowService.activeWindow)
            return {
                success: false,
                error: { message: "insertAudioFile: window not loaded" },
            };

        let databaseResponse: DatabaseServices.LegacyDatabaseResponse<
            AudioFile[]
        >;
        // If there is no previous path, open a dialog
        databaseResponse = await dialog
            .showOpenDialog(windowService.activeWindow, {
                filters: [
                    { name: "Audio File", extensions: ["mp3", "wav", "ogg"] },
                    { name: "All Files", extensions: ["*"] },
                ],
            })
            .then((path) => {
                console.log(
                    "loading audio file into buffer:",
                    path.filePaths[0],
                );
                fs.readFile(path.filePaths[0], (err, data) => {
                    if (err) {
                        console.error("Error reading audio file:", err);
                        return -1;
                    }

                    // 'data' is a buffer containing the file contents
                    // Id is -1 to conform with interface
                    DatabaseServices.insertAudioFile({
                        id: -1,
                        data,
                        path: path.filePaths[0],
                        nickname: path.filePaths[0],
                        selected: true,
                    }).then((response) => {
                        databaseResponse = response;
                    });
                });
                if (path.canceled || !path.filePaths[0])
                    return {
                        success: false,
                        error: {
                            message:
                                "insertAudioFile: Operation was cancelled or no audio file was provided",
                        },
                    };

                // setActiveDb(path.filePaths[0]);
                return databaseResponse;
            })
            .catch((err) => {
                // TODO how to print/return stack here?
                console.log(err);
                return { success: false, error: { message: err } };
            });
        return (
            databaseResponse || {
                success: false,
                error: { message: "Error inserting audio file" },
            }
        );
    }

    /**
     * Opens a dialog to import a MusicXML file into OpenMarch.
     *
     * This function does not actually insert the file into the database, but rather reads the file and returns the xml data.
     * This was done due to issues getting xml2abc to work in the main process.
     *
     * @returns Promise<string | undefined> - The string xml data of the musicxml file, or undefined if the operation was cancelled/failed.
     */
    async launchImportMusicXmlFileDialogue(): Promise<string | undefined> {
        console.log("readMusicXmlFile");

        if (!windowService.activeWindow) {
            console.error("window not loaded");
            return;
        }

        // If there is no previous path, open a dialog
        const dialogueResponse = await dialog.showOpenDialog(
            windowService.activeWindow,
            {
                filters: [
                    {
                        name: "MusicXML File",
                        extensions: ["mxl", "musicxml", "xml"],
                    },
                    { name: "All Files", extensions: ["*"] },
                ],
            },
        );

        if (dialogueResponse.canceled || !dialogueResponse.filePaths[0]) {
            console.error("Operation was cancelled or no file was provided");
            return;
        }

        console.log("loading musicxml file:", dialogueResponse.filePaths[0]);
        const filePath = dialogueResponse.filePaths[0];

        let xmlString;
        if (filePath.endsWith(".mxl")) {
            xmlString = parseMxl(filePath);
        } else {
            xmlString = fs.readFileSync(filePath, "utf8");
        }
        return xmlString;
    }

    /**
     * Sets the active database path and reloads the window.
     *
     * @param path path to the database file
     * @param isNewFile True if this is a new file, false if it is an existing file
     */
    setActiveDb(path: string, isNewFile = false) {
        try {
            // Get the current path from the store if the path is "."
            // I.e. last opened file
            if (path === ".")
                path = settingsService.getSetting("databasePath") as string;

            if (!fs.existsSync(path) && !isNewFile) {
                settingsService.deleteSetting("databasePath");
                console.error("Database file does not exist:", path);
                return;
            }
            DatabaseServices.setDbPath(path, isNewFile);
            windowService.activeWindow?.setTitle("OpenMarch - " + path);

            const migrator = new CurrentDatabase(DatabaseServices.connect);
            const db = DatabaseServices.connect();
            if (!db) {
                console.error("Error connecting to database");
                return;
            }

            // If this isn't a new file, check if a migration is needed
            if (isNewFile) {
                console.log(`Creating new database at ${path}`);
                migrator.createTables();
            } else {
                console.log(
                    "Checking database version to see if migration is needed",
                );
                CurrentDatabase.getVersion(db);
                // Create backup before migration
                if (CurrentDatabase.getVersion(db) !== migrator.version) {
                    const backupDir = join(app.getPath("userData"), "backups");
                    if (!fs.existsSync(backupDir)) {
                        fs.mkdirSync(backupDir);
                    }
                    const timestamp = new Date()
                        .toISOString()
                        .replace(/[:.]/g, "-");
                    const originalName = path.split(/[\\/]/).pop();
                    const backupPath = join(
                        backupDir,
                        `backup_${timestamp}_${originalName}`,
                    );
                    console.log("Creating backup of database in " + backupPath);
                    fs.copyFileSync(path, backupPath);

                    console.log("Deleting backups older than 30 days");
                    // Delete backups older than 30 days
                    const files = fs.readdirSync(backupDir);
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    files.forEach((file) => {
                        const filePath = join(backupDir, file);
                        const stats = fs.statSync(filePath);
                        if (stats.birthtime < thirtyDaysAgo) {
                            fs.unlinkSync(filePath);
                        }
                    });
                }
                migrator.migrateToThisVersion();
            }

            settingsService.setSetting("databasePath", path); // Save current db path
            windowService.activeWindow?.webContents.reload();
        } catch (error) {
            sentryService.capture(error);
            settingsService.deleteSetting("databasePath"); // Reset database path
            DatabaseServices.setDbPath("", false);
            dialog.showErrorBox(
                "Error Loading Database",
                (error as Error).message,
            );
            windowService.activeWindow?.webContents.reload();
            throw error;
        }
    }
}

export const fileService = FileService.getService();
