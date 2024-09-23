import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";

export default class DefaultListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas;

    initiateListeners = () => {
        this.canvas.on("object:modified", this.handleObjectModified);
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
    };

    cleanupListeners = () => {
        // These any casts are here because the types are not lining up with the fabric types
        // It wants fabric.IEvent<Event> but the event is actually a fabric.IEvent<MouseEvent>
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
    };

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas;
        this.handleObjectModified = this.handleObjectModified.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    /**
     * Update the marcher's position when it is moved
     */
    handleObjectModified(fabricEvent: fabric.IEvent<MouseEvent>) {
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

        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
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

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;
        // Don't move the canvas if the mouse is on a marcher
        if (OpenMarchCanvas.selectionHasObjects(fabricEvent)) {
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
