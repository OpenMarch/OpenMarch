/** A collection of interfaces and types used throughout the application */

/*********************** Canvas ***********************/

export interface UiSettings {
    lockX: boolean;
    lockY: boolean;
    isPlaying: boolean;
    /** Boolean to view previous page's paths/dots */
    previousPaths: boolean,
    /** Boolean to view next page's paths/dots */
    nextPaths: boolean
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
