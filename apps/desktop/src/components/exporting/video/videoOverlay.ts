import Measure from "@/global/classes/Measure";
import Page from "@/global/classes/Page";
import { recolorMarcherIconSvg } from "@/assets/open-march-marcher";

/**
 * Optional info overlay drawn on each exported video frame so viewers can
 * tell where they are in the show (set, counts, measure, rehearsal mark,
 * tempo, clock).
 */
export interface OverlayOptions {
    /** Show the current set transition, e.g. "Set 4 → 5" */
    showSet: boolean;
    /** Show the count within the current transition, e.g. "Count 7 / 16" */
    showCounts: boolean;
    /** Show the measure number and active rehearsal mark, e.g. "m. 23" + "A" */
    showMeasures: boolean;
    /** Show the current tempo, e.g. "144 bpm" */
    showTempo: boolean;
    /** Show elapsed / total time, e.g. "1:23 / 6:45" */
    showClock: boolean;
    /** Translated label for "Set" */
    setLabel: string;
    /** Translated label for "Count" */
    countLabel: string;
}

/**
 * Where and how large the overlay is drawn, normalized to the frame size so
 * the same placement works for any export resolution.
 */
export interface OverlayPlacement {
    /** Left edge of the box as a fraction of the frame width (0-1) */
    x: number;
    /** Top edge of the box as a fraction of the frame height (0-1) */
    y: number;
    /** Multiplier on the base font size */
    scale: number;
    /**
     * Maximum box width as a fraction of the frame width. Controls how
     * items wrap: wide enough fits everything on one row, narrower stacks
     * items onto multiple rows.
     */
    widthFraction: number;
}

export const DEFAULT_OVERLAY_PLACEMENT: OverlayPlacement = {
    x: 0.02,
    y: 0.93,
    scale: 1,
    widthFraction: 0.75,
};

/** Pixel rectangle of the drawn overlay box, for preview hit-testing */
export interface OverlayRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OverlayState {
    /** Name of the set the marchers are leaving (null on the first page) */
    previousSetName: string | null;
    /** Name of the set the marchers are moving toward */
    setName: string;
    /** 1-based count within the current transition */
    count: number;
    /** Total counts of the current transition */
    totalCounts: number;
    measureNumber: number | null;
    /** Most recent rehearsal mark at or before the current measure */
    rehearsalMark: string | null;
    tempoBpm: number | null;
    timeSeconds: number;
    totalSeconds: number;
}

/**
 * Precomputed, monotonically-advancing lookup over the show's timing
 * objects. The export loop queries strictly increasing timestamps, so each
 * cursor only ever moves forward, making per-frame lookups O(1).
 */
export class OverlayTimeline {
    private readonly pages: Page[];
    private readonly measures: Measure[];
    private readonly totalSeconds: number;
    private pageCursor = 0;
    private measureCursor = 0;

    constructor(sortedPages: Page[], measures: Measure[]) {
        this.pages = sortedPages;
        this.measures = measures;
        const lastPage = sortedPages[sortedPages.length - 1];
        this.totalSeconds = lastPage
            ? lastPage.timestamp + lastPage.duration
            : 0;
    }

