// A collection of interfaces and types used throughout the application
import { Constants } from "./Constants";
type InterfaceConstType = typeof Constants;

export interface Page {
    id: number;
    id_for_html: string;
    name: string;
    counts: number;
    order: number;
    tableName: InterfaceConstType["PageTableName"];
    prefix: InterfaceConstType["PagePrefix"];
};

/**
 * An interface to use only for creating a page to the backend.
 */
export interface NewPage {
    name: string;
    counts: number;
};

export interface Marcher {
    id: number;
    id_for_html: string;
    name: string;
    instrument: string;
    drill_number: string;
    drill_prefix: string;
    drill_order: number;
    tableName: InterfaceConstType["MarcherTableName"];
    prefix: InterfaceConstType["MarcherPrefix"];
};

/**
 * An interface to use only for creating a marcher to the backend.
 */
export interface NewMarcher {
    name: string;
    instrument: string;
    drill_prefix: string;
    drill_order: number;
};

export interface MarcherPage {
    id: number;
    id_for_html: string;
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    tableName: InterfaceConstType["MarcherPageTableName"];
    prefix: InterfaceConstType["MarcherPagePrefix"];
}

/**
 * An interface to use only for updating a marcher page to the backend.
 */
export interface UpdateMarcherPage {
    x: number;
    y: number;
}

export interface ReadableCoords {
    /**
     * The yard line the marcher is guiding to.
     * (50, 45 ... 0)
     */
    yardLine: number;
    /**
     * The side of the field the marcher is on.
     * (1 or 2)
     */
    side: number;
    /**
     * The hash/sideline the marcher is guiding to.
     * (front sideline, front hash, back hash, or back sideline)
     */
    hash: string;
    /**
     * The way the marcher relates to the yard line.
     * (Inside or outside)
     */
    xDescription: string;
    /**
     * The way the marcher relates to the hash or sideline.
     * (in front of or behind)
     */
    yDescription: string;
    /**
     * The amount of steps the marcher is from the nearest yard line.
     */
    xSteps: number;
    /**
     * The amount of steps the marcher is from the nearest hash or sideline.
     */
    ySteps: number;
}

/**
 * Descripes the canvas locations of football field checkpoints.
 */
export interface fieldProperties {
    frontSideline: number;
    frontHash: number;
    backHash: number;
    backSideline: number;
    origin: { x: number, y: number };
    pixelsPerStep: number;
    /**
     * The accuracy to round the steps to. Highest accuracy is .1.
     * Note: the canvas is actually displaying the dots to the neareat (0.1) tenth.
     * (4 -> nearest .25), (2 -> nearest .5), (10 -> nearest .1)
     */
    roundFactor: number; // 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1
    width: number;
    height: number;
    stepsBetweenYardLines: number;
}

/**
 * An interface to use for the marcher objects on the canvas.
 */
export interface CanvasMarcher {
    fabricObject: fabric.Object | null;
    x: number;
    y: number;
    drill_number: string;
    id_for_html: string;
    marcher_id: number;
}

/**
 * This interface should be used when you want a form to be controlled by buttons in a parent component.
 */
export interface ListFormProps {
    /**
     * Whether or not the form should have a <h4> header defined in the component.
     */
    hasHeader?: boolean;
    isEditingProp?: boolean;
    setIsEditingProp?: React.Dispatch<React.SetStateAction<boolean>>;
    submitActivator?: boolean;
    setSubmitActivator?: React.Dispatch<React.SetStateAction<boolean>>;
    cancelActivator?: boolean;
    setCancelActivator?: React.Dispatch<React.SetStateAction<boolean>>;
}
