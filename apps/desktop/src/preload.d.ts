import { ElectronApi } from "../electron/preload/index";
import type { View3dApi } from "../electron/preload/view3d";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi;
        /** Only in the 3D View window, where `electron` is absent. */
        view3d: View3dApi;
    }
}

export {};
