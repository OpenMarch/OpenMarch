import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../OpenMarchCanvas";
import CanvasMarcher from "../CanvasMarcher";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";

export default class DefaultListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas;

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas;
        this.handleSelect = this.handleSelect.bind(this);
        this.handleDeselect = this.handleDeselect.bind(this);
        this.handleObjectModified = this.handleObjectModified.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    /**
     * Set the selected marcher(s) when selected element changes.
     */
    handleSelect(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!fabricEvent.selected || fabricEvent.selected.length === 0) return;

        const canvasMarchersToSelect: CanvasMarcher[] =
            this.canvas.getActiveObjectsByType(CanvasMarcher);

        this.canvas.setSelectedCanvasMarchers(canvasMarchersToSelect);
    }

    /**
     * Set the selected marchers to none when the selection is cleared
     */
    handleDeselect(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (fabricEvent.deselected) {
            this.canvas.setGlobalsSelectedMarchers([]);
        }
    }

    handleObjectModified(fabricEvent: fabric.IEvent<MouseEvent>) {
        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];

        /*
            ---- Determine if the mouse was clicked or dragged ----
            If the mouse was clicked, likely the user does not want to move the marcher
            This prevents the marcher from moving a little bit when it's just trying to be selected
        */
        // Check if the timing threshold has past before checking the distance (saves compute)
        if (
            Date.now() - this.canvas.selectDragStart.time <
            this.canvas.DRAG_TIMER_MILLISECONDS
        ) {
            const mouseDistance = Math.sqrt(
                (fabricEvent.e.clientX - this.canvas.selectDragStart.x) ** 2 +
                    (fabricEvent.e.clientY - this.canvas.selectDragStart.y) ** 2
            );
            // Check if the mouse has moved more than the threshold
            if (mouseDistance < this.canvas.DISTANCE_THRESHOLD) {
                // If the mouse was clicked and not dragged, return and don't update the marcher
                this.canvas.refreshMarchers();
                return;
            }
        }

        this.canvas
            .getActiveObjectsByType(CanvasMarcher)
            .forEach((activeCanvasMarcher) => {
                // If the active object is not a marcher, return
                if (!(activeCanvasMarcher instanceof CanvasMarcher)) return;

                const newCoords = activeCanvasMarcher.getMarcherCoords();
                modifiedMarcherPages.push({
                    marcher_id: activeCanvasMarcher.marcherObj.id,
                    page_id: activeCanvasMarcher.marcherPage.page_id,
                    x: newCoords.x,
                    y: newCoords.y,
                });
            });

        MarcherPage.updateMarcherPages(modifiedMarcherPages);
    }

    // /**
    //  * Set the canvas to dragging mode on mousedown.
    //  */
    //andleMouseDown = (fabricEvent: fabric.IEvent<MouseEvent>) {
    //     // if (!isDrawing.current) {
    //     //     const pointer = this.canvas.getPointer(fabricEvent.e);
    //     //     const points = [pointer.x, pointer.y, pointer.x, pointer.y];

    //     //     // Create the initial line
    //     //     activeLine.current = new fabric.Line(points, {
    //     //         strokeWidth: 2,
    //     //         fill: "black",
    //     //         stroke: "black",
    //     //         originX: "center",
    //     //         originY: "center",
    //     //     });

    //     //     this.canvas.add(activeLine);
    //     //     isDrawing.current = true;
    //     // } else {
    //     //     // Finalize the line
    //     //     activeLine.current = null;
    //     // }
    //     // default cursor mode
    //     const evt = fabricEvent.e;

    //     // fabricEvent.target checks if the mouse is on the canvas at all
    //     // Don't move the canvas if the mouse is on a marcher or a group of marchers
    //     const isMarcherSelection =
    //         fabricEvent.target &&
    //         (fabricEvent.target instanceof CanvasMarcher ||
    //             // Checks if, when a group is selected, any of the objects in the group are CanvasMarchers
    //             // Will not work when selecting multiple items that aren't marchers
    //             (!!(fabricEvent.target as any)._objects &&
    //                 (fabricEvent.target as any)._objects.some(
    //                     (obj: any) => obj instanceof CanvasMarcher
    //                 )));
    //     if (!isMarcherSelection && !evt.shiftKey) {
    //         this.canvas.isDragging = true;
    //         this.canvas.selection = false;
    //         this.canvas.panDragStartPos = {
    //             x: evt.clientX,
    //             y: evt.clientY,
    //         };
    //     }
    // };

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;
        // Don't move the canvas if the mouse is on a marcher
        if (OpenMarchCanvas.selectionHasMarchers(fabricEvent)) {
            this.canvas.selectDragStart = {
                x: evt.clientX,
                y: evt.clientY,
                time: Date.now(),
            };
        } else if (!evt.shiftKey) {
            // If no marcher is selected and the shift key is not pressed, move the canvas with the mouse
            this.canvas.isDragging = true;
            this.canvas.selection = false;
            this.canvas.panDragStartPos = { x: evt.clientX, y: evt.clientY };
        }
    }

    /**
     * Move the canvas on mouse:move when in dragging mode
     */
    handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (this.canvas.isDragging) {
            const e = fabricEvent.e;
            const vpt = this.canvas.viewportTransform;
            if (!vpt) {
                console.error(
                    "Viewport transform not set - handleMouseMove: Canvas.tsx"
                );
                return;
            }
            vpt[4] += e.clientX - this.canvas.panDragStartPos.x;
            vpt[5] += e.clientY - this.canvas.panDragStartPos.y;
            this.canvas.requestRenderAll();
            this.canvas.panDragStartPos = { x: e.clientX, y: e.clientY };
        }
    }

    /**
     * Handler for the mouse up event
     * Disables dragging and re-enables selection
     *
     * If the mouse was only clicked and not dragged, select the marcher and do not move it
     */
    handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!this.canvas.viewportTransform) {
            console.error(
                "Viewport transform is not set. This will cause issues with panning around the canvas."
            );
            return;
        }
        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        this.canvas.setViewportTransform(this.canvas.viewportTransform);
        this.canvas.isDragging = false;
        this.canvas.selection = true;
    }
}
