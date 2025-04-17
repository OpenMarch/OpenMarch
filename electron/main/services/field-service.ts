import { dialog, ipcMain } from "electron";
import { windowService } from "./window-service";
import * as fs from "fs";
import {
    getFieldPropertiesJson,
    updateFieldProperties,
    updateFieldPropertiesImage,
} from "../../database/tables/FieldPropertiesTable";
import * as DatabaseServices from "../../database/database.services";

let instance: FieldService;

class FieldService {
    static getService() {
        if (!instance) {
            instance = new FieldService();
        }

        return instance;
    }

    private constructor() {
        ipcMain.handle("field_properties:export", async () =>
            this.exportFieldPropertiesFile(),
        );

        ipcMain.handle("field_properties:import", async () =>
            this.importFieldPropertiesFile(),
        );

        ipcMain.handle("field_properties:import_image", async () =>
            this.importFieldPropertiesImage(),
        );
    }

    /**
     * Opens a dialog to export the field properties to a file.
     * The file's extension is  .fieldots, but it's actually a JSON file.
     *
     * @returns 200 for success, -1 for failure
     */
    exportFieldPropertiesFile() {
        console.log("exportFieldPropertiesFile");

        if (!windowService.activeWindow) return -1;

        const jsonStr = getFieldPropertiesJson({
            db: DatabaseServices.connect(),
        }).data;

        // Save
        dialog
            .showSaveDialog(windowService.activeWindow, {
                buttonLabel: "Save Field",
                filters: [
                    { name: "OpenMarch Field File", extensions: ["fieldots"] },
                ],
            })
            .then((path) => {
                if (path.canceled || !path.filePath) return -1;

                fs.writeFileSync(path.filePath, jsonStr, {
                    encoding: "utf-8",
                });

                return 200;
            })
            .catch((err) => {
                console.log(err);
                return -1;
            });
    }

    /**
     * Opens a dialog to import a field properties file and updates the field properties in the database.
     * The file's extension is .fieldots, but it's actually a JSON file.
     *
     * @returns 200 for success, -1 for failure
     */
    importFieldPropertiesFile() {
        console.log("importFieldPropertiesFile");

        if (!windowService.activeWindow) return -1;

        // If there is no previous path, open a dialog
        dialog
            .showOpenDialog(windowService.activeWindow, {
                filters: [
                    { name: "OpenMarch Field File", extensions: ["fieldots"] },
                ],
            })
            .then((path) => {
                const fileContents = fs.readFileSync(path.filePaths[0]);
                const jsonStr = fileContents.toString();
                updateFieldProperties({
                    db: DatabaseServices.connect(),
                    fieldProperties: jsonStr,
                });

                // If the user cancels the dialog, and there is no previous path, return -1
                if (path.canceled || !path.filePaths[0]) return -1;

                windowService.activeWindow?.webContents.send(
                    "field_properties:onImport",
                );

                return 200;
            })
            .catch((err) => {
                console.log(err);
                return -1;
            });
    }

    importFieldPropertiesImage() {
        console.log("importFieldPropertiesFile");

        if (!windowService.activeWindow) return -1;

        // If there is no previous path, open a dialog
        dialog
            .showOpenDialog(windowService.activeWindow, {
                filters: [
                    {
                        name: "All Images",
                        extensions: [
                            "jpg",
                            "jpeg",
                            "png",
                            "bmp",
                            "gif",
                            "webp",
                        ],
                    },
                    {
                        name: "JPEG Image",
                        extensions: ["jpg", "jpeg"],
                    },
                    {
                        name: "PNG Image",
                        extensions: ["png"],
                    },
                    {
                        name: "GIF Image",
                        extensions: ["gif"],
                    },
                    {
                        name: "WEBP Image",
                        extensions: ["webp"],
                    },
                    {
                        name: "GIF Image",
                        extensions: ["gif"],
                    },
                    {
                        name: "BMP Image",
                        extensions: ["bmp"],
                    },
                    {
                        name: "All Files",
                        extensions: ["*"],
                    },
                ],
            })
            .then((path) => {
                updateFieldPropertiesImage({
                    db: DatabaseServices.connect(),
                    imagePath: path.filePaths[0],
                });

                // If the user cancels the dialog, and there is no previous path, return -1
                if (path.canceled || !path.filePaths[0]) return -1;

                windowService.activeWindow?.webContents.send(
                    "field_properties:onImageImport",
                );

                return 200;
            })
            .catch((err) => {
                console.log(err);
                return -1;
            });
    }
}

export const fieldService = FieldService.getService();
