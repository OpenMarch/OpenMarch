import { create } from "zustand";

export type PropDrawingMode =
    | "rectangle"
    | "circle"
    | "arc"
    | "polygon"
    | "freehand"
    | null;

type PropDrawingStore = {
    drawingMode: PropDrawingMode;
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
    // For polygon/arc: array of clicked points
    points: { x: number; y: number }[];

    setDrawingMode: (mode: PropDrawingMode) => void;
    setIsDrawing: (isDrawing: boolean) => void;
    setStartPoint: (point: { x: number; y: number } | null) => void;
    addPoint: (point: { x: number; y: number }) => void;
    clearPoints: () => void;
    resetDrawingState: () => void;
};

export const usePropDrawingStore = create<PropDrawingStore>((set) => ({
    drawingMode: null,
    isDrawing: false,
    startPoint: null,
    points: [],

    setDrawingMode: (mode) => set({ drawingMode: mode }),
    setIsDrawing: (isDrawing) => set({ isDrawing }),
    setStartPoint: (point) => set({ startPoint: point }),
    addPoint: (point) => set((state) => ({ points: [...state.points, point] })),
    clearPoints: () => set({ points: [] }),
    resetDrawingState: () =>
        set({
            drawingMode: null,
            isDrawing: false,
            startPoint: null,
            points: [],
        }),
}));
