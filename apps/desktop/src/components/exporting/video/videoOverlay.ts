import Measure from "@/global/classes/Measure";
import Page from "@/global/classes/Page";

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

/**
 * Draw the overlay HUD in the bottom-left corner of a video frame.
 * Sizes scale with the video height so 720p and 4K look identical.
 */
// eslint-disable-next-line max-lines-per-function
export function drawOverlay(
    ctx: CanvasRenderingContext2D,
    state: OverlayState,
    options: OverlayOptions,
    frameHeight: number,
): void {
    const primarySize = Math.round(frameHeight * 0.032);
    const secondarySize = Math.round(frameHeight * 0.022);
    const padding = Math.round(frameHeight * 0.018);
    const lineGap = Math.round(frameHeight * 0.01);
    const fontFamily =
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    const primaryParts: string[] = [];
    if (options.showSet) {
        primaryParts.push(
            state.previousSetName
                ? `${options.setLabel} ${state.previousSetName} → ${state.setName}`
                : `${options.setLabel} ${state.setName}`,
        );
    }
    if (options.showCounts) {
        primaryParts.push(
            `${options.countLabel} ${state.count} / ${state.totalCounts}`,
        );
    }

    const secondaryParts: string[] = [];
    if (options.showMeasures && state.measureNumber !== null) {
        secondaryParts.push(
            state.rehearsalMark
                ? `[${state.rehearsalMark}]  m. ${state.measureNumber}`
                : `m. ${state.measureNumber}`,
        );
    }
    if (options.showTempo && state.tempoBpm !== null) {
        secondaryParts.push(`${state.tempoBpm} bpm`);
    }
    if (options.showClock) {
        secondaryParts.push(
            `${formatClock(state.timeSeconds)} / ${formatClock(state.totalSeconds)}`,
        );
    }

    const primaryText = primaryParts.join("   ");
    const secondaryText = secondaryParts.join("   ·   ");
    if (!primaryText && !secondaryText) return;

    ctx.save();
    ctx.textBaseline = "alphabetic";

    ctx.font = `600 ${primarySize}px ${fontFamily}`;
    const primaryWidth = primaryText ? ctx.measureText(primaryText).width : 0;
    ctx.font = `400 ${secondarySize}px ${fontFamily}`;
    const secondaryWidth = secondaryText
        ? ctx.measureText(secondaryText).width
        : 0;

    const boxWidth = Math.max(primaryWidth, secondaryWidth) + padding * 2;
    const boxHeight =
        padding * 2 +
        (primaryText ? primarySize : 0) +
        (primaryText && secondaryText ? lineGap : 0) +
        (secondaryText ? secondarySize : 0);
    const boxX = Math.round(frameHeight * 0.025);
    const boxY = frameHeight - Math.round(frameHeight * 0.025) - boxHeight;

    ctx.fillStyle = "rgba(15, 14, 19, 0.7)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(padding / 2));
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    let textY = boxY + padding;
    if (primaryText) {
        ctx.font = `600 ${primarySize}px ${fontFamily}`;
        textY += primarySize;
        ctx.fillText(primaryText, boxX + padding, textY - primarySize * 0.15);
        textY += lineGap;
    }
    if (secondaryText) {
        ctx.font = `400 ${secondarySize}px ${fontFamily}`;
        textY += secondarySize;
        ctx.fillText(
            secondaryText,
            boxX + padding,
            textY - secondarySize * 0.15,
        );
    }

    ctx.restore();
}
