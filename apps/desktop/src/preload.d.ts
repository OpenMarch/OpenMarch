import { ElectronApi } from "../electron/preload/index";
import { OpenMarchCanvas } from "./global/classes/canvasObjects/OpenMarchCanvas";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi;
        canvas: OpenMarchCanvas;
    }
}

export {};
