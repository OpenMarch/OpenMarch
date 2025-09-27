import {
    createShapePages,
    ModifiedShapePageArgs,
    ShapePage,
} from "@/db-functions";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { ShapePath } from "./ShapePath";
import { ShapePoint } from "./ShapePoint";
import { StaticMarcherShape, VanillaPoint } from "./StaticMarcherShape";
import { SvgCommandEnum } from "./SvgCommand";
import { shapePageKeys } from "@/hooks/queries";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/App";
import { db, schema } from "@/global/database/db";

/**
 * A MarcherShape is StaticMarcherShape that is stored in the database and updates the database as it is modified.
 */
export class MarcherShape extends StaticMarcherShape {
    /** The id of the current ShapePage */
    shapePage: ShapePage;
    /** The name of this shape. Optional */
    name?: string;
    /** Notes about this shape. Optional */
    notes?: string;

    /**
     * Fetches all of the ShapePages from the database.
     * This is attached to the ShapePage store and needs to be updated in a useEffect hook so that the UI is updated.
     */

    /**
     * Constructs a new `MarcherShape` instance with the provided `ShapePage` and `OpenMarchCanvas`.
     *
     * This constructor initializes the `MarcherShape` by parsing the `svg_path` property of the `ShapePage`
     * and passing it to the `StaticMarcherShape` constructor. It then sets the `shapePage` property and
     * calls the `refreshMarchers()` method to fetch and map the associated marchers.
     *
     * After construction, all of the items are added to the canvas.
     *
     * @param {Object} params - The parameters for constructing the `MarcherShape`.
     * @param {ShapePage} params.shapePage - The `ShapePage` associated with this `MarcherShape`.
     * @param {OpenMarchCanvas} params.canvas - The `OpenMarchCanvas` instance this `MarcherShape` is associated with.
     * @param {Page} params.page - The `Page` associated with this `MarcherShape`. Provide this to populate the isOnNextPage and isOnPreviousPage properties.
     * @param {Page[]} params.allShapePages - An array of all the `ShapePages` in the database. Provide this to populate the isOnNextPage and isOnPreviousPage properties.
     */
    constructor({
        shapePage,
        canvas,
    }: {
        shapePage: ShapePage;
        canvas: OpenMarchCanvas;
    }) {
        const points = ShapePoint.fromString(shapePage.svg_path);
        super({ canvas, canvasMarchers: [], points });
        this.shapePage = shapePage;
        void this.refreshMarchers();
    }

    /**
     * Refreshes the marchers associated with the current ShapePage.
     *
     * Fetches the marcher IDs from the database, sorts them by position order,
     * and maps them to the corresponding CanvasMarcher instances on the canvas.
     */
    async refreshMarchers() {
        if (!this.canvas) {
            console.error("refreshMarchers: Canvas is not defined.");
            return;
        }
        const spmsResponse = await db.query.shape_page_marchers.findMany({
            where: (table, { eq }) =>
                eq(table.shape_page_id, this.shapePage.id),
        });
        const marcherIds = spmsResponse
            .sort((a, b) => a.position_order - b.position_order)
            .map((spm) => spm.marcher_id);

        const canvasMarchersMap = new Map(
            this.canvas
                .getCanvasMarchersByIds(marcherIds)
                .map((spm) => [spm.id, spm]),
        );
        this.canvasMarchers = marcherIds.map((id) => {
            const spm = canvasMarchersMap.get(id);
            if (!spm) throw new Error(`Could not find marcher with id ${id}`);
            return spm;
        });
    }

    recreatePath(
        pathArg: VanillaPoint[],
        updateMarcherShapeFn?: (marcherShape: MarcherShape) => Promise<unknown>,
    ): ShapePath {
        // Disable control to prevent errors from non-existent control points
        const controlWasEnabled = this._controlEnabled;
        if (controlWasEnabled) this.disableControl();

        const newPath = super.recreatePath(pathArg);
        if (this.dirty) {
            void updateMarcherShapeFn?.(this);
            this.dirty = false;
        }

        // Re-enable control if it was enabled before
        if (controlWasEnabled) this.enableControl();
        return newPath;
    }

