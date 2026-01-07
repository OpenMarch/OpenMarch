import {
    FieldProperties,
    Checkpoint,
    MeasurementSystem,
    FieldTheme,
} from "@openmarch/core";

export interface GeneralTabProps {
    currentFieldProperties: FieldProperties;
    updateFieldProperties: (props: FieldProperties) => void;
    fieldProperties: FieldProperties | undefined;
    measurementSystem: MeasurementSystem;
    stepSizeInputRef: React.RefObject<HTMLInputElement | null>;
    blurOnEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface CheckpointsTabProps {
    currentFieldProperties: FieldProperties;
    updateFieldProperties: (props: FieldProperties) => void;
    updateCheckpoint: (args: {
        oldCheckpoint: Checkpoint;
        newCheckpoint: Checkpoint;
        axis: "x" | "y";
    }) => void;
    deleteCheckpoint: (checkpoint: Checkpoint) => void;
    addCheckpoint: (axis: "x" | "y") => void;
    sorter: (a: Checkpoint, b: Checkpoint) => number;
}

export interface ImageTabProps {
    currentFieldProperties: FieldProperties;
    updateFieldProperties: (props: FieldProperties) => void;
}

export interface ThemeTabProps {
    currentFieldProperties: FieldProperties;
    validateIsRgbaColor: (
        themeProperty: keyof FieldTheme,
        fieldProperties: FieldProperties,
    ) => boolean;
}
