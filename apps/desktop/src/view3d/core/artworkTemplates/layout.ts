/**
 * Lays out an Artwork template as a format-free drawing in meters, which the
 * SVG, PDF and PNG writers render at size. The page is the trim plus the
 * bleed on every side; the bleed is in the download only, never part of the
 * Artwork's size (D-16).
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { formatFeetInches, fromMeters, lengthOf } from "../sizes/units";
import {
    safeAreaShrunkNote,
    type Point,
    type ResolvedTemplate,
} from "./policy";
import type { TemplateSurface } from "./surfaces";

export type Ring = readonly Point[];

/** Named colors, so the PNG writer can use a palette. */
export type TemplateColor =
    | "paper"
    | "bleed"
    | "mask"
    | "trim"
    | "safe"
    | "marker"
    | "guide"
    | "text";

export const TEMPLATE_COLORS: Readonly<
    Record<TemplateColor, readonly [number, number, number]>
> = {
    paper: [255, 255, 255],
    bleed: [250, 214, 214],
    mask: [200, 200, 200],
    trim: [0, 0, 0],
    safe: [36, 99, 235],
    marker: [220, 38, 38],
    guide: [120, 120, 120],
    text: [40, 40, 40],
};

export type Shape =
    /** Rings filled with the even-odd rule, so an inner ring is a hole. */
    | {
          readonly type: "area";
          readonly rings: readonly Ring[];
          readonly fill: TemplateColor;
      }
    | {
          readonly type: "line";
          readonly points: Ring;
          readonly closed: boolean;
          readonly stroke: TemplateColor;
          readonly widthM: number;
          /** Dash and gap length; solid when absent. */
          readonly dashM?: number;
      }
    | {
          readonly type: "text";
          /** Left end of the baseline. */
          readonly x: number;
          readonly y: number;
          readonly sizeM: number;
          readonly text: string;
          readonly fill: TemplateColor;
      };

export interface TemplateDrawing {
    readonly surface: TemplateSurface;
    /** The page: trim plus bleed on every side. */
    readonly widthM: number;
    readonly heightM: number;
    readonly bleedM: number;
    /** The trim box on the page. */
    readonly trim: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    /** Painted in order. */
    readonly shapes: readonly Shape[];
}

function rect(x: number, y: number, w: number, h: number): Ring {
    return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
    ];
}

/** `54 in` as typed, else millimeters. */
function sizeText(length: { m: number; typed?: string }): string {
    return length.typed ?? `${round(length.m * 1000, 1)} mm`;
}

function round(value: number, digits: number): number {
    const f = 10 ** digits;
    return Math.round(value * f) / f;
}

/** Pixels a length needs at a DPI. */
export function pixelsAt(m: number, dpi: number): number {
    return Math.round(fromMeters(m, "in") * dpi);
}

function wrap(text: string, max: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
        if (line && line.length + 1 + word.length > max) {
            lines.push(line);
            line = word;
        } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
}

/** The safe-area line, with its inset when every side has the same one. */
function safeAreaLine(t: ResolvedTemplate): string {
    const { top, right, bottom, left } = t.safeM;
    const base = "Keep important content inside the dashed safe area";
    if (!(top === right && top === bottom && top === left)) return `${base}.`;
    if (t.safeRingM) return `${base}, ${insetText(t, top)} inside the cut.`;
    return `${base}, ${insetText(t, top)} from the trim.`;
}

function insetText(t: ResolvedTemplate, m: number): string {
    return t.surface.unit === "in"
        ? formatFeetInches(m)
        : `${round(m * 1000, 1)} mm`;
}

/**
 * The pole sleeve guide on silk templates (Q43): fabric this far from the
 * pole edge wraps around the pole, so art there is hidden.
 */
export const SLEEVE_GUIDE = lengthOf(3, "in");

export const SLEEVE_GUIDE_NOTE = `The dashed line ${formatFeetInches(SLEEVE_GUIDE.m)} from the pole edge marks the sleeve: art between it and the pole is hidden on the pole.`;

