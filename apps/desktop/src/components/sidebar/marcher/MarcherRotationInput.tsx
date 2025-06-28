import { useState, useCallback, useEffect } from "react";
import { DragInput } from "@openmarch/ui";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { rotateGroup } from "@/global/classes/canvasObjects/GroupUtils";
import { fabric } from "fabric";
import DefaultListeners from "@/components/canvas/listeners/DefaultListeners";

function MarcherRotationInput() {
    const [rotationAngle, setRotationAngle] = useState<number>(0);
    const [activeGroup, setActiveGroup] = useState<fabric.Group | null>(null);

    const handleRotationChange = useCallback(
        (newAngle: number) => {
            if (activeGroup) {
                rotateGroup({
                    group: activeGroup,
                    angle: newAngle,
                });
            }
        },
        [activeGroup],
    );

    useEffect(() => {
        const canvas: OpenMarchCanvas = window.canvas;

        const handleGroupSelection = (e: fabric.IEvent) => {
            const group = (e as any).group as fabric.Group | null;
            setActiveGroup(group);
            setRotationAngle(group?.angle || 0);
        };

        canvas.on("group:selection", handleGroupSelection);

        // Set initial group
        if (canvas.activeGroup) {
            setActiveGroup(canvas.activeGroup);
            setRotationAngle(canvas.activeGroup.angle || 0);
        }

        return () => {
            canvas.off("group:selection", handleGroupSelection);
        };
    }, []);

    useEffect(() => {
        if (!activeGroup) return;

        const updateAngle = () => {
            setRotationAngle(activeGroup.angle || 0);
        };

        activeGroup.on("rotating", updateAngle);
        activeGroup.on("modified", updateAngle);

        return () => {
            activeGroup.off("rotating", updateAngle);
            activeGroup.off("modified", updateAngle);
        };
    }, [activeGroup]);

    function handleRotationDragEnd() {
        if (!activeGroup) {
            console.error("No group selected");
            return;
        }
        const canvas = activeGroup.canvas as OpenMarchCanvas;
        if (canvas.listeners instanceof DefaultListeners) {
            canvas.listeners.handleObjectModified();
        }
        setRotationAngle(activeGroup.angle ?? 0);
    }

    return (
        <div className="flex flex-col gap-8">
            <DragInput
                dragSensitivity={0.5}
                dragSensitivityWithShift={0.1}
                value={Math.round(rotationAngle) % 360}
                roundToNearest={15}
                roundToNearestWithShift={1}
                onDragChange={(value) => {
                    handleRotationChange(value);
                }}
                onChange={(value) => {
                    handleRotationChange(value);
                }}
                onBlur={handleRotationDragEnd}
                onDragEnd={handleRotationDragEnd}
                disabled={!activeGroup}
            />
        </div>
    );
}

export default MarcherRotationInput;
