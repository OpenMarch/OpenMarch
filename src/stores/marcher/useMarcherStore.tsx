import { create } from "zustand";
import { MarcherStoreInterface, marcherStoreCreator } from "./marcherStoreCreator";

export const useMarcherStore = create<MarcherStoreInterface>(marcherStoreCreator);