const ORIENTATION_LABEL = {
    poleLeft: "POLE SIDE (HEADER)",
    audienceBottom: "AUDIENCE SIDE",
    frontBottom: "FRONT",
    upTop: "UP",
} as const;

/** The info block's lines, in plain ASCII so every writer can set them. */
export function templateInfoLines(t: ResolvedTemplate): string[] {
    const s = t.surface;
    const { width, height } = t.trimM;
    const dims =
        s.kind !== "silk"
            ? `${sizeText(s.width)} x ${sizeText(s.height)}`
            : s.header
              ? `${sizeText(s.width)} fly x ${sizeText(s.height)} deep, ${sizeText(s.header)} header`
              : `${sizeText(s.width)} fly x ${sizeText(s.height)} header`;
    const px = (dpi: number) =>
        `${pixelsAt(width, dpi)} x ${pixelsAt(height, dpi)} px`;
    const lines = [
        s.name,
        `Trim: ${dims}`,
        t.bleedM > 0
            ? `Bleed: ${formatFeetInches(t.bleedM)} (${round(t.bleedM * 1000, 3)} mm) past the trim on every side, download only`
            : "Bleed: none",
        safeAreaLine(t),
        ...(t.safeShrunk ? [safeAreaShrunkNote(t.safeM.top, s.unit)] : []),
        `Resolution: ${s.dpi.minimum} DPI minimum (${px(s.dpi.minimum)}), ${s.dpi.recommended} DPI recommended (${px(s.dpi.recommended)})`,
    ];
    if (s.sleeve) lines.push(`Sleeve: ${sizeText(s.sleeve)}`);
    if (s.kind === "silk") lines.push(...wrap(SLEEVE_GUIDE_NOTE, 60));
    if (s.kind === "uniformFront")
        lines.push("As worn, the wearer's right is on your left.");
    if (s.kind === "uniformBack")
        lines.push("As worn, the wearer's left is on your left.");
    for (const note of s.notes) lines.push(...wrap(note, 60));
    lines.push("Template: CC0 1.0 (public domain).");
    return lines;
}

/** The orientation marker: a triangle pointing at the named edge, and its label. */
function orientationMarker(
    orientation: TemplateSurface["orientation"],
    w: number,
    h: number,
    marker: number,
    textSize: number,
): { tri: Point[]; labelAt: Point; label: string } {
    const label = ORIENTATION_LABEL[orientation];
    let tri: Point[];
    let labelAt: Point;
    const approxWidth = label.length * textSize * 0.6;
    switch (orientation) {
        case "poleLeft":
            tri = [
                [0, h / 2],
                [marker, h / 2 - marker / 2],
                [marker, h / 2 + marker / 2],
            ];
            labelAt = [marker * 1.2, h / 2 + textSize / 3];
            break;
        case "audienceBottom":
        case "frontBottom":
            tri = [
                [w / 2, h],
                [w / 2 - marker / 2, h - marker],
                [w / 2 + marker / 2, h - marker],
            ];
            labelAt = [w / 2 - approxWidth / 2, h - marker * 1.2];
            break;
        case "upTop":
            tri = [
                [w / 2, 0],
                [w / 2 + marker / 2, marker],
                [w / 2 - marker / 2, marker],
            ];
            labelAt = [w / 2 - approxWidth / 2, marker * 1.2 + textSize];
            break;
    }
    return { tri, labelAt, label };
}

/** A character width, in ems, a little wider than Helvetica digits (0.556). */
const CHAR_WIDTH_EM = 0.6;

/**
 * The info block's lines, wrapped so they end inside `widthM`: unwrapped,
 * the Resolution line runs past the trim on portrait surfaces.
 */
function fitInfoLines(
    t: ResolvedTemplate,
    sizeM: number,
    widthM: number,
): string[] {
    const max = Math.max(20, Math.floor(widthM / (sizeM * CHAR_WIDTH_EM)));
    return templateInfoLines(t).flatMap((line) => wrap(line, max));
}

