import { create } from "zustand";
import { PageStoreInterface, pageStoreCreator } from "./pageStoreCreator";

export const usePageStore = create<PageStoreInterface>(pageStoreCreator);
