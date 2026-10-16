import {
    FieldProperties,
    type Checkpoint,
    type RgbaColor,
} from "@openmarch/core";

/**
 * The 2D field's layout, in field units. Everything sits exactly on its
 * coordinates. One plan for everything that draws the field flat: the drill
 * chart SVG export (`drillChartSvg.ts`) and the field
 * (`three/fieldGeometry.ts`). Change what the 2D field shows here, once.
 *
 * Renderer-free: no three.js, no DOM.
 */

export type FieldPlanLine = {
    role: "grid" | "halfLine" | "yardLine" | "hash" | "yLine";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: RgbaColor;
    /** Stroke width in field units, centered on the line, with butt ends. */
    width: number;
};

export type FieldPlanText = {
    role: "checkpointLabel" | "yardNumber";
    text: string;
    /** Where `anchor` puts the text horizontally. */
    x: number;
    /** The baseline. */
    y: number;
    fontSize: number;
    /** A CSS font family. */
    fontFamily: string;
    anchor: "start" | "middle" | "end";
    color: RgbaColor;
    /** Extra space after each character, in field units. */
    letterSpacing: number;
    /** Turned half a turn about its center (`textCenterY`), to read from the back sideline. */
    flipped: boolean;
};

export type FieldPlanImage = {
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
};

export type FieldPlan2d = {
    width: number;
    height: number;
    background: RgbaColor;
    /** The field image, under the lines; null when there's none to show. */
    image: FieldPlanImage | null;
    /** In paint order. */
    lines: FieldPlanLine[];
    /** In paint order, over the lines. */
    texts: FieldPlanText[];
    /** A rectangle stroked over everything, the stroke centered on its edge. */
    border: {
        x: number;
        y: number;
        width: number;
        height: number;
        strokeWidth: number;
        color: RgbaColor;
    };
};

export type FieldPlanOptions = {
    /** The user's grid lines setting (every step). */
    gridLines: boolean;
    /** The user's half lines setting. */
    halfLines: boolean;
    /**
     * The field image's natural size, when the show has one; 0 by 0 if it
     * didn't decode. Drawn only if the field properties show it.
     */
    image?: { width: number; height: number } | null;
};

const GRID_STROKE = FieldProperties.GRID_STROKE_WIDTH;
/** The text box is 1.13 font sizes tall, with the baseline 0.778 of the way down */
const TEXT_BOX = 1.13;
const BASELINE_FROM_TOP = TEXT_BOX * (1 - 0.222);
/** From the middle of the text box to the baseline, in font sizes */
export const BASELINE_BELOW_CENTER = BASELINE_FROM_TOP - TEXT_BOX / 2;
const LABEL_FONT_SIZE = 20;
/** A font that doesn't exist, so the platform's fallback draws the labels. */
const LABEL_FONT = "mono";
/** The font the yard numbers use */
const NUMBER_FONT = "Times New Roman";
/** Yard numbers: letter spacing 160 thousandths of an em */
const YARD_NUMBER_SPACING = 0.16;
const HASH_WIDTH = 20;

/** The center of a text's box, the point a flipped text turns about. */
export const textCenterY = (text: FieldPlanText) =>
    text.y - BASELINE_BELOW_CENTER * text.fontSize;

