import { useState, useCallback } from "react";
import { DragInput } from "@openmarch/ui";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import { rotateGroup } from "@/global/classes/canvasObjects/GroupUtils";

function MarcherRotationInput({
    selectedMarchers,
    marcherPages,
    selectedPage,
}: {
    selectedMarchers: Marcher[];
    marcherPages: MarcherPage[];
    selectedPage: Page;
}) {
    const [rotationAngle, setRotationAngle] = useState<number>(0);
    const [isRotating, setIsRotating] = useState(false);

    const handleRotation = useCallback(() => {
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
        if (canvas.activeGroup) {
            rotateGroup({
                group: canvas.activeGroup,
                angle: newAngle,
            });
        }
    }, []);

    return (
        <div className="flex flex-col gap-8">
            <DragInput
                dragSensitivity={0.1}
                value={rotationAngle}
                onDragChange={handleRotationChange}
                onDragStart={handleRotationStart}
                onDragEnd={handleRotationEnd}
            />
        </div>
    );
}

export default MarcherRotationInput;
