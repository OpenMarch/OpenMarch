import { create } from "zustand";
import measureStoreCreator, { MeasureStoreInterface } from "./measureStoreCreator";

export const useMeasureStore = create<MeasureStoreInterface>(measureStoreCreator);