/** The info block as text lines from a baseline start. */
function infoText(
    lines: readonly string[],
    x: number,
    y0: number,
    sizeM: number,
): Shape[] {
    return lines.map((text, i) => ({
        type: "text",
        x,
        y: y0 + i * sizeM * 1.4,
        sizeM,
        text,
        fill: "text",
    }));
}

/**
 * The info block's text size. On a silk the block must end above the pole
 * marker, halfway down the header, so its text shrinks when the block is long.
 */
function infoTextSize(
    t: ResolvedTemplate,
    short: number,
    marker: number,
    header: number,
    lineCount: number,
): number {
    if (t.surface.orientation !== "poleLeft") return short / 48;
    const room = header / 2 - marker / 2 - t.safeM.top;
    return Math.max(
        short / 200,
        Math.min(short / 48, room / (1.4 * lineCount + 1.5)),
    );
}

/**
 * The info block's text size and wrapped lines. Wrapping makes the block
 * longer, and a silk's must still end above its marker, so a silk's text
 * shrinks once more when wrapping adds lines.
 */
function fitInfoBlock(
    t: ResolvedTemplate,
    short: number,
    marker: number,
    header: number,
    left: number,
): { textSize: number; info: string[] } {
    const room = (size: number) => t.trimM.width - left - size - t.safeM.right;
    let textSize = infoTextSize(
        t,
        short,
        marker,
        header,
        templateInfoLines(t).length,
    );
    let info = fitInfoLines(t, textSize, room(textSize));
    const shrunk = infoTextSize(t, short, marker, header, info.length);
    if (shrunk < textSize) {
        textSize = shrunk;
        info = fitInfoLines(t, textSize, room(textSize));
    }
    return { textSize, info };
}

/** The cut mask (trim minus outline, even-odd), the trim line and the cut line. */
function trimAndCut(
    trimRing: Ring,
    outline: Ring | undefined,
    line: number,
): Shape[] {
    const trim: Shape = {
        type: "line",
        points: trimRing,
        closed: true,
        stroke: "trim",
        widthM: line,
    };
    if (!outline) return [trim];
    return [
        { type: "area", rings: [trimRing, outline], fill: "mask" },
        trim,
        {
            type: "line",
            points: outline,
            closed: true,
            stroke: "trim",
            widthM: line * 2,
        },
    ];
}

/** The dashed safe area: the cut's inset ring, else the inset trim. */
function safeAreaShape(
    t: ResolvedTemplate,
    line: number,
    dashM: number,
): Shape {
    const b = t.bleedM;
    const { width: w, height: h } = t.trimM;
    const safe = t.safeM;
    return {
        type: "line",
        points: t.safeRingM
            ? t.safeRingM.map(([x, y]): Point => [x + b, y + b])
            : rect(
                  b + safe.left,
                  b + safe.top,
                  w - safe.left - safe.right,
                  h - safe.top - safe.bottom,
              ),
        closed: true,
        stroke: "safe",
        widthM: line,
        dashM,
    };
}

