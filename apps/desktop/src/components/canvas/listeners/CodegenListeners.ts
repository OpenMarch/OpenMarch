import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { fabric } from "fabric";

/**
 * Attaches mouse listeners to the canvas to log Playwright codegen actions.
 * @param canvas The OpenMarchCanvas instance.
 * @returns A cleanup function to remove the listeners.
 */
export function attachCodegenListeners(canvas: OpenMarchCanvas) {
    console.log("[CodegenListeners] Attaching codegen listeners to canvas");
    let isDragging = false;

    const handleMouseDown = (options: fabric.IEvent) => {
        console.log("[CodegenListeners] Mouse down event:", {
            target: options.target?.type,
            pointer: options.pointer,
            isDragging,
        });

        if (options.target) {
            isDragging = true;
            const { x, y } = options.pointer as fabric.Point;
            console.log("[CodegenListeners] Starting drag at coordinates:", {
                x,
                y,
            });

            const moveAction = `await page.mouse.move(${x}, ${y});`;
            const downAction = `await page.mouse.down();`;

            console.log("[CodegenListeners] Adding codegen actions:", {
                moveAction,
                downAction,
            });
            window.electron.codegen.addMouseAction(moveAction);
            window.electron.codegen.addMouseAction(downAction);
        }
    };

    const handleMouseMove = (options: fabric.IEvent) => {
        if (isDragging) {
            const { x, y } = options.pointer as fabric.Point;
            console.log("[CodegenListeners] Mouse move during drag:", { x, y });

            const moveAction = `await page.mouse.move(${x}, ${y});`;
            console.log("[CodegenListeners] Adding move action:", moveAction);
            window.electron.codegen.addMouseAction(moveAction);
        }
    };

    const handleMouseUp = () => {
        console.log(
            "[CodegenListeners] Mouse up event, isDragging:",
            isDragging,
        );

        if (isDragging) {
            const upAction = `await page.mouse.up();`;
            console.log("[CodegenListeners] Adding up action:", upAction);
            window.electron.codegen.addMouseAction(upAction);
            isDragging = false;
            console.log(
                "[CodegenListeners] Drag ended, isDragging set to false",
            );
        }
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    console.log("[CodegenListeners] All listeners attached successfully");

    // Return a cleanup function
    return () => {
        console.log("[CodegenListeners] Cleaning up codegen listeners");
        canvas.off("mouse:down", handleMouseDown);
        canvas.off("mouse:move", handleMouseMove);
        canvas.off("mouse:up", handleMouseUp);
        console.log("[CodegenListeners] Listeners removed successfully");
    };
}