    /**
     * Adds a new segment to the shape path, determining the direction of the new segment based on the existing path.
     */
    async addSegment(
        updateMarcherShapeFn: (marcherShape: MarcherShape) => Promise<unknown>,
    ) {
        // Figure out if its pointing left or right
        const lastPoint =
            this.shapePath.points[this.shapePath.points.length - 1];
        let lastCoord: { x: number; y: number };
        if (lastPoint.command === SvgCommandEnum.CLOSE)
            // Make the last coordinates the first coordinates on close
            lastCoord = this.shapePath.points[0].coordinates[0];
        else
            lastCoord = lastPoint.coordinates[lastPoint.coordinates.length - 1];

        let secondToLastCoord: { x: number; y: number };
        if (lastPoint.command === SvgCommandEnum.CLOSE)
            secondToLastCoord = this.shapePath.points[0].coordinates[0];
        else if (lastPoint.coordinates.length > 1)
            secondToLastCoord =
                lastPoint.coordinates[lastPoint.coordinates.length - 2];
        else if (this.shapePath.points.length >= 2) {
            const secondToLastPoint =
                this.shapePath.points[this.shapePath.points.length - 2];
            secondToLastCoord =
                secondToLastPoint.coordinates[
                    secondToLastPoint.coordinates.length - 1
                ];
        } else secondToLastCoord = { x: 0, y: 0 };

        const isPointingRight = secondToLastCoord.x <= lastCoord.x;

        const newCoordinateOffset = isPointingRight
            ? { x: 250, y: 0 }
            : { x: -250, y: 0 };
        const newPoint = ShapePoint.Line({
            x: lastCoord.x + newCoordinateOffset.x,
            y: lastCoord.y + newCoordinateOffset.y,
        });

        this.setShapePathPoints([...this.shapePath.points, newPoint]);
        // set dirty to false so that the shape is not updated twice
        this.dirty = false;
        await updateMarcherShapeFn(this);
    }

    /**
     * Deletes a segment from the shape path at the specified index.
     *
     * @param index - The index of the segment to delete.
     */
    async deleteSegment(
        index: number,
        updateMarcherShapeFn: (marcherShape: MarcherShape) => Promise<unknown>,
    ) {
        this.setShapePathPoints(
            this.shapePath.points.filter((_, i) => i !== index),
        );
        // set dirty to false so that the shape is not updated twice
        this.dirty = false;
        await updateMarcherShapeFn(this);
    }

    /**
     * Updates a segment of the shape path with a new SVG command.
     *
     * @param index - The index of the segment to update.
     * @param newSvg - The new SVG command to apply to the segment.
     * @throws {Error} If the index is out of bounds or if the first point of the path is being edited.
     */
    updateSegment(
        {
            index,
            newSvg,
        }: {
            index: number;
            newSvg: SvgCommandEnum;
        },
        updateMarcherShapeFn: (marcherShape: MarcherShape) => Promise<unknown>,
    ) {
        if (index >= this.shapePath.points.length)
            throw new Error(
                `Index ${index} is out of bounds for path with length ${this.shapePath.points.length}`,
            );
        if (index === 0)
            throw new Error(`Cannot edit the first point of a path.`);

        const segment = this.shapePath.points[index];
        const lastCoord = segment.coordinates[segment.coordinates.length - 1];
        const prevSegment = this.shapePath.points[index - 1];
        const prevLastCoord =
            prevSegment.coordinates[prevSegment.coordinates.length - 1];
        const xDiff = lastCoord.x - prevLastCoord.x;
        const yDiff = lastCoord.y - prevLastCoord.y;

        let newSegment: ShapePoint;

        switch (newSvg) {
            case SvgCommandEnum.MOVE: {
                newSegment = ShapePoint.Move(lastCoord);
                break;
            }
            case SvgCommandEnum.LINE: {
                newSegment = ShapePoint.Line(lastCoord);
                break;
            }
            case SvgCommandEnum.QUADRATIC: {
                const midPoint = {
                    x: xDiff / 2 + prevLastCoord.x,
                    y: yDiff / 2 + prevLastCoord.y,
                };
                newSegment = ShapePoint.Quadratic(midPoint, lastCoord);
                break;
            }
            case SvgCommandEnum.CUBIC: {
                const point1 = {
                    x: xDiff / 3 + prevLastCoord.x,
                    y: yDiff / 3 + prevLastCoord.y,
                };
                const point2 = {
                    x: (xDiff / 3) * 2 + prevLastCoord.x,
                    y: (yDiff / 3) * 2 + prevLastCoord.y,
                };
                newSegment = ShapePoint.Cubic(point1, point2, lastCoord);
                break;
            }
            case SvgCommandEnum.CLOSE: {
                newSegment = ShapePoint.Close();
                break;
            }
            default:
                throw new Error(`Invalid SVG command: ${newSvg}`);
        }

        const newPoints = [...this.shapePath.points];
        newPoints[index] = newSegment;
        this.setShapePathPoints(newPoints);
        // set dirty to false so that the shape is not updated twice
        this.dirty = false;
        void updateMarcherShapeFn(this);
    }

