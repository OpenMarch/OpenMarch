import { createContext, useContext, ReactNode, useState } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

interface CanvasContextType {
    canvas: OpenMarchCanvas | undefined;
    setCanvas: (canvas: OpenMarchCanvas | undefined) => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

export function CanvasProvider({ children }: { children: ReactNode }) {
    const [canvas, setCanvasState] = useState<OpenMarchCanvas | undefined>(
        undefined,
    );

    const setCanvas = (newCanvas: OpenMarchCanvas | undefined) => {
        setCanvasState(newCanvas);
    };

    return (
        <CanvasContext.Provider value={{ canvas, setCanvas }}>
            {children}
        </CanvasContext.Provider>
    );
}

export function useCanvas() {
    const context = useContext(CanvasContext);
    if (context === undefined) {
        throw new Error("useCanvas must be used within a CanvasProvider");
    }
    return context;
}
