import { FieldProperties } from "@openmarch/core";
import GridFieldTemplates, {
    createGridXCheckpoints,
    createGridYCheckpoints,
} from "./GridFields";

/** An indoor floor's size in feet: front to back, and side to side */
export interface IndoorFloorSize {
    depthFeet: number;
    widthFeet: number;
}

/** The floor sizes floor makers stock, smallest first; 60 × 90 is WGI's full-size floor */
export const INDOOR_FLOOR_SIZES: readonly IndoorFloorSize[] = [
    { depthFeet: 40, widthFeet: 60 },
    { depthFeet: 50, widthFeet: 70 },
    { depthFeet: 50, widthFeet: 80 },
    { depthFeet: 45, widthFeet: 90 },
    { depthFeet: 55, widthFeet: 80 },
    { depthFeet: 50, widthFeet: 90 },
    { depthFeet: 60, widthFeet: 90 },
];

/** WGI's minimum competition area, and the usual full-size floor */
export const FULL_SIZE_FLOOR: IndoorFloorSize = {
    depthFeet: 60,
    widthFeet: 90,
};

/** The step sizes an indoor floor's grid can use, and the template key part for each */
export const INDOOR_STEP_SIZES = [
    { inches: 24, templateSuffix: "8to5" },
    { inches: 30, templateSuffix: "6to5" },
] as const;

/** A step size in inches: one of INDOOR_STEP_SIZES, or a custom one */
export type IndoorStepInches = number;

/** The custom floor sizes and step sizes the floor picker accepts */
export const FLOOR_FEET_RANGE = { min: 20, max: 200 } as const;
export const STEP_INCHES_RANGE = { min: 12, max: 48 } as const;

export const isStockFloorSize = (size: IndoorFloorSize) =>
    INDOOR_FLOOR_SIZES.some((stock) => sameFloorSize(stock, size));

export const isStockStepSize = (inches: number) =>
    INDOOR_STEP_SIZES.some((stock) => stock.inches === inches);

/** Steps between the grid's labeled lines (see createGridXCheckpoints) */
export const STEPS_BETWEEN_LINES = 4;

type GridTemplateKey = keyof typeof GridFieldTemplates;

const templateKey = (
    size: IndoorFloorSize,
    stepInches: IndoorStepInches,
): GridTemplateKey | null => {
    const step = INDOOR_STEP_SIZES.find((s) => s.inches === stepInches);
    if (!step) return null;
    return `INDOOR_${size.depthFeet}x${size.widthFeet}_${step.templateSuffix}` as GridTemplateKey;
};

/** A custom floor's template name; indoorFloorOf reads the size and step size back from it */
const customFloorName = (size: IndoorFloorSize, stepInches: number) =>
    `Indoor ${size.depthFeet}x${size.widthFeet} - ${stepInches}-inch steps`;
const CUSTOM_FLOOR_NAME =
    /^Indoor (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?) - (\d+(?:\.\d+)?)-inch steps$/;

export const sameFloorSize = (a: IndoorFloorSize, b: IndoorFloorSize) =>
    a.depthFeet === b.depthFeet && a.widthFeet === b.widthFeet;

/**
 * The field for a floor size and step size: the stock template when floor makers sell that
 * floor at that step size, else a custom grid field with the same lines (every 4 steps from
 * the center and the front).
 */
export function indoorFloorTemplate(
    size: IndoorFloorSize,
    stepInches: IndoorStepInches,
): FieldProperties {
    const key = templateKey(size, stepInches);
    const stock = key ? GridFieldTemplates[key] : undefined;
    if (stock) return stock;
    const steps = (feet: number) => (feet * 12) / stepInches;
    return new FieldProperties({
        name: customFloorName(size, stepInches),
        xCheckpoints: createGridXCheckpoints({ xSteps: steps(size.widthFeet) }),
        yCheckpoints: createGridYCheckpoints({ ySteps: steps(size.depthFeet) }),
        stepSizeInches: stepInches,
        isCustom: true,
    });
}

/** The floor size and step size of an indoor floor field, or null for any other field */
export function indoorFloorOf(
    template: FieldProperties,
): { size: IndoorFloorSize; stepInches: IndoorStepInches } | null {
    if (!template.isCustom) {
        for (const size of INDOOR_FLOOR_SIZES)
            for (const { inches } of INDOOR_STEP_SIZES) {
                const candidate = indoorFloorTemplate(size, inches);
                if (candidate === template || candidate.name === template.name)
                    return { size, stepInches: inches };
            }
        return null;
    }
    const custom = CUSTOM_FLOOR_NAME.exec(template.name);
    if (!custom) return null;
    const [depthFeet, widthFeet, stepInches] = custom.slice(1).map(Number);
    if (template.stepSizeInches !== stepInches) return null;
    return { size: { depthFeet, widthFeet }, stepInches };
}

/**
 * A floor with the image's shape: as deep as `size`, and as wide as the image makes it, to the
 * nearest foot. Null when that width is outside FLOOR_FEET_RANGE.
 */
export function floorShapedLikeImage(
    imageWidth: number,
    imageHeight: number,
    size: IndoorFloorSize,
): IndoorFloorSize | null {
    if (imageWidth <= 0 || imageHeight <= 0) return null;
    const shape =
        Math.max(imageWidth, imageHeight) / Math.min(imageWidth, imageHeight);
    const widthFeet = Math.round(size.depthFeet * shape);
    if (widthFeet < FLOOR_FEET_RANGE.min || widthFeet > FLOOR_FEET_RANGE.max)
        return null;
    return { depthFeet: size.depthFeet, widthFeet };
}

/** Whether a floor has the image's shape, within the slack floorSizeForImage allows */
export function floorFitsImage(
    imageWidth: number,
    imageHeight: number,
    size: IndoorFloorSize,
): boolean {
    if (imageWidth <= 0 || imageHeight <= 0) return false;
    const shape =
        Math.max(imageWidth, imageHeight) / Math.min(imageWidth, imageHeight);
    return (
        Math.abs(size.widthFeet / size.depthFeet / shape - 1) <= SHAPE_TOLERANCE
    );
}

/**
 * How far an image's shape may be from a floor's and still count as that floor: 2%, under half
 * the gap between the closest two floors (50 × 70 and 55 × 80, about 4% apart).
 */
const SHAPE_TOLERANCE = 0.02;

/**
 * The floor size an image of the floor was made for, from its shape (side to side over front to
 * back; a portrait image is read turned on its side). Floors with the same shape (40 × 60 and
 * 60 × 90) go to `preferred` when it is one of them, else to the bigger floor. Null when no
 * floor is within 2% of the image's shape.
 */
export function floorSizeForImage(
    imageWidth: number,
    imageHeight: number,
    preferred?: IndoorFloorSize,
): IndoorFloorSize | null {
    if (imageWidth <= 0 || imageHeight <= 0) return null;
    const shape =
        Math.max(imageWidth, imageHeight) / Math.min(imageWidth, imageHeight);
    const off = (size: IndoorFloorSize) =>
        Math.abs(size.widthFeet / size.depthFeet / shape - 1);
    const matches = INDOOR_FLOOR_SIZES.filter(
        (size) => off(size) <= SHAPE_TOLERANCE,
    );
    if (matches.length === 0) return null;
    const best = Math.min(...matches.map(off));
    const closest = matches.filter((size) => off(size) - best < 1e-9);
    return (
        (preferred && closest.find((size) => sameFloorSize(size, preferred))) ??
        closest[closest.length - 1]!
    );
}
