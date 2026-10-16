import type { FieldProperties, FieldTheme, RgbaColor } from "@openmarch/core";
import {
    resolveMarcherLook,
    type AppearanceComponentOptional,
} from "@/entity-components/appearance";
import {
    BASELINE_BELOW_CENTER,
    fieldImagePlacement,
    planField2d,
    textCenterY,
    type FieldPlanText,
} from "@/field/fieldPlan";

/**
 * Drill chart SVGs drawn straight from show data, with no canvas (field renderer migration,
 * #206). The layout is the 2D field's (`fieldPlan.ts`, the marcher shapes and the pathways), and
 * everything sits exactly on its coordinates:
 *
 * - Dots, pathways, midpoints and endpoints sit on their stored coordinates.
 * - Centered text is centered by the SVG renderer (`text-anchor`), so it doesn't depend on the
 *   font measured where the export ran. Yard numbers are centered on their yard line.
 * - The border is one closed outline around the field.
 *
 * The field's layout is `planField2d` (`src/field/fieldPlan.ts`), which the new field draws too.
 *
 * The output is plain SVG 1.1 that `svg-to-pdfkit` (the PDF export) and browsers both draw.
 */

/** A field image to draw under the grid: its natural size (0 if unknown) and where to load it from. */
export interface DrillChartFieldImage {
    href: string;
    width: number;
    height: number;
}

export interface DrillChartFieldOptions {
    gridLines: boolean;
    halfLines: boolean;
    /** Drawn when the field properties show the field image */
    image?: DrillChartFieldImage;
}

/** A dot on the chart: where it is and how it looks. */
export interface DrillChartDot {
    marcherId: number;
    label: string;
    x: number;
    y: number;
    /** Highest priority first (`resolveAppearanceFromStack`); empty for the theme's default */
    appearances: AppearanceComponentOptional[];
}

export interface DrillChartPath {
    previous?: { x: number; y: number };
    current: { x: number; y: number };
    next?: { x: number; y: number };
}

export const DOT_RADIUS = 5;
const PATHWAY_STROKE = 2;
const PATH_POINT_RADIUS = 3;
const MARCHER_LABEL_FONT_SIZE = 14;

const num = (n: number) => String(Math.round(n * 1000) / 1000);

const escapeXml = (text: string) =>
    text
        // Control characters XML forbids would make the SVG invalid
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** `rgb()` plus an opacity attribute, as SVG 1.1 and `svg-to-pdfkit` expect */
const paint = (kind: "fill" | "stroke", color: RgbaColor) =>
    `${kind}="rgb(${color.r},${color.g},${color.b})"` +
    (color.a < 1 ? ` ${kind}-opacity="${num(color.a)}"` : "");

const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: RgbaColor,
    width: number,
    extra = "",
) =>
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" ${paint("stroke", color)} stroke-width="${num(width)}"${extra} />`;

const text = ({
    content,
    x,
    y,
    fontSize,
    fontFamily,
    color,
    anchor,
    bold = false,
    extra = "",
}: {
    content: string;
    x: number;
    /** Baseline */
    y: number;
    fontSize: number;
    fontFamily: string;
    color: RgbaColor;
    anchor: "start" | "middle" | "end";
    bold?: boolean;
    extra?: string;
}) =>
    `<text x="${num(x)}" y="${num(y)}" font-family="${fontFamily}" font-size="${num(fontSize)}" font-weight="${bold ? "bold" : "normal"}" text-anchor="${anchor}" ${paint("fill", color)}${extra} xml:space="preserve">${escapeXml(content)}</text>`;

export { fieldImagePlacement };

export function fieldSvg(
    fieldProperties: FieldProperties,
    { gridLines, halfLines, image }: DrillChartFieldOptions,
): string {
    const plan = planField2d(fieldProperties, { gridLines, halfLines, image });
    const out: string[] = [];

    out.push(
        `<rect x="0" y="0" width="${num(plan.width)}" height="${num(plan.height)}" ${paint("fill", plan.background)} />`,
    );
    if (plan.image && image) {
        const at = plan.image;
        out.push(
            `<image x="${num(at.x)}" y="${num(at.y)}" width="${num(at.width)}" height="${num(at.height)}" preserveAspectRatio="none" opacity="${num(at.opacity)}" xlink:href="${escapeXml(image.href)}" />`,
        );
    }
    for (const l of plan.lines)
        out.push(line(l.x1, l.y1, l.x2, l.y2, l.color, l.width));
    for (const t of plan.texts) out.push(fieldTextSvg(t));

    const { border } = plan;
    out.push(
        `<rect x="${num(border.x)}" y="${num(border.y)}" width="${num(border.width)}" height="${num(border.height)}" fill="none" ${paint("stroke", border.color)} stroke-width="${num(border.strokeWidth)}" />`,
    );

    return out.join("\n");
}

/** A checkpoint label or yard number */
function fieldTextSvg(t: FieldPlanText): string {
    const spacing = t.letterSpacing;
    const svg = text({
        content: t.text,
        // letter-spacing also follows the last character, so shift by half of it to center
        x: spacing && t.anchor === "middle" ? t.x + spacing / 2 : t.x,
        y: t.y,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        color: t.color,
        anchor: t.anchor,
        extra: spacing ? ` letter-spacing="${num(spacing)}"` : "",
    });
    if (!t.flipped) return svg;
    const centerY = textCenterY(t);
    return `<g transform="matrix(-1 0 0 -1 ${num(2 * t.x)} ${num(2 * centerY)})">${svg}</g>`;
}

