import { create } from "zustand";

export type ExportTab =
    | "mobile"
    | "coordinate-sheets"
    | "drill-charts"
    | "video";

/** Open state for app-level dialogs, so actions (shortcuts, the command palette) can open them from anywhere. */
interface AppDialogStore {
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    exportOpen: boolean;
    exportTab: ExportTab;
    setExportOpen: (open: boolean) => void;
    setExportTab: (tab: ExportTab) => void;
    openExport: (tab?: ExportTab) => void;
}

export const useAppDialogStore = create<AppDialogStore>((set) => ({
    settingsOpen: false,
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    exportOpen: false,
    exportTab: "mobile",
    setExportOpen: (exportOpen) => set({ exportOpen }),
    setExportTab: (exportTab) => set({ exportTab }),
    openExport: (tab = "mobile") => set({ exportOpen: true, exportTab: tab }),
}));
