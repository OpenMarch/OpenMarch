/**
 * This interface is used to define what properties an object must have to be selectable on the canvas.
 */
export interface ISelectable extends fabric.Object {
    /**
     * A string defining what class the object is. E.g. "MarcherLine" or "Marcher"
     */
    readonly classString: SelectableClasses;
    /**
     * TODO - this only exists for the Marcher -> CanvasMarcher relationship.
     * Try to combine those classes and remove this maybe?
     *
     * @returns The object that should be selected in global state when this object is selected.
     */
    readonly objectToGloballySelect: { id: number };
    /** The id of the object in the database */
    readonly id: number;
}

/**
 * Returns a string ID that can be used to distinguish between classes.
 *
 * @param obj The ISelectable object to get the class id for
 * @returns string: "{classString}_{id}" -> "marcher_13"
 */
export const getClassId = (obj: ISelectable) => `${obj.classString}_${obj.id}`;

/**
 * Checks if the object is an instance of ISelectable
 *
 * @param object The object to check if it is an instance of ISelectable
 * @returns boolean
 */
export const isSelectable = (object: any): object is ISelectable => {
    return (
        "classString" in object &&
        "objectToGloballySelect" in object &&
        "id" in object
    );
};

export enum SelectableClasses {
    MARCHER = "Marcher",
    MARCHER_SHAPE = "MarcherShape",
}