/** Where the y grid starts (as in `createFieldGrid`) */
const gridStartY = (fieldProperties: FieldProperties): number => {
    const { yCheckpoints, centerFrontPoint, pixelsPerStep } = fieldProperties;
    if (yCheckpoints.length === 0) return centerFrontPoint.yPixels;
    const sorted = [...yCheckpoints].sort(
        (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
    );
    const firstVisible = yCheckpoints.reduce(
        (prev, curr) =>
            curr.visible &&
            curr.stepsFromCenterFront > prev.stepsFromCenterFront
                ? curr
                : prev,
        sorted[sorted.length - 1]!,
    );
    const start =
        firstVisible.stepsFromCenterFront !== 0 &&
        firstVisible.stepsFromCenterFront % 1 !== 0
            ? firstVisible
            : sorted[0]!;
    return (
        centerFrontPoint.yPixels + start.stepsFromCenterFront * pixelsPerStep
    );
};

const checkpointX = (fp: FieldProperties, c: Checkpoint) =>
    fp.centerFrontPoint.xPixels + c.stepsFromCenterFront * fp.pixelsPerStep;
const checkpointY = (fp: FieldProperties, c: Checkpoint) =>
    fp.centerFrontPoint.yPixels + c.stepsFromCenterFront * fp.pixelsPerStep;

/** Lines every `interval` px from `from`, both ways, on the field: `from` itself in [0, `end`) */
const linesFrom = (from: number, interval: number, end: number): number[] => {
    const out: number[] = [];
    for (let i = from; i < end; i += interval) if (i >= 0) out.push(i);
    for (let i = from - interval; i > 0; i -= interval) out.push(i);
    return out;
};

/** The y loops start on the start line and only go back */
const backFrom = (from: number, interval: number) => {
    const out: number[] = [];
    for (let i = from; i > 0; i -= interval) out.push(i);
    return out;
};

/** Where a field image goes, fit or fill */
export const fieldImagePlacement = (
    fieldProperties: Pick<
        FieldProperties,
        "width" | "height" | "imageFillOrFit"
    >,
    image: { width: number; height: number },
) => {
    const { width, height } = fieldProperties;
    const fieldWider = image.width / image.height <= width / height;
    // "fill" covers the field; anything else fits inside it
    const byHeight =
        fieldProperties.imageFillOrFit === "fill" ? !fieldWider : fieldWider;
    const scale = byHeight ? height / image.height : width / image.width;
    return {
        x: (width - image.width * scale) / 2,
        y: (height - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
    };
};

/**
 * Where the field image is drawn and how opaque, or null when the field
 * properties hide it or there's no image. An image whose size is unknown (it
 * didn't decode) is stretched over the field.
 */
export function planFieldImage(
    fieldProperties: FieldProperties,
    image: FieldPlanOptions["image"],
): FieldPlanImage | null {
    if (!fieldProperties.showFieldImage || !image) return null;
    const { width, height } = fieldProperties;
    const at =
        image.width > 0 && image.height > 0
            ? fieldImagePlacement(fieldProperties, image)
            : { x: 0, y: 0, width, height };
    return { ...at, opacity: fieldProperties.backgroundImageOpacity };
}

/** Plans the 2D field of `fieldProperties`, painted with its theme. */
// eslint-disable-next-line max-lines-per-function
export function planField2d(
    fieldProperties: FieldProperties,
    { gridLines, halfLines, image }: FieldPlanOptions,
): FieldPlan2d {
    const fp = fieldProperties;
    const { width, height, pixelsPerStep, centerFrontPoint, theme } = fp;
    const lines: FieldPlanLine[] = [];
    const line = (
        role: FieldPlanLine["role"],
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color: RgbaColor,
        lineWidth: number,
    ) => lines.push({ role, x1, y1, x2, y2, color, width: lineWidth });

    const startY = gridStartY(fp);
    if (gridLines) {
        for (const x of linesFrom(
            centerFrontPoint.xPixels,
            pixelsPerStep,
            width,
        ))
            line("grid", x, 0, x, height, theme.tertiaryStroke, GRID_STROKE);
        for (const y of backFrom(startY, pixelsPerStep))
            line("grid", 0, y, width, y, theme.tertiaryStroke, GRID_STROKE);
    }

    if (halfLines) {
        if (fp.halfLineXInterval) {
            const interval = pixelsPerStep * fp.halfLineXInterval;
            for (const x of linesFrom(
                centerFrontPoint.xPixels,
                interval,
                width,
            ))
                line(
                    "halfLine",
                    x,
                    0,
                    x,
                    height,
                    theme.secondaryStroke,
                    GRID_STROKE,
                );
        }
        if (fp.halfLineYInterval) {
            const interval = pixelsPerStep * fp.halfLineYInterval;
            for (const y of backFrom(startY - interval, interval))
                line(
                    "halfLine",
                    0,
                    y,
                    width,
                    y,
                    theme.secondaryStroke,
                    GRID_STROKE,
                );
        }
    }

    // Yard lines and hashes
    for (const xCheckpoint of fp.xCheckpoints) {
        if (!xCheckpoint.visible) continue;
        const x = checkpointX(fp, xCheckpoint);
        line("yardLine", x, 0, x, height, theme.primaryStroke, GRID_STROKE);
        if (!fp.useHashes) continue;
        for (const yCheckpoint of fp.yCheckpoints) {
            if (!yCheckpoint.visible) continue;
            const y = checkpointY(fp, yCheckpoint);
            // As wide as the hash width plus the yard line, clipped to the field
            const half = (HASH_WIDTH + GRID_STROKE) / 2;
            const reference = yCheckpoint.useAsReference;
            line(
                "hash",
                Math.max(x - half, 0),
                y,
                Math.min(x + half, width),
                y,
                reference ? theme.primaryStroke : theme.secondaryStroke,
                GRID_STROKE * (reference ? 3 : 2),
            );
        }
    }
    if (!fp.useHashes)
        for (const yCheckpoint of fp.yCheckpoints) {
            if (!yCheckpoint.visible) continue;
            const y = checkpointY(fp, yCheckpoint);
            line("yLine", 0, y, width, y, theme.primaryStroke, GRID_STROKE);
        }

    // Border: three grid lines wide, just outside the field's edge
    const borderWidth = GRID_STROKE * 3;
    const inset = (borderWidth - GRID_STROKE) / 2;

    return {
        width,
        height,
        background: theme.background,
        image: planFieldImage(fp, image),
        lines,
        texts: [...checkpointLabels(fp), ...yardNumbers(fp)],
        border: {
            x: -inset,
            y: -inset,
            width: width + 2 * inset,
            height: height + 2 * inset,
            strokeWidth: borderWidth,
            color: theme.primaryStroke,
        },
    };
}

/** The checkpoint labels outside the field */
function checkpointLabels(fp: FieldProperties): FieldPlanText[] {
    const { centerFrontPoint, width, theme } = fp;
    const label = (
        text: string,
        x: number,
        baseline: number,
        anchor: FieldPlanText["anchor"],
    ): FieldPlanText => ({
        role: "checkpointLabel",
        text,
        x,
        y: baseline,
        fontSize: LABEL_FONT_SIZE,
        fontFamily: LABEL_FONT,
        anchor,
        color: theme.externalLabel,
        letterSpacing: 0,
        flipped: false,
    });
    const out: FieldPlanText[] = [];
    const labelBaselineBelowTop = BASELINE_FROM_TOP * LABEL_FONT_SIZE;
    for (const xCheckpoint of fp.xCheckpoints) {
        if (!xCheckpoint.visible) continue;
        const x = checkpointX(fp, xCheckpoint);
        if (fp.bottomLabelsVisible)
            out.push(
                label(
                    xCheckpoint.terseName,
                    x,
                    centerFrontPoint.yPixels + 5 + labelBaselineBelowTop,
                    "middle",
                ),
            );
        if (fp.topLabelsVisible)
            out.push(
                label(
                    xCheckpoint.terseName,
                    x,
                    -25 + labelBaselineBelowTop,
                    "middle",
                ),
            );
    }
    const sidePadding = 10;
    for (const yCheckpoint of fp.yCheckpoints) {
        if (!yCheckpoint.visible) continue;
        const baseline =
            checkpointY(fp, yCheckpoint) +
            BASELINE_BELOW_CENTER * LABEL_FONT_SIZE;
        if (fp.leftLabelsVisible)
            out.push(
                label(yCheckpoint.terseName, -sidePadding, baseline, "end"),
            );
        if (fp.rightLabelsVisible)
            out.push(
                label(
                    yCheckpoint.terseName,
                    width + sidePadding,
                    baseline,
                    "start",
                ),
            );
    }
    return out;
}

/** Yard numbers on the field, centered on their yard line; the away side's upside down */
function yardNumbers(fp: FieldProperties): FieldPlanText[] {
    const { homeStepsFromFrontToInside, homeStepsFromFrontToOutside } =
        fp.yardNumberCoordinates;
    if (
        homeStepsFromFrontToInside === undefined ||
        homeStepsFromFrontToOutside === undefined
    )
        return [];
    const { pixelsPerStep, centerFrontPoint, theme } = fp;
    const fontSize =
        (homeStepsFromFrontToInside - homeStepsFromFrontToOutside) *
        pixelsPerStep;
    const away = fp.yardNumberCoordinates.awayStepsFromFrontToOutside;
    const out: FieldPlanText[] = [];
    const number = (
        text: string,
        x: number,
        top: number,
        flipped: boolean,
    ): FieldPlanText => {
        const centerY = top + (TEXT_BOX * fontSize) / 2;
        return {
            role: "yardNumber",
            text,
            x,
            y: centerY + BASELINE_BELOW_CENTER * fontSize,
            fontSize,
            fontFamily: NUMBER_FONT,
            anchor: "middle",
            color: theme.fieldLabel,
            letterSpacing: YARD_NUMBER_SPACING * fontSize,
            flipped,
        };
    };
    for (const xCheckpoint of fp.xCheckpoints) {
        if (!xCheckpoint.fieldLabel) continue;
        const x = checkpointX(fp, xCheckpoint);
        out.push(
            number(
                xCheckpoint.fieldLabel,
                x,
                centerFrontPoint.yPixels -
                    homeStepsFromFrontToInside * pixelsPerStep,
                false,
            ),
        );
        if (away !== undefined)
            out.push(
                number(
                    xCheckpoint.fieldLabel,
                    x,
                    centerFrontPoint.yPixels - away * pixelsPerStep,
                    true,
                ),
            );
    }
    return out;
}
