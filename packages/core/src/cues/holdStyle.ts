/**
 * The hold style: what a performer's feet do on counts where their dot
 * doesn't travel. It is not a cue (ADR 0015 D-1): it comes from the styles the
 * performer's holds carry and, elsewhere, the show setting (D-5). The compile
 * hands it out beside the cue types.
 */
import type {
    CompileInput,
    CueMarcher,
    HoldStyleSpan,
    HoldTechnique,
} from "./types";

/** Items (props, equipment with its own row) are never performers. */
export const isItem = (marcher: CueMarcher) =>
    marcher.type === "prop" || marcher.type === "equipment";

/** What the hold style reads of the compile's input. */
export type HoldStyleInput = Pick<
    CompileInput,
    | "beats"
    | "marchers"
    | "showDefaults"
    | "travels"
    | "bandTravels"
    | "holdStyles"
>;

/** Whether any performer travels on each count, from `bandTravels` or else `travels`. */
function bandTravelsByCount(input: HoldStyleInput): boolean[] | null {
    const counts = input.beats.length;
    if (input.bandTravels) {
        const bandTravels = input.bandTravels;
        return Array.from({ length: counts }, (_, c) => bandTravels(c));
    }
    const travels = input.travels;
    if (!travels) return null;
    const performers = input.marchers.filter((m) => !isItem(m));
    return Array.from({ length: counts }, (_, c) =>
        performers.some((m) => travels(m.id, c)),
    );
}

/**
 * The show's hold style on each count (ADR 0015 D-5): a holding performer
 * stands, unless the show's `holdWhileBandMoves` asks for mark time, which it
 * then does on counts where any performer travels (it still stands where the
 * whole band holds). The style only matters on counts the performer's own dot
 * doesn't travel.
 */
function showHoldTechniques(input: HoldStyleInput): HoldTechnique[] {
    const moving = input.showDefaults?.holdWhileBandMoves ?? "stand";
    const band = moving === "stand" ? null : bandTravelsByCount(input);
    return Array.from({ length: input.beats.length }, (_, c) =>
        band?.[c] ? moving : "stand",
    );
}

/**
 * The hold style on each count of each performer whose holds carry a style
 * (`CompileInput.holdStyles`): the show's with each style laid over the counts
 * it covers, so it wins there whether or not the band moves.
 */
function ownHoldTechniques(
    input: HoldStyleInput,
    show: readonly HoldTechnique[],
): Map<number, HoldTechnique[]> {
    const byMarcher = new Map<number, HoldTechnique[]>();
    for (const hold of input.holdStyles ?? []) {
        const from = Math.max(Math.ceil(hold.from), 0);
        const to = Math.min(Math.ceil(hold.to), show.length);
        if (to <= from) continue;
        let own = byMarcher.get(hold.marcherId);
        if (!own) byMarcher.set(hold.marcherId, (own = [...show]));
        own.fill(hold.style, from, to);
    }
    return byMarcher;
}

/** The spans of a hold style given per count: a new span wherever it changes. */
function holdSpans(onHolds: readonly HoldTechnique[]): HoldStyleSpan[] {
    const spans: HoldStyleSpan[] = [];
    onHolds.forEach((style, c) => {
        const last = spans[spans.length - 1];
        if (last && last.style === style) last.to = c + 1;
        else spans.push({ from: c, to: c + 1, style });
    });
    return spans.length > 0
        ? spans
        : [{ from: 0, to: onHolds.length, style: "stand" }];
}

/**
 * Each performer's hold style over the show: their own spans when their holds
 * carry a style, else the show's (the same spans, shared), so `of` answers for
 * any marcher id.
 */
export function holdStyles(input: HoldStyleInput): {
    of(marcherId: number): readonly HoldStyleSpan[];
} {
    const techniques = showHoldTechniques(input);
    const show = holdSpans(techniques);
    const own = new Map(
        [...ownHoldTechniques(input, techniques)].map(
            ([id, onHolds]) => [id, holdSpans(onHolds)] as const,
        ),
    );
    return { of: (marcherId) => own.get(marcherId) ?? show };
}

/** The hold style at count `count`; `stand` outside the spans. */
export function holdStyleAt(
    spans: readonly HoldStyleSpan[],
    count: number,
): HoldTechnique {
    for (const span of spans)
        if (span.from <= count && count < span.to) return span.style;
    return "stand";
}
