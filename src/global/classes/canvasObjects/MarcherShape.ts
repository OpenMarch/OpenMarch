import OpenMarchCanvas from "./OpenMarchCanvas";
import { ShapePage } from "electron/database/tables/ShapePageTable";
import { ShapePoint, StaticMarcherShape } from "./StaticMarcherShape";

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
    static fetchShapePages: () => Promise<void>;

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
        this.refreshMarchers();
    }

    /**
     * Refreshes the marchers associated with the current ShapePage.
     *
     * Fetches the marcher IDs from the database, sorts them by position order,
     * and maps them to the corresponding CanvasMarcher instances on the canvas.
     */
    async refreshMarchers() {
        const spmsResponse = await window.electron.getShapePageMarchers(
            this.shapePage.id,
        );
        if (!spmsResponse.success) {
            console.error(spmsResponse.error);
            return;
        }
        const marcherIds = spmsResponse.data
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
    /****************** DATABASE FUNCTIONS *******************/
    /**
     * Fetches all of the ShapePages from the database.
     * This is attached to the ShapePage store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static async getShapePages() {
        return await window.electron.getShapePages();
    }

    /**
     * Checks if fetchPages is defined. If not, it logs an error to the console.
     */
    static checkForFetchShapePages() {
        if (!this.fetchShapePages)
            console.error(
                "fetchShapePages is not defined. The UI will not update properly.",
            );
    }

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
    static async createMarcherShape({
        pageId,
        marcherIds,
        start,
        end,
    }: {
        pageId: number;
        marcherIds: number[];
        start: { x: number; y: number };
        end: { x: number; y: number };
    }) {
        try {
            const createShapeResponse = await window.electron.createShapes([
                {},
            ]);
            if (!createShapeResponse.success)
                throw new Error(
                    `Error creating StaticMarcherShape: ${createShapeResponse.error?.message}`,
                );
            const svgPath = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            const createShapePageResponse =
                await window.electron.createShapePages([
                    {
                        shape_id: createShapeResponse.data[0].id,
                        page_id: pageId,
                        svg_path: svgPath,
                    },
                ]);
            if (!createShapePageResponse.success) {
                window.electron.deleteShapes(
                    new Set([createShapeResponse.data[0].id]),
                );
                throw new Error(
                    `Error creating StaticMarcherShape: ${createShapeResponse.error?.message}`,
                );
            }
            const spmsToCreate = marcherIds.map((marcher_id, i) => {
                return {
                    shape_page_id: createShapePageResponse.data[0].id,
                    marcher_id,
                    position_order: i,
                };
            });
            const createSpmResponse =
                await window.electron.createShapePageMarchers(spmsToCreate);
            if (!createSpmResponse.success) {
                window.electron.deleteShapes(
                    new Set([createShapeResponse.data[0].id]),
                );
                window.electron.deleteShapePages(
                    new Set([createShapePageResponse.data[0].id]),
                );
                throw new Error(
                    `Error creating StaticMarcherShape: ${createSpmResponse.error?.message}`,
                );
            }
        } catch (error: any) {
            console.error(`Error creating StaticMarcherShape - ${error}`);
        }
        this.checkForFetchShapePages();
        this.fetchShapePages();
    }

    /**
     * Updates the SVG path of a MarcherShape object in the canvas.
     * @param marcherShape - The MarcherShape object to update.
     * @returns - A Promise that resolves when the update is complete, or rejects with an error message.
     */
    static async updateMarcherShape(marcherShape: MarcherShape) {
        const updateResponse = await window.electron.updateShapePages([
            {
                id: marcherShape.shapePage.id,
                svg_path: marcherShape.shapePath.toString(),
            },
        ]);
        if (!updateResponse.success)
            console.error(
                `Error updating StaticMarcherShape - ${updateResponse.error}`,
            );
        this.checkForFetchShapePages();
        this.fetchShapePages();
    }

    /**
     * Deletes a MarcherShape object from the canvas.
     * @param marcherShape - The MarcherShape object to delete.
     * @returns - A Promise that resolves when the deletion is complete, or rejects with an error message.
     */
    static async deleteMarcherShape(marcherShape: MarcherShape) {
        const deleteResponse = await window.electron.deleteShapes(
            new Set([marcherShape.shapePage.shape_id]),
        );
        if (!deleteResponse.success)
            console.error(
                `Error deleting StaticMarcherShape - ${deleteResponse.error}`,
            );
        this.checkForFetchShapePages();
        this.fetchShapePages();
    }
}
