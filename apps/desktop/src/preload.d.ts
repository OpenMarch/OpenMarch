import { ElectronApi, PluginsApi } from "../electron/preload/index";
import { OpenMarchCanvas } from "./global/classes/canvasObjects/OpenMarchCanvas";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi;
        plugins: PluginsApi;
        canvas: OpenMarchCanvas;
    }
}

export {};
