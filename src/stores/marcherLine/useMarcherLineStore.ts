import { create } from "zustand";
import {
    MarcherLineStoreInterface,
    marcherLineStoreCreator,
} from "./marcherLineStoreCreator";

export const useMarcherLineStore = create<MarcherLineStoreInterface>(
    marcherLineStoreCreator
);
