import { useState, useCallback } from "react";
import { DragInput } from "@openmarch/ui";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { rotate } from "@/utilities/CoordinateActions";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";

function MarcherRotationInput({
    selectedMarchers,
    marcherPages,
    selectedPage,
}: any) {
    const [rotationAngle, setRotationAngle] = useState<number>(0);
    const [isRotating, setIsRotating] = useState(false);

    const handleRotation = useCallback(() => {
        // TODO: Implement rotation logic
        // This will need to:
        // 1. Get the center point of the selected marchers
        // 2. Convert marcherPages to IdPoint format
        // 3. Call the rotate function
        // 4. Update the marcherPages with the new coordinates
        console.log("Rotating to:", rotationAngle.toFixed(1), "degrees");
    }, [rotationAngle]);

    const handleRotationStart = useCallback(() => {
        console.log("Rotation started");
        setIsRotating(true);
    }, []);

    const handleRotationEnd = useCallback(() => {
        setIsRotating(false);
    }, []);

    const handleRotationChange = useCallback((newAngle: number) => {
        const canvas: OpenMarchCanvas = window.canvas;
        const objectsToRotate = canvas.getActiveObjectsByType(CanvasMarcher);
        const rotatedObjects = rotate({
            objects: objectsToRotate.map((o) => {
                return { x: o.left!, y: o.top!, id: o.marcherObj.id };
            }),
            center: { x: 0, y: 0 },
            angle: newAngle,
        });
        canvas.setLocalCoordinates(rotatedObjects);
        setRotationAngle(newAngle);
    }, []);

    return (
        <div className="flex flex-col gap-8">
            <DragInput
                dragSensitivity={0.01}
                value={rotationAngle}
                onDragChange={handleRotationChange}
                onDragStart={handleRotationStart}
                onDragEnd={handleRotationEnd}
            />
        </div>
    );
}

export default MarcherRotationInput;