    /**
     * @param timeSeconds - Show time; must not decrease between calls
     */
    getState(timeSeconds: number): OverlayState {
        // Advance to the page whose transition covers this time. The first
        // page has duration 0, so it is skipped immediately.
        while (
            this.pageCursor < this.pages.length - 1 &&
            timeSeconds >=
                this.pages[this.pageCursor].timestamp +
                    this.pages[this.pageCursor].duration
        ) {
            this.pageCursor++;
        }
        const page = this.pages[this.pageCursor];

        // 1-based count within the page: the last beat that has started
        let count = 1;
        for (let i = page.beats.length - 1; i >= 0; i--) {
            if (page.beats[i].timestamp <= timeSeconds) {
                count = i + 1;
                break;
            }
        }

        while (
            this.measureCursor < this.measures.length - 1 &&
            timeSeconds >= this.measures[this.measureCursor + 1].timestamp
        ) {
            this.measureCursor++;
        }
        const measure = this.measures[this.measureCursor] as
            | Measure
            | undefined;
        // The active rehearsal mark is the most recent one at or before the
        // current measure (marks denote the start of a section)
        let rehearsalMark: string | null = null;
        if (measure && measure.timestamp <= timeSeconds) {
            for (let i = this.measureCursor; i >= 0; i--) {
                if (this.measures[i].rehearsalMark) {
                    rehearsalMark = this.measures[i].rehearsalMark;
                    break;
                }
            }
        }

        // Tempo from the beat currently sounding
        const currentBeat = page.beats[count - 1];
        const tempoBpm = currentBeat?.duration
            ? Math.round(60 / currentBeat.duration)
            : null;

        return {
            previousSetName:
                this.pageCursor > 0
                    ? this.pages[this.pageCursor - 1].name
                    : null,
            setName: page.name,
            count,
            totalCounts: Math.max(page.counts, page.beats.length),
            measureNumber:
                measure && measure.timestamp <= timeSeconds
                    ? measure.number
                    : null,
            rehearsalMark,
            tempoBpm,
            timeSeconds,
            totalSeconds: this.totalSeconds,
        };
    }
}

export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

const FONT_FAMILY =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SEPARATOR = "  ·  ";

export interface OverlaySegment {
    text: string;
    bold: boolean;
}

/**
 * Build the list of overlay items to display. Each segment flows like an
 * inline element: segments share a row when they fit within the placement
 * width and wrap onto new rows when they don't.
 */