export function layoutTemplate(t: ResolvedTemplate): TemplateDrawing {
    const s = t.surface;
    const b = t.bleedM;
    const { width: w, height: h } = t.trimM;
    const pageW = w + 2 * b;
    const pageH = h + 2 * b;
    const short = Math.min(w, h);
    // Thin enough that the trim line never covers the bleed band.
    const line = b > 0 ? Math.min(short / 500, b / 2) : short / 500;
    const marker = short / 12;
    const header = s.header?.m ?? h;
    const safe = t.safeM;
    // Q43: the pole sleeve, a dashed guide along the pole edge.
    const guide = s.kind === "silk" ? sleeveGuide(t, header) : undefined;
    // Right of the sleeve guide on silks.
    const left = guide ? Math.max(safe.left, SLEEVE_GUIDE.m) : safe.left;
    const { textSize, info } = fitInfoBlock(t, short, marker, header, left);
    const at = (p: Point): Point => [p[0] + b, p[1] + b];
    const trimRing = rect(b, b, w, h);
    const shapes: Shape[] = [
        { type: "area", rings: [rect(0, 0, pageW, pageH)], fill: "paper" },
    ];

    if (b > 0)
        shapes.push({
            type: "area",
            rings: [rect(0, 0, pageW, pageH), trimRing],
            fill: "bleed",
        });

    shapes.push(...trimAndCut(trimRing, t.outlineM?.map(at), line));

    shapes.push(safeAreaShape(t, line, short / 60));

    if (guide)
        shapes.push({
            type: "line",
            points: guide.map(at),
            closed: false,
            stroke: "guide",
            widthM: line,
            dashM: short / 120,
        });

    // A silk's marker sits halfway down its pole edge, not its full depth.
    const { tri, labelAt, label } = orientationMarker(
        s.orientation,
        w,
        s.orientation === "poleLeft" ? header : h,
        marker,
        textSize,
    );
    shapes.push({ type: "area", rings: [tri.map(at)], fill: "marker" });
    shapes.push({
        type: "text",
        x: labelAt[0] + b,
        y: labelAt[1] + b,
        sizeM: textSize,
        text: label,
        fill: "marker",
    });

    // Below the marker when it sits on the top edge.
    const top =
        s.orientation === "upTop"
            ? Math.max(safe.top, marker * 1.2 + textSize)
            : safe.top;
    shapes.push(
        ...infoText(
            info,
            b + left + textSize,
            b + top + textSize * 1.5,
            textSize,
        ),
    );

    return {
        surface: s,
        widthM: pageW,
        heightM: pageH,
        bleedM: b,
        trim: { x: b, y: b, width: w, height: h },
        shapes,
    };
}

/**
 * The sleeve guide's ends: the vertical line `SLEEVE_GUIDE` from the pole
 * edge, between where it enters and leaves the cut (the whole header on a
 * rectangle), or undefined if it misses the cut.
 */
export function sleeveGuide(
    t: ResolvedTemplate,
    header: number,
): [Point, Point] | undefined {
    const x = SLEEVE_GUIDE.m;
    if (!(x < t.trimM.width)) return undefined;
    const sleeve = t.surface.sleeve?.m ?? header;
    const outline = t.outlineM;
    if (!outline)
        return [
            [x, 0],
            [x, Math.min(sleeve, t.trimM.height)],
        ];
    // The vertical line's crossings with the closed outline, top first.
    const ys: number[] = [];
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [x0, y0] = outline[j];
        const [x1, y1] = outline[i];
        const right0 = x0 > x;
        const right1 = x1 > x;
        if (right0 !== right1) ys.push(y0 + ((x - x0) * (y1 - y0)) / (x1 - x0));
    }
    ys.sort((a, c) => a - c);
    if (ys.length < 2) return undefined;
    return [
        [x, ys[0]],
        [x, Math.min(ys[1], Math.max(ys[0], sleeve))],
    ];
}

/**
 * A line's dashes as separate segments, for writers without native dashes.
 * Solid lines come back as their segments.
 */
export function lineSegments(
    points: Ring,
    closed: boolean,
    dashM?: number,
): [Point, Point][] {
    const segments: [Point, Point][] = [];
    const n = points.length;
    const count = closed ? n : n - 1;
    let phase = 0; // distance into the current dash period
    for (let i = 0; i < count; i++) {
        const a = points[i];
        const c = points[(i + 1) % n];
        if (!dashM) {
            segments.push([a, c]);
            continue;
        }
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        let d = 0;
        while (d < len) {
            const inDash = phase < dashM;
            const step = Math.min(
                len - d,
                (inDash ? dashM : 2 * dashM) - phase,
            );
            if (inDash) {
                const t0 = d / len;
                const t1 = (d + step) / len;
                segments.push([
                    [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0],
                    [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1],
                ]);
            }
            d += step;
            phase = (phase + step) % (2 * dashM);
        }
    }
    return segments;
}
