import { create } from "zustand";
import { type KeyboardActionsStoreType, keyboardActionsStoreCreator } from "./keyboardActionsStoreCreator";

export const useKeyboardActionsStore = create<KeyboardActionsStoreType>(keyboardActionsStoreCreator);
