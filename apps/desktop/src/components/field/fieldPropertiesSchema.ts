import * as z from "zod";
import { DEFAULT_FIELD_THEME } from "@openmarch/core";

/**
 * Schema for RGBA color values
 * r, g, b: 0-255
 * a: 0-1
 */
export const RgbaColorSchema = z.object({
    r: z.int().min(0).max(255),
    g: z.int().min(0).max(255),
    b: z.int().min(0).max(255),
    a: z.float64().min(0).max(1),
});

/**
 * Schema for a marcher's colors
 */
export const MarcherColorSchema = z.object({
    fill: RgbaColorSchema,
    outline: RgbaColorSchema,
    label: RgbaColorSchema,
});

/**
 * Schema for field theme
 */
export const FieldThemeSchema = z.object({
    primaryStroke: RgbaColorSchema,
    secondaryStroke: RgbaColorSchema,
    tertiaryStroke: RgbaColorSchema,
    background: RgbaColorSchema,
    fieldLabel: RgbaColorSchema,
    externalLabel: RgbaColorSchema,
    previousPath: RgbaColorSchema,
    nextPath: RgbaColorSchema,
    shape: RgbaColorSchema,
    shapeType: z
        .enum(["circle", "square", "triangle", "x"])
        .nullable()
        .default("circle"),
    tempPath: RgbaColorSchema,
    defaultMarcher: MarcherColorSchema,
});

/**
 * Schema for checkpoint objects
 */
export const CheckpointSchema = z.object({
    id: z.int(),
    name: z.string(),
    axis: z.enum(["x", "y"]),
    terseName: z.string(),
    stepsFromCenterFront: z.float64(),
    useAsReference: z.boolean(),
    fieldLabel: z.string().optional(),
    visible: z.boolean(),
});

/**
 * Schema for yard number coordinates (all fields are optional)
 */
export const YardNumberCoordinatesSchema = z.object({
    homeStepsFromFrontToOutside: z.float64().optional(),
    homeStepsFromFrontToInside: z.float64().optional(),
    awayStepsFromFrontToInside: z.float64().optional(),
    awayStepsFromFrontToOutside: z.float64().optional(),
});

/**
 * Schema for side descriptions
 */
export const SideDescriptionsSchema = z.object({
    verboseLeft: z.string(),
    verboseRight: z.string(),
    terseLeft: z.string(),
    terseRight: z.string(),
});

/**
 * Schema for field properties
 * Matches the FieldProperties constructor with all default values
 */
export const FieldPropertiesSchema = z.object({
    name: z.string(),
    xCheckpoints: z.array(CheckpointSchema),
    yCheckpoints: z.array(CheckpointSchema),
    yardNumberCoordinates: YardNumberCoordinatesSchema.optional(),
    sideDescriptions: SideDescriptionsSchema.optional(),
    halfLineXInterval: z.float64().default(0),
    halfLineYInterval: z.float64().default(0),
    stepSizeInches: z.float64().default(22.5),
    measurementSystem: z.enum(["imperial", "metric"]).default("imperial"),
    topLabelsVisible: z.boolean().default(true),
    bottomLabelsVisible: z.boolean().default(true),
    leftLabelsVisible: z.boolean().default(true),
    rightLabelsVisible: z.boolean().default(true),
    useHashes: z.boolean().default(false),
    isCustom: z.boolean().default(true),
    showFieldImage: z.boolean().default(true),
    imageFillOrFit: z.enum(["fill", "fit"]).default("fit"),
    theme: FieldThemeSchema.default(DEFAULT_FIELD_THEME),
});

/**
 * Type inference from the schema
 */
export type ValidatedFieldProperties = z.infer<typeof FieldPropertiesSchema>;
