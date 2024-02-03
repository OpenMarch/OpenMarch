// A collection of interfaces and types used throughout the application
import { Constants } from "./Constants";

/*********************** Page ***********************/
/**
 * Defines all of the data associated with a page in the database.
 */
export interface Page {
    id: number;
    id_for_html: string;
    name: string;
    counts: number;
    order: number;
    tempo?: number; // TODO implement
    time_signature?: string; // TODO implement
    notes?: string;
}

/**
 * Defines the required fields of a new page.
 */
export interface NewPage {
    name: string;
    counts: number;
    tempo: number;
    time_signature: string;
    notes?: string;
}

/**
 * Defines the editable fields of a page.
 */
export interface UpdatePage {
    /**
     * The id of the page to update. Read only.
     */
    id: number;
    name?: string;
    counts?: number;
    // order?: number; // TODO implement
    tempo?: number;
    time_signature?: string;
    notes?: string;
}

/*********************** Marcher ***********************/
/**
 * Defines all of the data associated with a marcher in the database.
 */
export interface Marcher {
    id: number;
    id_for_html: string;
    name: string;
    section: string;
    drill_number: string;
    drill_prefix: string;
    drill_order: number;
    notes?: string;
    year?: number;
}

/**
 * Defines the required fields of a new marcher.
 */
export interface NewMarcher {
    name: string;
    section: string;
    drill_prefix: string;
    drill_order: number;
    notes?: string;
    year?: number;
}

/**
 * Defines the editable fields of a marcher.
 */
export interface UpdateMarcher {
    /**
     * The id of the marcher to update. Read only.
     */
    id: number;
    name?: string;
    section?: string;
    drill_prefix?: string;
    drill_order?: number;
    year?: number;
    notes?: string;
}

/*********************** MarcherPage ***********************/
/**
 * Defines all of the data associated with a marcherPage in the database.
 */
export interface MarcherPage {
    id: number;
    id_for_html: string;
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    notes?: string;
}

/**
 * Defines data needed for updating a marcherPage in the database.
 */
export interface UpdateMarcherPage {
    /**
     * The id of the marcher for the marcherPage. Read only.
     */
    marcher_id: number;
    /**
     * The id of the page for the marcherPage. Read only.
     */
    page_id: number;
    x: number;
    y: number;
    notes?: string;
}

/*********************** Canvas ***********************/

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
 * Describes the canvas locations of football field checkpoints.
 */
export interface FieldProperties {
    frontSideline: number;
    frontHash: number;
    backHash: number;
    backSideline: number;
    originX: number,
    originY: number,
    pixelsPerStep: number;
    /**
     * The accuracy to round the steps to. Highest accuracy is .1.
     * Note: the canvas is actually displaying the dots to the nearest (0.1) tenth.
     * (4 -> nearest .25), (2 -> nearest .5), (10 -> nearest .1)
     */
    roundFactor: number; // 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1
    width: number;
    height: number;
    stepsBetweenLines: number;
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

export interface UiSettings {
    lockX: boolean;
    lockY: boolean;
    isPlaying: boolean;
}


/*********************** Other ***********************/
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

export interface topBarComponentProps {
    className?: string;
}
