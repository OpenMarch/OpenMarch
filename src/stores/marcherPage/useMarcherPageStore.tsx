import { create } from "zustand";
import { MarcherPageStoreInterface, marcherPageStoreCreator } from "./marcherPageStoreCreator";

export const useMarcherPageStore = create<MarcherPageStoreInterface>(marcherPageStoreCreator);
