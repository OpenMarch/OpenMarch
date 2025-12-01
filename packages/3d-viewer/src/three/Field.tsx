import { useMemo } from "react";
import {
    FieldProperties,
    type Checkpoint,
    type RgbaColor,
} from "@openmarch/core";
import { Text } from "@react-three/drei";

// Helper function to convert RgbaColor to hex string for Three.js
const rgbaColorToHex = (color: RgbaColor): string => {
    const r = Math.round(color.r).toString(16).padStart(2, "0");
    const g = Math.round(color.g).toString(16).padStart(2, "0");
    const b = Math.round(color.b).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
};
const createDefaultHighSchoolField = (): FieldProperties => {
    const xCheckpoints: Checkpoint[] = [];
    let curId = 0;

    // Create yard lines (0 to 100 yards, every 5 yards)
    for (let yards = 0; yards <= 100; yards += 5) {
        const curYardLine = yards < 50 ? yards : 100 - yards;
        const stepsFromCenterFront = ((yards - 50) / 5) * 8;
        const label =
            curYardLine !== 0 && curYardLine % 10 === 0
                ? curYardLine.toString()
                : undefined;

        xCheckpoints.push({
            id: curId++,
            name: `${curYardLine} yard line`,
            axis: "x",
            terseName: `${curYardLine.toString()}`,
            stepsFromCenterFront: stepsFromCenterFront,
            useAsReference: true,
            visible: true,
            fieldLabel: label,
        });
    }

    // Create y checkpoints (hashes and sidelines)
    const yCheckpoints: Checkpoint[] = [
        {
            id: curId++,
            name: "front sideline",
            axis: "y",
            stepsFromCenterFront: 0,
            useAsReference: true,
            terseName: "FSL",
            visible: false,
        },
        {
            id: curId++,
            name: "HS front hash",
            axis: "y",
            stepsFromCenterFront: -28,
            useAsReference: true,
            terseName: "FH",
            visible: true,
        },
        {
            id: curId++,
            name: "HS back hash",
            axis: "y",
            stepsFromCenterFront: -56,
            useAsReference: true,
            terseName: "BH",
            visible: true,
        },
        {
            id: curId++,
            name: "grid back sideline",
            axis: "y",
            stepsFromCenterFront: -85,
            useAsReference: true,
            terseName: "grid:BSL",
            visible: false,
        },
        {
            id: curId++,
            name: "real back sideline",
            axis: "y",
            stepsFromCenterFront: -85.33,
            useAsReference: false,
            terseName: "real:BSL",
            visible: false,
        },
    ];

    // Use the FieldProperties constructor
    return new FieldProperties({
        name: "High school football field (no end zones)",
        xCheckpoints,
        yCheckpoints,
        yardNumberCoordinates: {
            homeStepsFromFrontToOutside: 11.2,
            homeStepsFromFrontToInside: 14.4,
            awayStepsFromFrontToInside: 70.9333,
            awayStepsFromFrontToOutside: 74.1333,
        },
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    });
};

const GRID_STROKE_WIDTH = 0.2;
const HASH_WIDTH_PIXELS = 10; // pixels in 2D, will convert to meters

interface FieldProps {
    fieldProperties?: FieldProperties;
    gridLines?: boolean;
    halfLines?: boolean;
}