    /**
     * Sets the current ShapePage and updates the shape with the SVG path from the ShapePage.
     * @param shapePage - The ShapePage to set as the current shape page.
     */
    setShapePage(shapePage: ShapePage) {
        this.shapePage = shapePage;
        this.updateWithSvg(shapePage.svg_path);
    }

    /****************** DATABASE FUNCTIONS *******************/
}

export const useCreateMarcherShape = () => {
    return useMutation({
        mutationFn: _createMarcherShape,
        onMutate: () => {
            queryClient.invalidateQueries({
                queryKey: shapePageKeys.all(),
            });
        },
    });
};

/**
 * Creates a new StaticMarcherShape on the canvas and associates it with the specified page and marchers.
 *
 * This method handles the creation of the shape, shape page, and the association of marchers to the shape page.
 * It ensures that the necessary database records are created and that the shape is properly initialized on the canvas.
 *
 * @param pageId - The ID of the page to associate the new shape with.
 * @param marcherIds - The IDs of the marchers to associate with the new shape.
 * @param start - The starting point of the shape, represented as an object with `x` and `y` properties.
 * @param end - The ending point of the shape, represented as an object with `x` and `y` properties.
 * @returns A Promise that resolves when the shape has been successfully created.
 */
async function _createMarcherShape({
    pageId,
    marcherIds,
    start,
    end,
    points,
}: {
    pageId: number;
    marcherIds: number[];
    start: { x: number; y: number };
    end: { x: number; y: number };
    points?: ShapePoint[];
}) {
    // If points are provided, use them to create the SVG path
    // Otherwise, fall back to creating a simple line
    const svgPath = points
        ? new ShapePath(points).toString()
        : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

    const itemIds: { id: number }[] = marcherIds.map((id) => {
        return { id };
    });
    const marcherCoordinates = MarcherShape.distributeAlongPath({
        svgPath,
        itemIds,
    }).map((marcherCoordinate) => {
        return {
            marcher_id: marcherCoordinate.id,
            x: marcherCoordinate.x,
            y: marcherCoordinate.y,
        };
    });
    await createShapePages({
        db,
        newItems: [
            {
                page_id: pageId,
                svg_path: svgPath,
                marcher_coordinates: marcherCoordinates,
            },
        ],
    });
}

/**
 * Updates the SVG path of a MarcherShape object in the canvas.
 * @param marcherShape - The MarcherShape object to update.
 * @returns - A Promise that resolves when the update is complete, or rejects with an error message.
 */
export function getUpdateMarcherShapeArgs(
    marcherShape: MarcherShape,
): ModifiedShapePageArgs | null {
    let marcherCoordinates: { marcher_id: number; x: number; y: number }[] = [];
    const canvasMarchers = marcherShape.canvasMarchers;

    if (canvasMarchers && canvasMarchers.length > 0) {
        const itemIds: { id: number }[] = marcherShape.canvasMarchers.map(
            (cm) => {
                return { id: cm.marcherObj.id };
            },
        );
        marcherCoordinates = MarcherShape.distributeAlongPath({
            svgPath: marcherShape.shapePath,
            itemIds,
        }).map((marcherCoordinate) => {
            return {
                marcher_id: marcherCoordinate.id,
                x: marcherCoordinate.x,
                y: marcherCoordinate.y,
            };
        });
    }

    if (!marcherShape.shapePage) {
        // This is really only to prevent the error  that prints from the update response
        return null;
    } else {
        return {
            id: marcherShape.shapePage.id,
            svg_path: marcherShape.shapePath.toString(),
            marcher_coordinates: marcherCoordinates,
        };
    }
}