export function buildOverlaySegments(
    state: OverlayState,
    options: OverlayOptions,
): OverlaySegment[] {
    const segments: OverlaySegment[] = [];
    if (options.showSet) {
        segments.push({
            text: state.previousSetName
                ? `${options.setLabel} ${state.previousSetName} → ${state.setName}`
                : `${options.setLabel} ${state.setName}`,
            bold: true,
        });
    }
    if (options.showCounts) {
        segments.push({
            text: `${options.countLabel} ${state.count} / ${state.totalCounts}`,
            bold: true,
        });
    }
    if (options.showMeasures && state.measureNumber !== null) {
        segments.push({
            text: state.rehearsalMark
                ? `[${state.rehearsalMark}]  m. ${state.measureNumber}`
                : `m. ${state.measureNumber}`,
            bold: false,
        });
    }
    if (options.showTempo && state.tempoBpm !== null) {
        segments.push({ text: `${state.tempoBpm} bpm`, bold: false });
    }
    if (options.showClock) {
        segments.push({
            text: `${formatClock(state.timeSeconds)} / ${formatClock(state.totalSeconds)}`,
            bold: false,
        });
    }
    return segments;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

/**
 * Draw the overlay HUD on a video frame. Position, size, and width all come
 * from the normalized placement, so 720p and 4K renders look identical and
 * the in-modal preview matches the final video.
 *
 * @returns The pixel rect of the drawn box (used by the preview for
 * drag/resize hit-testing), or null if nothing was drawn.
 */
// eslint-disable-next-line max-lines-per-function
export function drawOverlay(
    ctx: CanvasRenderingContext2D,
    state: OverlayState,
    options: OverlayOptions,
    placement: OverlayPlacement,
    frameWidth: number,
    frameHeight: number,
): OverlayRect | null {
    const segments = buildOverlaySegments(state, options);
    if (segments.length === 0) return null;

    const fontSize = Math.max(
        9,
        Math.round(frameHeight * 0.028 * placement.scale),
    );
    const padding = Math.round(fontSize * 0.6);
    const lineHeight = Math.round(fontSize * 1.35);
    const font = (bold: boolean) =>
        `${bold ? 600 : 400} ${fontSize}px ${FONT_FAMILY}`;

    ctx.save();
    const widths = segments.map((segment) => {
        ctx.font = font(segment.bold);
        return ctx.measureText(segment.text).width;
    });
    ctx.font = font(false);
    const separatorWidth = ctx.measureText(SEPARATOR).width;

    // Greedy row wrapping; a single segment is never broken, so the box can
    // always fit the widest item even below the requested width
    const maxContentWidth = Math.max(
        frameWidth * placement.widthFraction - padding * 2,
        ...widths,
    );
    const rows: number[][] = [[]];
    let rowWidth = 0;
    segments.forEach((_, i) => {
        const row = rows[rows.length - 1];
        const addedWidth =
            row.length > 0 ? separatorWidth + widths[i] : widths[i];
        if (row.length > 0 && rowWidth + addedWidth > maxContentWidth) {
            rows.push([i]);
            rowWidth = widths[i];
        } else {
            row.push(i);
            rowWidth += addedWidth;
        }
    });

    const rowWidths = rows.map((row) =>
        row.reduce(
            (total, i, j) => total + widths[i] + (j > 0 ? separatorWidth : 0),
            0,
        ),
    );
    const boxWidth = Math.max(...rowWidths) + padding * 2;
    const boxHeight = rows.length * lineHeight + padding * 2;
    const boxX = clamp(
        placement.x * frameWidth,
        0,
        Math.max(0, frameWidth - boxWidth),
    );
    const boxY = clamp(
        placement.y * frameHeight,
        0,
        Math.max(0, frameHeight - boxHeight),
    );

    ctx.fillStyle = "rgba(15, 14, 19, 0.7)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(padding * 0.66));
    ctx.fill();

    ctx.textBaseline = "middle";
    rows.forEach((row, rowIndex) => {
        let textX = boxX + padding;
        const textY = boxY + padding + rowIndex * lineHeight + lineHeight / 2;
        row.forEach((i, j) => {
            if (j > 0) {
                ctx.font = font(false);
                ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
                ctx.fillText(SEPARATOR, textX, textY);
                textX += separatorWidth;
            }
            ctx.font = font(segments[i].bold);
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.fillText(segments[i].text, textX, textY);
            textX += widths[i];
        });
    });

    ctx.restore();
    return { x: boxX, y: boxY, width: boxWidth, height: boxHeight };
}

/* ------------------------------ Branding ------------------------------ */

export const BRANDING_TEXT = "Made with OpenMarch";

let logoPromise: Promise<HTMLImageElement | null> | null = null;

/** Load the OpenMarch marcher icon (recolored white) for canvas drawing. Cached. */
export function loadBrandingLogo(): Promise<HTMLImageElement | null> {
    if (!logoPromise) {
        logoPromise = new Promise((resolve) => {
            const svg = recolorMarcherIconSvg("#ffffff");
            const url = URL.createObjectURL(
                new Blob([svg], { type: "image/svg+xml" }),
            );
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }
    return logoPromise;
}

/**
 * Draw the "Made with OpenMarch" watermark in the bottom-right corner of a
 * video frame.
 */
export function drawBranding(
    ctx: CanvasRenderingContext2D,
    logo: HTMLImageElement | null,
    frameWidth: number,
    frameHeight: number,
): void {
    const fontSize = Math.max(8, Math.round(frameHeight * 0.019));
    const margin = Math.round(frameHeight * 0.02);
    const padding = Math.round(fontSize * 1);
    const verticalPadding = Math.round(padding / 2);

    ctx.save();
    ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(BRANDING_TEXT).width;
    const logoHeight = Math.round(fontSize * 1.4);
    const logoWidth = logo
        ? Math.round(logoHeight * (logo.width / logo.height))
        : 0;
    const gap = logo ? Math.round(fontSize * 0.5) : 0;

    const boxWidth = padding * 2 + logoWidth + gap + textWidth;
    const boxHeight = Math.max(logoHeight, fontSize) + verticalPadding * 2;
    const boxX = frameWidth - margin - boxWidth;
    const boxY = frameHeight - margin - boxHeight;

    ctx.fillStyle = "rgba(15, 14, 19, 0.55)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(boxHeight / 2));
    ctx.fill();

    const centerY = boxY + boxHeight / 2;
    if (logo) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(
            logo,
            boxX + padding,
            centerY - logoHeight / 2,
            logoWidth,
            logoHeight,
        );
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillText(BRANDING_TEXT, boxX + padding + logoWidth + gap, centerY);
    ctx.restore();
}
