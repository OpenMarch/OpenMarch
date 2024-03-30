import { create } from "zustand";
import { type RegisteredActionsStoreType, registeredActionsStoreCreator } from "./registeredActionsStoreCreator";

export const useRegisteredActionsStore = create<RegisteredActionsStoreType>(registeredActionsStoreCreator);
