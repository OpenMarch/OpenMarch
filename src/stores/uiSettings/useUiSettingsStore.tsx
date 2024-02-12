import { create } from "zustand";
import { UiSettingsStoreInterface, uiSettingsStoreCreator } from "./uiSettingsStoreCreator";

export const useUiSettingsStore = create<UiSettingsStoreInterface>(uiSettingsStoreCreator);
