import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import CanvasListeners from "./CanvasListeners";
import DefaultListeners from "./DefaultListeners";
import { fabric } from "fabric";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";
import { rgbaToString } from "@openmarch/core";
import MarcherPage from "@/global/classes/MarcherPage";

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
    /** All of the pathways for the active line keyed by the marcherId */
    private _pathways = new Map<number, fabric.Object>();
    private _midpoints = new Map<number, fabric.Object>();
    private _endpoints = new Map<number, fabric.Object>();

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        super({ canvas });
        this.canvas.setCursor("crosshair");
        this.canvas.staticGridRef.hoverCursor = "crosshair";

        // Make all of the canvas marchers unselectable
        this.canvas.getCanvasMarchers().forEach((canvasMarcher) => {
            canvasMarcher.makeUnselectable();
        });

        window.addEventListener("keydown", this.handleKeyDown);
    }

    initiateListeners = () => {
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("object:modified", this.handleObjectModified);
        this.canvas.on("mouse:up", this.handleMouseUp);
    };

    cleanupListeners = () => {
        this.clearLine();
        this.clearPathwaysAndStaticMarchers();
        this.canvas.selection = true;
        this.canvas.resetCursorsToDefault();

        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
    };

    /** Discards the current active line */
    clearLine = () => {
        if (this._activeLine) {
            this.canvas.remove(this._activeLine);
            this._activeLine = null;
            this._isDrawing = false;
        }
    };

    refreshMarchers = () => {
        this.drawNewMarcherPaths();
    };

    /**
     * Clears the static marchers, pathways, and their midpoints from the marchers to the active line
     */
    clearPathwaysAndStaticMarchers = () => {
        this._pathways.forEach((pathway) => {
            this.canvas.remove(pathway);
        });
        this._midpoints.forEach((midpoint) => {
            this.canvas.remove(midpoint);
        });
        this._pathways.clear();
        this._midpoints.clear();

        this._endpoints.forEach((staticMarcher) => {
            this.canvas.remove(staticMarcher);
        });
        this._endpoints.clear();
    };

    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        // Left click
        if (fabricEvent.e.button === 0) {
            // Performing normal mouse down if ctrl or meta key is pressed
            if (
                fabricEvent.e.ctrlKey ||
                fabricEvent.e.metaKey ||
                (!this._isDrawing && this._activeLine)
            ) {
                super.handleMouseDown(fabricEvent);
                return;
            }
            if (!this._isDrawing && !this._activeLine) {
                const pointer = this.canvas.getPointer(fabricEvent.e);
                // Create the initial line
                this._activeLine = new MarcherLine({
                    x1: pointer.x,
                    y1: pointer.y,
                    x2: pointer.x,
                    y2: pointer.y,
                    color: rgbaToString(
                        this.canvas.fieldProperties.theme.shape,
                    ),
                    startPageId: this.canvas.currentPage.id,
                    endPageId: this.canvas.currentPage.id,
                });

                this.canvas.add(this._activeLine);
                this._activeLine.editable = false;
                // Disable group selection while drawing
                this.canvas.selection = false;

                // Snap to the nearest step, unless the shift key is being held down
                if (fabricEvent.e.shiftKey) {
                    this._activeLine.set({
                        x1: pointer.x,
                        y1: pointer.y,
                    });
                } else {
                    this._activeLine.setToNearestStep({
                        pointOne: { x: pointer.x, y: pointer.y },
                    });
                }
                this._isDrawing = true;
            } else {
                // Finalize the line
                this.drawNewMarcherPaths();

                this._isDrawing = false;

                // Make canvasMarchers selectable again
                this.canvas.getCanvasMarchers().forEach((canvasMarcher) => {
                    canvasMarcher.makeSelectable();
                });
                this.canvas.staticGridRef.hoverCursor = "default";

                this.canvas.selection = true;
            }
        }
        // Right click
        else if (fabricEvent.e.button === 2) {
            this.clearLine();
        }
    }

    /**
     * Draws the new marcher paths for the active line
     */
    drawNewMarcherPaths() {
        if (!this._activeLine) return;
        if (this.canvas.eventMarchers.length < 2) {
            console.error(
                `Cannot create a marcherLine of < 2 marchers. Only found ${this.canvas.eventMarchers.length}`,
                this.canvas.eventMarchers,
            );
            return;
        }
        this.clearPathwaysAndStaticMarchers();
        const oldDots = this.canvas.eventMarchers.map((canvasMarcher) => {
            return {
                ...canvasMarcher.coordinate,
                ...canvasMarcher.getMarcherCoords(),
            } as MarcherPage;
        });

        // If the line has more of a vertical slope, sort from top to bottom
        // If the line has a more horizontal slop, sort from left to right
        enum SortingDirectionEnum {
            leftToRight,
            topToBottom,
            rightToLeft,
            bottomToTop,
        }
        const coordinates = this._activeLine.getCoordinates();
        let sortingDirection: SortingDirectionEnum =
            SortingDirectionEnum.leftToRight;

        // check first that x1 and x2 aren't the same to avoid a divide by zero error
        if (coordinates.x1 === coordinates.x2) {
            if (coordinates.y1 < coordinates.y2)
                sortingDirection = SortingDirectionEnum.topToBottom;
            else sortingDirection = SortingDirectionEnum.bottomToTop;
        } else {
            const slope =
                (coordinates.y2 - coordinates.y1) /
                (coordinates.x2 - coordinates.x1);

            if (Math.abs(slope) > 1) {
                if (coordinates.y1 < coordinates.y2)
                    sortingDirection = SortingDirectionEnum.topToBottom;
                else sortingDirection = SortingDirectionEnum.bottomToTop;
            } else {
                if (coordinates.x1 < coordinates.x2)
                    sortingDirection = SortingDirectionEnum.leftToRight;
                else sortingDirection = SortingDirectionEnum.rightToLeft;
            }
        }

        switch (sortingDirection) {
            case SortingDirectionEnum.leftToRight:
                oldDots.sort((a, b) => a.x - b.x);
                break;
            case SortingDirectionEnum.topToBottom:
                oldDots.sort((a, b) => a.y - b.y);
                break;
            case SortingDirectionEnum.rightToLeft:
                oldDots.sort((a, b) => b.x - a.x);
                break;
            case SortingDirectionEnum.bottomToTop:
                oldDots.sort((a, b) => b.y - a.y);
                break;
        }
        const newDots = this._activeLine.distributeMarchers(oldDots);
        const gridOffset = this._activeLine.gridOffset;
        const offsetNewDots = newDots.map((dot) => {
            return { ...dot, x: dot.x - gridOffset, y: dot.y - gridOffset };
        });

        // Draw temporary pathways and midpoints from marchers to the active line
        let createdPathways: Pathway[] = [];
        let createdMidpoints: Midpoint[] = [];
        let createdEndpoints: Endpoint[] = [];

        for (let i = 0; i < oldDots.length; i++) {
            const [pathway, midpoint, endpoint] =
                this.canvas.renderTemporaryPathVisuals({
                    start: oldDots[i],
                    end: offsetNewDots[i],
                    marcherId: oldDots[i].marcher_id,
                    color: rgbaToString(
                        this.canvas.fieldProperties.theme.tempPath,
                    ),
                    strokeWidth: 2,
                    dashed: true,
                });
            createdPathways.push(pathway as Pathway);
            createdMidpoints.push(midpoint as Midpoint);
            createdEndpoints.push(endpoint as Endpoint);
        }
        this._pathways = new Map<number, fabric.Object>(
            createdPathways.map((pathway) => [pathway.marcherId, pathway]),
        );
        this._midpoints = new Map<number, fabric.Object>(
            createdMidpoints.map((midpoint) => [midpoint.marcherId, midpoint]),
        );
        this._endpoints = new Map<number, fabric.Object>(
            createdEndpoints.map((endpoint) => [endpoint.marcherId, endpoint]),
        );

        this.canvas.sendCanvasMarchersToFront();
        this.canvas.setGlobalNewMarcherPages(newDots);
    }

    handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (this.canvas.isDragging) super.handleMouseMove(fabricEvent);
        else if (this._isDrawing && this._activeLine) {
            const pointer = this.canvas.getPointer(fabricEvent.e);

            // Snap to the nearest step, unless the shift key is being held down
            if (fabricEvent.e.shiftKey) {
                this._activeLine.set({
                    x2: pointer.x,
                    y2: pointer.y,
                });
            } else {
                this._activeLine.setToNearestStep({
                    pointTwo: {
                        x: pointer.x,
                        y: pointer.y,
                    },
                });
            }

            this.canvas.requestRenderAll();
        }
    }

    handleObjectModified(fabricEvent: fabric.IEvent<MouseEvent>): void {
        super.handleObjectModified(fabricEvent);
        this.drawNewMarcherPaths();
    }

    handleKeyDown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === "Escape") this.clearLine();
    };

    handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>): void {
        super.handleMouseUp(fabricEvent);
    }
}
