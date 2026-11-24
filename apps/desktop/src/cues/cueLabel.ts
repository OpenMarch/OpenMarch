/**
 * A cue's label: a display-only name for how its performers were picked (ADR 0015 D-4), such as
 * "Rifles" or "Color Guard". The cue keeps its own performer list; the label never decides who.
 * Pure, with the words passed in, so tests and the write path read the same answers.
 */
export interface LabelMarcher {
    readonly id: number;
    readonly section: string;
    readonly drill_prefix: string;
    readonly drill_order: number;
}

/** The words a label is made of, translated by the caller. */
export interface LabelWords {
    /** "12 performers" */
    performers: (count: number) => string;
}

/** Everyone holding one item at the playhead, and its plural name ("Rifles"). */
export interface LabelHolders {
    readonly name: string;
    readonly ids: readonly number[];
}

/** At most this many whole sections, or single drill numbers, are named before counting. */
const MAX_NAMED = 3;

const byDrill = (a: LabelMarcher, b: LabelMarcher) =>
    a.drill_prefix.localeCompare(b.drill_prefix) ||
    a.drill_order - b.drill_order;

/** "G1–G6" for one prefix's unbroken run of drill numbers, else null. */
function drillRun(picked: readonly LabelMarcher[]): string | null {
    if (picked.length < 2) return null;
    const sorted = [...picked].sort(byDrill);
    const prefix = sorted[0].drill_prefix;
    for (let i = 1; i < sorted.length; i++)
        if (
            sorted[i].drill_prefix !== prefix ||
            sorted[i].drill_order !== sorted[i - 1].drill_order + 1
        )
            return null;
    const last = sorted[sorted.length - 1];
    return `${prefix}${sorted[0].drill_order}–${prefix}${last.drill_order}`;
}

/** Whole sections picked, in the show's order, or null when any is partly picked. */
function wholeSections(
    picked: readonly LabelMarcher[],
    marchers: readonly LabelMarcher[],
): string[] | null {
    const pickedIds = new Set(picked.map((m) => m.id));
    const sections = [...new Set(picked.map((m) => m.section))];
    for (const section of sections)
        if (marchers.some((m) => m.section === section && !pickedIds.has(m.id)))
            return null;
    return sections;
}

const sameSet = (a: readonly number[], b: ReadonlySet<number>) =>
    a.length === b.size && a.every((id) => b.has(id));

/**
 * How `ids` would be named: everyone holding one kind of equipment at the playhead ("Rifles", when
 * `holders` gives exactly them), whole sections ("Color Guard"), one unbroken run of drill numbers
 * ("G1–G6"), up to three drill numbers ("G1, G4, G7"), or a count ("12 performers").
 */
export function describePerformers({
    ids,
    marchers,
    words,
    holders,
}: {
    ids: readonly number[];
    marchers: readonly LabelMarcher[];
    words: LabelWords;
    /** Who holds each item at the playhead, when that is a fair name. */
    holders?: readonly LabelHolders[];
}): string {
    const unique = [...new Set(ids)];
    const picked = marchers.filter((m) => unique.includes(m.id));
    if (picked.length === 0) return words.performers(unique.length);
    const pickedIds = new Set(picked.map((m) => m.id));
    for (const { name, ids: who } of holders ?? [])
        if (who.length > 0 && sameSet(who, pickedIds)) return name;
    const sections = wholeSections(picked, marchers);
    if (sections && sections.length <= MAX_NAMED) return sections.join(", ");
    const run = drillRun(picked);
    if (run) return run;
    if (picked.length <= MAX_NAMED)
        return [...picked]
            .sort(byDrill)
            .map((m) => `${m.drill_prefix}${m.drill_order}`)
            .join(", ");
    return words.performers(picked.length);
}
