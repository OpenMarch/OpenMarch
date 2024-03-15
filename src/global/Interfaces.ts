/** A collection of interfaces and types used throughout the application */
/*********************** MarcherPage ***********************/
// /**
//  * Defines all of the data associated with a marcherPage in the database.
//  */
// export interface MarcherPage {
//     id: number;
//     id_for_html: string;
//     marcher_id: number;
//     page_id: number;
//     x: number;
//     y: number;
//     notes?: string;
// }

import { MarcherPage } from "./classes/MarcherPage";

// /**
//  * Defines data needed for updating a marcherPage in the database.
//  */
// export interface UpdateMarcherPage {
//     /**
//      * The id of the marcher for the marcherPage. Read only.
//      */
//     marcher_id: number;
//     /**
//      * The id of the page for the marcherPage. Read only.
//      */
//     page_id: number;
//     x: number;
//     y: number;
//     notes?: string;
// }

/*********************** Canvas ***********************/

export interface ReadableCoords {
    /**
     * The yard line the marcher is guiding to.pdata
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
    readonly frontSideline: number;
    readonly frontHash: number;
    readonly backHash: number;
    readonly backSideline: number;
    readonly originX: number,
    readonly originY: number,
    readonly pixelsPerStep: number;
    /**
     * The accuracy to round the coordinates to. Highest accuracy is (0.1).
     *
     * Note: This is the round factor of the pixel values, not steps. 14.5 pixels / pixelsPerStep.
     * (4 -> nearest .25), (2 -> nearest .5), (10 -> nearest .1)
     */
    readonly roundFactor: number; // 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1
    readonly width: number;
    readonly height: number;
    readonly stepsBetweenLines: number;
}

/**
 * An interface to use for the marcher objects on the canvas.
 */
export interface CanvasMarcher {
    fabricGroupObject: fabric.Object | null;
    marcherPage: MarcherPage;
    drill_number: string;
    id_for_html: string;
    id: number;
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
    /**
     * React state to control the editing state of the form and replace its internal state.
     */
    isEditingStateProp?: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
    /**
     * React state to trigger a submit of the list form from a parent component.
     */
    submitActivatorStateProp?: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
    /**
     * React state to trigger a cancel of the editing in a list form from a parent component.
     */
    cancelActivatorStateProp?: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
}

export interface topBarComponentProps {
    className?: string;
}

export interface Section {
    family: string;
    name: string;
    scoreOrder: number;
    prefix: string;
}
