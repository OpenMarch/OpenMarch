import { ElectronApi } from "../electron/preload/index";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        electron: ElectronApi & {
            export: ElectronApi["export"] & {
                svgPagesToPdf: (
                    svgPages: string[],
                    options: { fileName: string },
                ) => Promise<{
                    success: boolean;
                    filePath?: string;
                    error?: string;
                }>;
            };
        };
    }
}

export {};
