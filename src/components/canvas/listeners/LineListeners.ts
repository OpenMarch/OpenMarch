import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import CanvasListeners from "./CanvasListeners";
import DefaultListeners from "./DefaultListeners";
import { fabric } from "fabric";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

/**
 * LineListeners is an extension of DefaultListeners that handles the creation of lines on the canvas
 */
export default class LineListeners
    extends DefaultListeners
    implements CanvasListeners
{
    /** Boolean to keep track of if a line is being drawn */
    private _isDrawing = false;
    private _activeLine: MarcherLine | null = null;

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        super({ canvas });
        this.canvas.setCursor("crosshair");
        this.canvas.defaultCursor = "crosshair";

        window.addEventListener("keydown", this.handleKeyDown);
    }

    initiateListeners = () => {
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
    };

    cleanupListeners = () => {
        this.clearLine();
        this.canvas.selection = true;
        this.canvas.resetCursorsToDefault();

        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
    };

    /** Discards the current active line */
    clearLine = () => {
        if (this._isDrawing && this._activeLine) {
            this.canvas.remove(this._activeLine);
            this._activeLine = null;
            this._isDrawing = false;
        }
    };

    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        // Left click
        if (fabricEvent.e.button === 0) {
            // Performing normal mouse down if ctrl or meta key is pressed
            if (fabricEvent.e.ctrlKey || fabricEvent.e.metaKey) {
                super.handleMouseDown(fabricEvent);
                return;
            }
            if (!this._isDrawing) {
                const pointer = this.canvas.getPointer(fabricEvent.e);
                // Create the initial line
                this._activeLine = new MarcherLine({
                    x1: pointer.x,
                    y1: pointer.y,
                    x2: pointer.x,
                    y2: pointer.y,
                    startPageId: this.canvas.currentPage.id,
                    endPageId: this.canvas.currentPage.id,
                });

                this.canvas.add(this._activeLine);
                this._activeLine.editable = false;
                // Disable group selection while drawing
                this.canvas.selection = false;
                this._activeLine.setToNearestStep({
                    pointOne: { x: pointer.x, y: pointer.y },
                });
                this._isDrawing = true;
            } else {
                // Finalize the line
                console.log("Finalizing line", this._activeLine);
                if (this._activeLine) {
                    MarcherLine.create([this._activeLine]);
                    this._activeLine.editable = true;
                }
                this._activeLine = null;
                this._isDrawing = false;
                this.canvas.selection = true;
            }
        }
        // Right click
        else if (fabricEvent.e.button === 2) {
            this.clearLine();
        }
    }

    handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (this.canvas.isDragging) super.handleMouseMove(fabricEvent);
        else if (this._isDrawing && this._activeLine) {
            const pointer = this.canvas.getPointer(fabricEvent.e);
            this._activeLine.setToNearestStep({
                pointTwo: {
                    x: pointer.x,
                    y: pointer.y,
                },
            });
            this.canvas.requestRenderAll();
        }
    }

    handleKeyDown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === "Escape") this.clearLine();
    };
}
