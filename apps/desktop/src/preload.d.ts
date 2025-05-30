import { ElectronApi, PluginsApi } from "../electron/preload/index";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi;
        plugins: PluginsApi;
    }
}

export {};
