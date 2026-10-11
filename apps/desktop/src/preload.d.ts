import { ElectronApi, PluginsApi } from "../electron/preload/index";
import type { View3dApi } from "../electron/preload/view3d";
import { OpenMarchCanvas } from "./global/classes/canvasObjects/OpenMarchCanvas";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi;
        plugins: PluginsApi;
        canvas: OpenMarchCanvas;
        /** Only in the 3D View window, where `electron` and `plugins` are absent. */
        view3d: View3dApi;
    }
}

export {};