/** One dot's shape, centered on its coordinate */
export function dotSvg(dot: DrillChartDot, theme: FieldTheme): string {
    const look = resolveMarcherLook(dot.appearances, theme);
    if (!look.visible) return "";
    const r = DOT_RADIUS;
    const colors = `${paint("fill", look.fill)} ${paint("stroke", look.outline)} stroke-width="1"`;
    // Drawn around the origin and moved into place: svg-to-pdfkit writes short numbers then, which
    // keeps a PDF of hundreds of dots about a third the size
    const attrs = `data-marcher-id="${dot.marcherId}" transform="translate(${num(dot.x)} ${num(dot.y)})"`;
    switch (look.shape) {
        case "square": {
            const side = r * Math.sqrt(Math.PI) * 1.2;
            return `<rect ${attrs} x="${num(-side / 2)}" y="${num(-side / 2)}" width="${num(side)}" height="${num(side)}" ${colors} />`;
        }
        case "triangle": {
            // Equilateral, slightly larger to keep its visual weight
            const halfWidth = r * 1.2;
            const halfHeight = (r * 1.2 * Math.sqrt(3)) / 2;
            const points = [
                [-halfWidth, halfHeight],
                [0, -halfHeight],
                [halfWidth, halfHeight],
            ]
                .map(([px, py]) => `${num(px!)},${num(py!)}`)
                .join(" ");
            return `<polygon ${attrs} points="${points}" ${colors} />`;
        }
        case "cross": {
            const s = r * 1.2;
            return `<g ${attrs}>${line(-s, -s, s, s, look.crossColor, 2)}${line(-s, s, s, -s, look.crossColor, 2)}</g>`;
        }
        default:
            return `<circle ${attrs} cx="0" cy="0" r="${num(r)}" ${colors} />`;
    }
}

/** A dot's drill number above it, or nothing when its label is hidden */
export function dotLabelSvg(dot: DrillChartDot, theme: FieldTheme): string {
    const look = resolveMarcherLook(dot.appearances, theme);
    if (!look.labelVisible) return "";
    return text({
        content: dot.label,
        x: dot.x,
        y:
            dot.y -
            DOT_RADIUS * 2.2 +
            BASELINE_BELOW_CENTER * MARCHER_LABEL_FONT_SIZE,
        fontSize: MARCHER_LABEL_FONT_SIZE,
        fontFamily: "courier new",
        color: theme.defaultMarcher.label,
        anchor: "middle",
        bold: true,
    });
}

/** A pathway with its midpoint and endpoint */
const pathVisualsSvg = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    color: RgbaColor,
) => {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return [
        line(start.x, start.y, end.x, end.y, color, PATHWAY_STROKE),
        `<circle cx="${num(mid.x)}" cy="${num(mid.y)}" r="${PATH_POINT_RADIUS}" fill="rgb(255,255,255)" ${paint("stroke", color)} stroke-width="2" />`,
        `<circle cx="${num(end.x)}" cy="${num(end.y)}" r="${PATH_POINT_RADIUS}" ${paint("fill", color)} />`,
    ].join("\n");
};

/**
 * An individual chart's marks for one marcher: the paths from the previous position and to the
 * next, a box on the previous position and a circle on the next.
 */
export function pathSvg(path: DrillChartPath, theme: FieldTheme): string {
    const out: string[] = [];
    if (path.previous)
        out.push(
            pathVisualsSvg(path.previous, path.current, theme.previousPath),
        );
    if (path.next)
        out.push(pathVisualsSvg(path.current, path.next, theme.nextPath));
    if (path.previous)
        out.push(
            `<rect x="${num(path.previous.x - 10)}" y="${num(path.previous.y - 10)}" width="20" height="20" fill="none" stroke="rgb(0,0,255)" stroke-width="3" />`,
        );
    if (path.next)
        out.push(
            // hsl(281, 82%, 63%)
            `<circle cx="${num(path.next.x)}" cy="${num(path.next.y)}" r="10" fill="none" stroke="rgb(189,83,238)" stroke-width="3" />`,
        );
    return out.join("\n");
}

/**
 * A whole chart: the field, every label, every dot, then the focused marcher's path and its dot
 * on top. The viewBox has `margin` around the field for the checkpoint labels.
 */
export function drillChartSvg({
    fieldProperties,
    field,
    dots,
    focus,
    margin = 40,
}: {
    fieldProperties: FieldProperties;
    /** `fieldSvg` output, shared by every chart of an export */
    field: string;
    dots: DrillChartDot[];
    focus?: { dot: DrillChartDot; path: DrillChartPath };
    margin?: number;
}): string {
    const { theme } = fieldProperties;
    const width = fieldProperties.width + margin * 2;
    const height = fieldProperties.height + margin * 2;
    const parts = [
        `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${num(width)}" height="${num(height)}" viewBox="${num(-margin)} ${num(-margin)} ${num(width)} ${num(height)}">`,
        field,
        ...dots.map((dot) => dotLabelSvg(dot, theme)),
        ...dots.map((dot) => dotSvg(dot, theme)),
    ];
    if (focus) {
        parts.push(pathSvg(focus.path, theme), dotSvg(focus.dot, theme));
    }
    parts.push("</svg>");
    return parts.filter((part) => part !== "").join("\n");
}
