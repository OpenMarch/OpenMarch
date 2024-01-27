import { create } from "zustand";
import * as api from "../api/api";
import * as Interfaces from "../Interfaces";

/******************** Marchers ********************/
interface MarcherStoreState {
    marchers: Interfaces.Marcher[],
    marchersAreLoading: boolean
}
interface MarcherStoreActions {
    fetchMarchers: () => Promise<void>;
    setMarchersAreLoading: (isLoading: boolean) => void;
}
export const useMarcherStore = create<MarcherStoreState & MarcherStoreActions>()((set) => ({
    marchers: [],
    marchersAreLoading: true,

    fetchMarchers: async () => {
        const newMarchers = await api.getMarchers();
        set({ marchers: newMarchers });
    },

    setMarchersAreLoading: (isLoading) => {
        set({ marchersAreLoading: isLoading });
    }
}));

/******************** Pages ********************/
interface PageStoreState {
    pages: Interfaces.Page[],
    pagesAreLoading: boolean
}
interface PageStoreActions {
    fetchPages: () => Promise<void>;
    setPagesAreLoading: (isLoading: boolean) => void;
}
export const usePageStore = create<PageStoreState & PageStoreActions>()((set) => ({
    pages: [],
    pagesAreLoading: true,

    fetchPages: async () => {
        const newPages = await api.getPages();
        set({ pages: newPages });
    },

    setPagesAreLoading: (isLoading) => {
        set({ pagesAreLoading: isLoading });
    }
}));

/******************** MarcherPages ********************/
interface MarcherPageStoreState {
    marcherPages: Interfaces.MarcherPage[],
    marcherPagesAreLoading: boolean
}
interface MarcherPageStoreActions {
    fetchMarcherPages: () => Promise<void>;
    setMarcherPagesAreLoading: (isLoading: boolean) => void;
}
export const useMarcherPageStore = create<MarcherPageStoreState & MarcherPageStoreActions>()((set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await api.getMarcherPages();
        set({ marcherPages: newMarcherPages });
    },

    setMarcherPagesAreLoading: (isLoading) => {
        set({ marcherPagesAreLoading: isLoading });
    }
}));

/******************** UI Settings ********************/
interface UiSettingsStoreState {
    uiSettings: Interfaces.UiSettings
}
interface UiSettingsStoreActions {
    setUiSettings: (uiSettings: Interfaces.UiSettings, type?: keyof Interfaces.UiSettings) => void;
}
export const useUiSettingsStore = create<UiSettingsStoreState & UiSettingsStoreActions>()((set) => ({
    uiSettings: {
        isPlaying: false,
        lockX: false,
        lockY: false,
    },

    setUiSettings: (newUiSettings, type) => {
        let uiSettings = { ...newUiSettings };

        if (uiSettings.lockX && type === "lockX") {
            uiSettings.lockY = false;
        }

        if (uiSettings.lockY && type === "lockY") {
            uiSettings.lockX = false;
        }

        set({ uiSettings: uiSettings });
    }
}));

