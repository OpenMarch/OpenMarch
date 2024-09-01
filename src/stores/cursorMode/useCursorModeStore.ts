import { create } from "zustand";
import { CursorModeStoreInterface, cursorModeStoreCreator } from "./cursorModeStoreCreator";

export const CursorModes = ['default', 'line'] as const;
export type CursorMode = typeof CursorModes[number];

export const useCursorModeStore = create<CursorModeStoreInterface>(cursorModeStoreCreator);