export function Field({
    fieldProperties = createDefaultHighSchoolField(),
    gridLines = true,
    halfLines = true,
}: FieldProps) {
    // Convert steps to meters for 3D rendering
    const STEP_TO_METERS = fieldProperties.stepSizeInches * 0.0254;

    // Calculate pixels per step based on field dimensions
    const pixelsPerStep = fieldProperties.pixelsPerStep;
    const PIXEL_TO_METERS = STEP_TO_METERS / pixelsPerStep;

    const { fieldLength, fieldWidth, minX, minY } = useMemo(() => {
        const minX = Math.min(
            ...fieldProperties.xCheckpoints.map(
                (cp: Checkpoint) => cp.stepsFromCenterFront,
            ),
        );
        const maxX = Math.max(
            ...fieldProperties.xCheckpoints.map(
                (cp: Checkpoint) => cp.stepsFromCenterFront,
            ),
        );
        const minY = Math.min(
            ...fieldProperties.yCheckpoints.map(
                (cp: Checkpoint) => cp.stepsFromCenterFront,
            ),
        );
        const maxY = Math.max(
            ...fieldProperties.yCheckpoints.map(
                (cp: Checkpoint) => cp.stepsFromCenterFront,
            ),
        );

        return {
            fieldLength: (maxX - minX) * STEP_TO_METERS,
            fieldWidth: (maxY - minY) * STEP_TO_METERS,
            minX,
            minY,
        };
    }, [fieldProperties, STEP_TO_METERS]);

    // X Checkpoints (yard lines)
    const xCheckpoints = useMemo(() => {
        return fieldProperties.xCheckpoints
            .filter((cp: Checkpoint) => cp.visible)
            .map((cp: Checkpoint) => ({
                x: cp.stepsFromCenterFront * STEP_TO_METERS,
                terseName: cp.terseName,
                fieldLabel: cp.fieldLabel,
            }));
    }, [fieldProperties.xCheckpoints, STEP_TO_METERS]);

    // Y Checkpoints (hashes or horizontal lines)
    const yCheckpoints = useMemo(() => {
        return fieldProperties.yCheckpoints
            .filter((cp: Checkpoint) => cp.visible)
            .map((cp: Checkpoint) => ({
                z: cp.stepsFromCenterFront * STEP_TO_METERS,
                terseName: cp.terseName,
                useAsReference: cp.useAsReference,
            }));
    }, [fieldProperties.yCheckpoints, STEP_TO_METERS]);

    // Colors from theme
    const backgroundColor = "#00ff00"; // rgbaColorToHex(fieldProperties.theme.background);
    const primaryStrokeColor = "#ffffff"; // rgbaColorToHex(fieldProperties.theme.primaryStroke);
    const secondaryStrokeColor = "#ffffff"; // rgbaColorToHex(fieldProperties.theme.secondaryStroke);
    const tertiaryStrokeColor = "#ffffff"; // rgbaColorToHex(fieldProperties.theme.tertiaryStroke);
    const externalLabelColor = "#ffffff"; // rgbaColorToHex(fieldProperties.theme.externalLabel);
    const fieldLabelColor = "#ffffff"; // rgbaColorToHex(fieldProperties.theme.fieldLabel);

    const hashWidthMeters = HASH_WIDTH_PIXELS * PIXEL_TO_METERS;

    return (
        <group>
            {/* Field Base - Background */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.01, -fieldWidth / 2]}
            >
                <planeGeometry args={[fieldLength, fieldWidth]} />
                <meshStandardMaterial color={backgroundColor} />
            </mesh>

            {/* X Checkpoints (Yard Lines) - Primary stroke */}
            {xCheckpoints.map(
                (
                    checkpoint: {
                        x: number;
                        terseName: string;
                        fieldLabel?: string;
                    },
                    i: number,
                ) => (
                    <Line
                        key={`x-checkpoint-${i}`}
                        length={fieldWidth}
                        width={GRID_STROKE_WIDTH}
                        x={checkpoint.x}
                        z={-fieldWidth / 2}
                        horizontal
                        color={primaryStrokeColor}
                    />
                ),
            )}

            {/* Y Checkpoints - either hashes or full lines */}
            {fieldProperties.useHashes ? (
                // Render hash marks at intersections
                <group>
                    {xCheckpoints.map(
                        (
                            xCheckpoint: {
                                x: number;
                                terseName: string;
                                fieldLabel?: string;
                            },
                            xIdx: number,
                        ) => (
                            <group key={`hash-x-${xIdx}`}>
                                {yCheckpoints.map(
                                    (
                                        yCheckpoint: {
                                            z: number;
                                            terseName: string;
                                            useAsReference: boolean;
                                        },
                                        yIdx: number,
                                    ) => {
                                        const strokeWidth =
                                            yCheckpoint.useAsReference
                                                ? GRID_STROKE_WIDTH * 5
                                                : GRID_STROKE_WIDTH * 3;
                                        const color = yCheckpoint.useAsReference
                                            ? primaryStrokeColor
                                            : secondaryStrokeColor;

                                        return (
                                            <Line
                                                key={`hash-${xIdx}-${yIdx}`}
                                                length={hashWidthMeters}
                                                width={strokeWidth}
                                                x={xCheckpoint.x}
                                                z={yCheckpoint.z}
                                                horizontal
                                                color={color}
                                            />
                                        );
                                    },
                                )}
                            </group>
                        ),
                    )}
                </group>
            ) : (
                // Render full horizontal lines
                yCheckpoints.map(
                    (
                        checkpoint: {
                            z: number;
                            terseName: string;
                            useAsReference: boolean;
                        },
                        i: number,
                    ) => (
                        <Line
                            key={`y-checkpoint-${i}`}
                            length={fieldLength}
                            width={GRID_STROKE_WIDTH}
                            z={checkpoint.z + fieldWidth / 2}
                            color={primaryStrokeColor}
                        />
                    ),
                )
            )}

            {/* Checkpoint Labels */}
            {fieldProperties.topLabelsVisible &&
                xCheckpoints.map(
                    (
                        checkpoint: {
                            x: number;
                            terseName: string;
                            fieldLabel?: string;
                        },
                        i: number,
                    ) => (
                        <Text
                            key={`label-top-${i}`}
                            position={[
                                checkpoint.x,
                                0.02,
                                fieldWidth / 2 + 0.5,
                            ]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            fontSize={0.3}
                            color={externalLabelColor}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {checkpoint.terseName}
                        </Text>
                    ),
                )}

            {fieldProperties.bottomLabelsVisible &&
                xCheckpoints.map(
                    (
                        checkpoint: {
                            x: number;
                            terseName: string;
                            fieldLabel?: string;
                        },
                        i: number,
                    ) => (
                        <Text
                            key={`label-bottom-${i}`}
                            position={[
                                checkpoint.x,
                                0.02,
                                -fieldWidth / 2 - 0.5,
                            ]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            fontSize={0.3}
                            color={externalLabelColor}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {checkpoint.terseName}
                        </Text>
                    ),
                )}

            {fieldProperties.leftLabelsVisible &&
                yCheckpoints.map(
                    (
                        checkpoint: {
                            z: number;
                            terseName: string;
                            useAsReference: boolean;
                        },
                        i: number,
                    ) => (
                        <Text
                            key={`label-left-${i}`}
                            position={[
                                -fieldLength / 2 - 0.5,
                                0.02,
                                checkpoint.z,
                            ]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            fontSize={0.3}
                            color={externalLabelColor}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {checkpoint.terseName}
                        </Text>
                    ),
                )}

            {fieldProperties.rightLabelsVisible &&
                yCheckpoints.map(
                    (
                        checkpoint: {
                            z: number;
                            terseName: string;
                            useAsReference: boolean;
                        },
                        i: number,
                    ) => (
                        <Text
                            key={`label-right-${i}`}
                            position={[
                                fieldLength / 2 + 0.5,
                                0.02,
                                checkpoint.z,
                            ]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            fontSize={0.3}
                            color={externalLabelColor}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {checkpoint.terseName}
                        </Text>
                    ),
                )}

            {/* Yard Line Numbers on Field */}
            {fieldProperties.yardNumberCoordinates
                .homeStepsFromFrontToInside !== undefined &&
                fieldProperties.yardNumberCoordinates
                    .homeStepsFromFrontToOutside !== undefined &&
                xCheckpoints.map(
                    (
                        checkpoint: {
                            x: number;
                            terseName: string;
                            fieldLabel?: string;
                        },
                        i: number,
                    ) => {
                        if (!checkpoint.fieldLabel) return null;

                        const numberHeight =
                            (fieldProperties.yardNumberCoordinates
                                .homeStepsFromFrontToInside! -
                                fieldProperties.yardNumberCoordinates
                                    .homeStepsFromFrontToOutside!) *
                            STEP_TO_METERS;

                        return (
                            <group key={`yard-number-${i}`}>
                                {/* Home side number */}
                                {fieldProperties.yardNumberCoordinates
                                    .homeStepsFromFrontToInside !==
                                    undefined && (
                                    <Text
                                        position={[
                                            checkpoint.x,
                                            0.02,
                                            -fieldProperties
                                                .yardNumberCoordinates
                                                .homeStepsFromFrontToInside *
                                                STEP_TO_METERS,
                                        ]}
                                        rotation={[-Math.PI / 2, 0, 0]}
                                        fontSize={numberHeight}
                                        color={fieldLabelColor}
                                        anchorX="center"
                                        anchorY="middle"
                                        letterSpacing={0.1}
                                    >
                                        {checkpoint.fieldLabel}
                                    </Text>
                                )}

                                {/* Away side number (flipped) */}
                                {fieldProperties.yardNumberCoordinates
                                    .awayStepsFromFrontToOutside !==
                                    undefined && (
                                    <Text
                                        position={[
                                            checkpoint.x,
                                            0.02,
                                            -fieldProperties
                                                .yardNumberCoordinates
                                                .awayStepsFromFrontToOutside *
                                                STEP_TO_METERS,
                                        ]}
                                        rotation={[-Math.PI / 2, 0, Math.PI]}
                                        fontSize={numberHeight}
                                        color={fieldLabelColor}
                                        anchorX="center"
                                        anchorY="middle"
                                        letterSpacing={0.1}
                                    >
                                        {checkpoint.fieldLabel}
                                    </Text>
                                )}
                            </group>
                        );
                    },
                )}

            {/* Border Lines */}
            <Line
                length={fieldLength}
                width={GRID_STROKE_WIDTH * 3}
                z={0}
                color={primaryStrokeColor}
            />
            <Line
                length={fieldLength}
                width={GRID_STROKE_WIDTH * 3}
                z={-fieldWidth}
                color={primaryStrokeColor}
            />
            <Line
                length={fieldWidth}
                width={GRID_STROKE_WIDTH * 3}
                x={-fieldLength / 2}
                z={-fieldWidth / 2}
                horizontal
                color={primaryStrokeColor}
            />
            <Line
                length={fieldWidth}
                width={GRID_STROKE_WIDTH * 3}
                x={fieldLength / 2}
                z={-fieldWidth / 2}
                horizontal
                color={primaryStrokeColor}
            />
        </group>
    );
}

// Keep the old component for backwards compatibility
export function HighSchoolField() {
    return <Field />;
}

function Line({
    length,
    width,
    x = 0,
    z = 0,
    horizontal = false,
    color = "white",
}: {
    length: number;
    width: number;
    x?: number;
    z?: number;
    horizontal?: boolean;
    color?: string;
}) {
    return (
        <mesh
            position={[x, 0.01, z]}
            rotation={[-Math.PI / 2, 0, horizontal ? Math.PI / 2 : 0]}
        >
            <planeGeometry args={[length, width]} />
            <meshBasicMaterial color={color} />
        </mesh>
    );
}
