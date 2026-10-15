import {
    GUARD_CARRIES,
    cueSettings,
    cueValueLookup,
    defaultCueValue,
    type CueValueLookup,
} from "./library";
import {
    CUE_CHANNELS,
    type CompileInput,
    type CompiledCues,
    type CueChannel,
    type CueTraceDefault,
    type CueEquipment,
    type CueFlagKind,
    type CueInput,
    type CueLibraryItem,
    type CueMarcher,
    type CueNoteKind,
    type CueSection,
    type CueSegment,
    type CueTrace,
    type PerformerCarry,
    type RippleOrder,
} from "./types";

const segmentKey = (marcherId: number, channel: CueChannel) =>
    `${marcherId}:${channel}`;

/**
 * A cue placed for one marcher: `count` is where it was authored (ties are
 * settled there), `at` is where it lands for this marcher after a ripple.
 */
interface PlacedCue {
    cue: CueInput;
    count: number;
    at: number;
}

/** A Feet state's label, from its settings ("½", "2×", "MT"). */
function feetLabel(settings: Readonly<Record<string, unknown>>): string {
    if (settings.pace === "half") return "½";
    if (settings.pace === "double") return "2×";
    if (settings.onHolds === "markTime" || settings.onHolds === "highMarkTime")
        return "MT";
    return "Step";
}

function labelOf(
    lookup: CueValueLookup,
    value: string | null,
    settings: Readonly<Record<string, unknown>> = {},
): string {
    if (value === null) return "";
    if (value === "builtin:feet.step") return feetLabel(settings);
    return lookup(value)?.label ?? "";
}

/**
 * A phrase's length in counts: the cue's, else the shortest its value
 * allows, held to the value's range and never under 2.
 */
function phraseLength(lookup: CueValueLookup, cue: CueInput): number {
    const value = lookup(cue.value);
    const min = Math.max(2, value?.minLength ?? 2);
    const max = Math.max(min, value?.maxLength ?? Infinity);
    return Math.min(max, Math.max(min, cue.length ?? min));
}

function segment(
    lookup: CueValueLookup,
    from: number,
    to: number,
    kind: CueSegment["kind"],
    value: string | null,
    cue: CueInput | null,
    extra: Partial<CueSegment> = {},
): CueSegment {
    return {
        from,
        to,
        kind,
        value,
        label: labelOf(lookup, value, cue?.settings),
        settings: value ? cueSettings(lookup(value), cue?.settings) : {},
        cueId: cue?.id ?? null,
        ...extra,
    };
}

/**
 * A channel's default from count `at`. On Horn/Equipment a new span starts
 * wherever what Carry gives changes (`holds`).
 */
interface DefaultSpan {
    at: number;
    value: string | null;
    /** Settings the default shows beside its value's (the plain silk's color). */
    settings?: Readonly<Record<string, unknown>>;
    holds?: PerformerCarry;
}

function defaultSegment(
    lookup: CueValueLookup,
    from: number,
    to: number,
    span: DefaultSpan,
): CueSegment {
    const seg = segment(lookup, from, to, "default", span.value, null);
    return span.settings
        ? { ...seg, settings: { ...seg.settings, ...span.settings } }
        : seg;
}

/** Whether a value fits a performer holding `holds`. */
const fitsHolds = (
    lookup: CueValueLookup,
    value: string | null,
    holds: PerformerCarry,
) => (value === null ? false : (lookup(value)?.fits.includes(holds) ?? false));

/**
 * The state timeline for one marcher and channel: the default, then each
 * winning state cue landing on its count's click with its transition before
 * it, counted inclusively (a transition of L counts starts on the click of
 * `count - L + 1`; L = 1 is a snap). Carry, Silk and Uniform cut on the
 * click with no transition. Where `defaults` start a new span (what Carry
 * gives changed), a default, or a state that doesn't fit what's now held,
 * gives way to the new default.
 */
function stateTimeline(
    lookup: CueValueLookup,
    marcher: CueMarcher,
    channel: CueChannel,
    states: readonly PlacedCue[],
    counts: number,
    flags: FlagCollector<CueFlagKind>,
    defaults: readonly DefaultSpan[],
): CueSegment[] {
    const out: CueSegment[] = [];
    let current = defaultSegment(lookup, 0, counts, defaults[0]!);
    let previousCount = 0;
    let previous: CueInput | null = null;
    // The authored count of the latest state applied. A ripple moves when a
    // cue lands, not which cue is later: a rippled cue landing after a cue
    // authored on a later count is beaten by it (rule 2).
    let latestAuthored = -Infinity;
    const spansFirst = (e: object) => ("span" in e ? 0 : 1);
    const events = [
        ...defaults.slice(1).map((span) => ({ at: span.at, span })),
        ...states.map((placed) => ({ at: placed.at, placed })),
    ].sort((a, b) => a.at - b.at || spansFirst(a) - spansFirst(b));

    for (const event of events) {
        if ("span" in event) {
            const { span } = event;
            if (
                current.kind !== "default" &&
                span.holds !== undefined &&
                fitsHolds(lookup, current.value, span.holds)
            )
                continue;
            if (span.at > current.from) out.push({ ...current, to: span.at });
            current = defaultSegment(lookup, span.at, counts, span);
            previousCount = Math.max(previousCount, span.at);
            previous = null;
            continue;
        }
        const { cue, at: count, count: authored } = event.placed;
        if (authored < latestAuthored) continue;
        latestAuthored = authored;
        if (HARD_CUT.has(channel)) {
            if (count > current.from) out.push({ ...current, to: count });
            current = segment(lookup, count, counts, "state", cue.value, cue);
            previousCount = count;
            previous = cue;
            continue;
        }
        const length =
            cue.transitionLength ?? lookup(cue.value)?.defaultTransition ?? 1;
        if (previous && count - length + 1 < previousCount)
            flags.add("transition_cut", [previous.id, cue.id], marcher.id);
        const start = Math.max(count - length + 1, previousCount);
        if (start > current.from) out.push({ ...current, to: start });
        out.push(
            start < count
                ? segment(lookup, start, count, "transition", cue.value, cue)
                : segment(lookup, count, count, "transition", cue.value, cue, {
                      snap: true,
                  }),
        );
        current = segment(lookup, count, counts, "state", cue.value, cue);
        previousCount = count;
        previous = cue;
    }
    out.push(current);
    return out;
}

/** Channels that take states only (no Feet phrases in v1). */
const STATES_ONLY: ReadonlySet<CueChannel> = new Set([
    "facing",
    "feet",
    "carry",
    "silk",
    "uniform",
]);

/** Channels whose states cut on their count, ignoring `transitionLength`. */
const HARD_CUT: ReadonlySet<CueChannel> = new Set(["carry", "silk", "uniform"]);

/** Items (props, equipment with its own row) are never performers. */
const isItem = (marcher: CueMarcher) =>
    marcher.type === "prop" || marcher.type === "equipment";

const SPECIFICITY = { band: 0, section: 1, tag: 2, set: 3 } as const;

const specificity = (cue: CueInput) => SPECIFICITY[cue.target.kind];

/** Flags or notes merged across marchers: one per kind and set of cues. */
class FlagCollector<K extends string> {
    private readonly byKey = new Map<
        string,
        { kind: K; cueIds: number[]; marcherIds: number[] }
    >();

    add(kind: K, cueIds: readonly number[], marcherId: number) {
        const ids = [...cueIds].sort((a, b) => a - b);
        const key = `${kind}:${ids.join(",")}`;
        const flag = this.byKey.get(key);
        if (flag) {
            if (!flag.marcherIds.includes(marcherId))
                flag.marcherIds.push(marcherId);
        } else
            this.byKey.set(key, { kind, cueIds: ids, marcherIds: [marcherId] });
    }

    get flags(): { kind: K; cueIds: number[]; marcherIds: number[] }[] {
        return [...this.byKey.values()];
    }
}

/**
 * The cue that wins each count among cues sorted by count: the most specific
 * target, then the newest (highest id), flagging a tie at the top.
 */
function winnersByCount(
    cues: readonly PlacedCue[],
    marcherId: number,
    flags: FlagCollector<CueFlagKind>,
): PlacedCue[] {
    const groups = new Map<number, PlacedCue[]>();
    for (const p of cues) {
        const group = groups.get(p.count);
        if (group) group.push(p);
        else groups.set(p.count, [p]);
    }
    const winners: PlacedCue[] = [];
    for (const group of groups.values()) {
        const top = Math.max(...group.map((p) => specificity(p.cue)));
        const tied = group.filter((p) => specificity(p.cue) === top);
        const winner = tied.reduce((a, b) => (b.cue.id > a.cue.id ? b : a));
        if (tied.length > 1)
            flags.add(
                "clash",
                tied.map((p) => p.cue.id),
                marcherId,
            );
        winners.push(winner);
    }
    return winners.sort((a, b) => a.at - b.at || a.cue.id - b.cue.id);
}

/**
 * Phrase segments for one marcher and channel. A phrase of L counts on
 * count c covers counts c to c + L - 1 (release on c, catch on c + L - 1),
 * so the channel is the phrase's over `[c, c + L)`. A later phrase that
 * starts inside it takes over on its own count, and the overlap is flagged.
 */
function phraseSpans(
    lookup: CueValueLookup,
    phrases: readonly PlacedCue[],
    marcherId: number,
    counts: number,
    flags: FlagCollector<CueFlagKind>,
): CueSegment[] {
    const out: CueSegment[] = [];
    for (const { cue, at: count } of phrases) {
        const length = phraseLength(lookup, cue);
        const previous = out[out.length - 1];
        if (previous && previous.to > count) {
            previous.to = count;
            flags.add("phrase_overlap", [previous.cueId!, cue.id], marcherId);
        }
        out.push(
            segment(
                lookup,
                count,
                Math.min(count + length, counts),
                "phrase",
                cue.value,
                cue,
            ),
        );
    }
    return out;
}

/** Lays `over` on top of `base`, cutting base segments where they overlap. */
function overlay(
    base: readonly CueSegment[],
    over: readonly CueSegment[],
): CueSegment[] {
    if (over.length === 0) return [...base];
    const out: CueSegment[] = [];
    for (const seg of base) {
        let pieces: CueSegment[] = [seg];
        for (const span of over) {
            pieces = pieces.flatMap((p) => {
                if (p.from === p.to)
                    return p.from >= span.from && p.from < span.to ? [] : [p];
                if (p.to <= span.from || p.from >= span.to) return [p];
                const kept: CueSegment[] = [];
                if (p.from < span.from) kept.push({ ...p, to: span.from });
                if (p.to > span.to) kept.push({ ...p, from: span.to });
                return kept;
            });
        }
        out.push(...pieces);
    }
    out.push(...over);
    return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Copies each segment whose value takes over another channel onto that
 * channel, and flags standing-only values (kneel) on counts where the dot
 * travels.
 */
function applyTakeovers(
    lookup: CueValueLookup,
    marcherId: number,
    channels: Map<CueChannel, CueSegment[]>,
    travels: CompileInput["travels"],
    flags: FlagCollector<CueFlagKind>,
): void {
    const taken = new Map<CueChannel, CueSegment[]>();
    for (const [channel, segments] of channels) {
        for (const seg of segments) {
            if (seg.kind === "default" || seg.value === null) continue;
            const value = lookup(seg.value);
            for (const other of value?.takesOver ?? []) {
                if (other === channel) continue;
                const list = taken.get(other) ?? [];
                list.push({ ...seg, takenOverFrom: channel });
                taken.set(other, list);
            }
            if (value?.standingOnly && travels && seg.cueId !== null) {
                for (let c = Math.floor(seg.from); c < Math.ceil(seg.to); c++) {
                    if (travels(marcherId, c)) {
                        flags.add(
                            "takeover_while_moving",
                            [seg.cueId],
                            marcherId,
                        );
                        break;
                    }
                }
            }
        }
    }
    for (const [channel, over] of taken)
        channels.set(channel, overlay(channels.get(channel) ?? [], over));
}

/** Show time at each count's click, and its inverse. */
class TimeMap {
    private readonly clicks: Float64Array;

    constructor(beats: CompileInput["beats"]) {
        this.clicks = new Float64Array(beats.length + 1);
        beats.forEach(
            (b, i) => (this.clicks[i + 1] = this.clicks[i]! + b.duration),
        );
    }

    /** Seconds at count `c` (fractional counts are proportional in the beat). */
    timeAt(c: number): number {
        const last = this.clicks.length - 1;
        const i = Math.min(Math.max(Math.floor(c), 0), Math.max(last - 1, 0));
        const start = this.clicks[i]!;
        return start + (this.clicks[i + 1]! - start) * (c - i);
    }

    /** The fractional count at `seconds`. */
    countAt(seconds: number): number {
        let lo = 0;
        let hi = this.clicks.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (this.clicks[mid]! <= seconds) lo = mid;
            else hi = mid;
        }
        const start = this.clicks[lo]!;
        const length = this.clicks[lo + 1]! - start;
        return length > 0 ? lo + (seconds - start) / length : lo;
    }
}

/**
 * Marchers in a ripple's order. Positional orders read where marchers stand
 * on the cue's count; without positions they fall back to drill order.
 * "Down the form" runs along the form's long axis from the end nearest the
 * first marcher in drill order.
 */
function rippleOrder(
    order: RippleOrder,
    marchers: readonly CueMarcher[],
    count: number,
    positionAt: CompileInput["positionAt"],
): CueMarcher[] {
    const byDrill = [...marchers].sort((a, b) => a.drillOrder - b.drillOrder);
    if (order === "drill" || !positionAt) return byDrill;
    const at = new Map(marchers.map((m) => [m.id, positionAt(m.id, count)]));
    const pos = (m: CueMarcher) => at.get(m.id)!;
    if (order === "left_right" || order === "right_left") {
        const sign = order === "left_right" ? 1 : -1;
        return byDrill.sort((a, b) => sign * (pos(a).x - pos(b).x));
    }
    // down_form: project onto the principal axis of the positions.
    const n = marchers.length;
    const mx = marchers.reduce((t, m) => t + pos(m).x, 0) / n;
    const my = marchers.reduce((t, m) => t + pos(m).y, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const m of marchers) {
        const dx = pos(m).x - mx;
        const dy = pos(m).y - my;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(angle);
    const ay = Math.sin(angle);
    const along = (m: CueMarcher) =>
        (pos(m).x - mx) * ax + (pos(m).y - my) * ay;
    const sorted = byDrill.sort((a, b) => along(a) - along(b));
    const first = along(
        byDrill.reduce((a, b) => (b.drillOrder < a.drillOrder ? b : a)),
    );
    const nearStart =
        Math.abs(first - along(sorted[0]!)) <=
        Math.abs(first - along(sorted[sorted.length - 1]!));
    return nearStart ? sorted : sorted.reverse();
}

/**
 * Where each of a rippled cue's marchers starts: the first on the cue's
 * count, the rest spread evenly in time to the span's last count, in the
 * ripple's order. Feet cues don't ripple.
 */
function rippleCounts(
    cue: CueInput,
    count: number,
    marchers: readonly CueMarcher[],
    time: TimeMap,
    counts: number,
    positionAt: CompileInput["positionAt"],
): Map<number, number> | null {
    const ripple = cue.ripple;
    if (!ripple || cue.channel === "feet" || marchers.length < 2) return null;
    const ordered = rippleOrder(ripple.order, marchers, count, positionAt);
    const start = time.timeAt(count);
    const last = Math.min(count + Math.max(ripple.span, 1) - 1, counts - 1);
    const end = time.timeAt(Math.max(last, count));
    const out = new Map<number, number>();
    ordered.forEach((m, i) => {
        const t = start + ((end - start) * i) / (ordered.length - 1);
        out.set(m.id, i === 0 ? count : time.countAt(t));
    });
    return out;
}

/** Whether the cue's target names the marcher, items included. */
function names(cue: CueInput, marcher: CueMarcher): boolean {
    const target = cue.target;
    switch (target.kind) {
        case "band":
            return true;
        case "section":
            return target.section === marcher.section;
        case "tag":
            return marcher.tagIds.includes(target.tagId);
        case "set":
            return target.marcherIds.includes(marcher.id);
    }
}

/** No target reaches an item, whatever names it. */
function appliesTo(cue: CueInput, marcher: CueMarcher): boolean {
    return !isItem(marcher) && names(cue, marcher);
}

/**
 * One marcher's channel from its applicable cues (sorted by count): the
 * state timeline with the phrases laid over it.
 */
function resolveChannel(
    lookup: CueValueLookup,
    marcher: CueMarcher,
    channel: CueChannel,
    applicable: readonly PlacedCue[],
    counts: number,
    flags: FlagCollector<CueFlagKind>,
    defaults: readonly DefaultSpan[],
): CueSegment[] {
    const states = winnersByCount(
        applicable.filter((p) => p.cue.kind === "state"),
        marcher.id,
        flags,
    );
    const phrases = winnersByCount(
        applicable.filter((p) => p.cue.kind === "phrase"),
        marcher.id,
        flags,
    );
    return overlay(
        stateTimeline(
            lookup,
            marcher,
            channel,
            states,
            counts,
            flags,
            defaults,
        ),
        phraseSpans(lookup, phrases, marcher.id, counts, flags),
    );
}

/** One marcher's channel before take-overs, kept for tracing and reuse. */
interface ChannelResult {
    placed: readonly PlacedCue[];
    base: CueSegment[];
}

/**
 * A marcher's Carry, Silk and Uniform defaults, and what Carry gives over
 * the show, which sets the Horn/Equipment default and the cues that fit.
 */
interface MarcherLooks {
    carry: CueTraceDefault & { holds: PerformerCarry };
    silk: CueTraceDefault;
    uniform: CueTraceDefault;
    /** What Carry gives from each count where it changes, from count 0. */
    holds: readonly { at: number; holds: PerformerCarry }[];
}

/** What a compile keeps beside its output. */
interface CompileState {
    lookup: CueValueLookup;
    channels: Map<string, ChannelResult>;
    /** Flags raised while resolving each channel (clashes, overlaps, cuts). */
    channelFlags: Map<CueChannel, FlagCollector<CueFlagKind>>;
    looks: Map<number, MarcherLooks>;
}

const compileStates = new WeakMap<CompiledCues, CompileState>();

/** What Carry gives the marcher at `count` (the usual, before Carry resolves). */
function holdsAt(looks: MarcherLooks, count: number): PerformerCarry {
    let holds = looks.carry.holds;
    for (const span of looks.holds) {
        if (span.at > count) break;
        holds = span.holds;
    }
    return holds;
}

/** Why a channel shows its default at `count`. */
function defaultTrace(
    looks: MarcherLooks,
    channel: CueChannel,
    count: number,
): CueTraceDefault {
    switch (channel) {
        case "carry": {
            const { holds: _holds, ...carry } = looks.carry;
            return carry;
        }
        case "silk":
            return looks.silk;
        case "uniform":
            return looks.uniform;
        case "horn_equipment": {
            const holds = holdsAt(looks, count);
            return {
                source: "carry",
                value: defaultCueValue(channel, holds),
                carries: holds,
            };
        }
        default:
            return {
                source: "library",
                value: defaultCueValue(channel, looks.carry.holds),
            };
    }
}

/**
 * Why a marcher does what it does on a channel at a count: the cue in
 * effect (null for the default, with where the default comes from) and the
 * applicable cues it beat, latest and most specific first.
 */
export function traceCue(
    compiled: CompiledCues,
    marcherId: number,
    channel: CueChannel,
    count: number,
): CueTrace {
    const segments = compiled.segments(marcherId, channel);
    const current = segments.find((s) => s.from <= count && count < s.to);
    const winner = current?.cueId ?? null;
    const state = compileStates.get(compiled);
    const entry = state?.channels.get(segmentKey(marcherId, channel));
    const takeover = current?.takenOverFrom
        ? { takenOverFrom: current.takenOverFrom }
        : {};
    const looks = state?.looks.get(marcherId);
    const why =
        winner === null && looks
            ? { default: defaultTrace(looks, channel, count) }
            : {};
    if (!state || !entry) return { winner, ...takeover, ...why, beaten: [] };
    const beaten = entry.placed
        .filter(({ cue, at }) => {
            if (cue.id === winner || at > count) return false;
            if (cue.kind === "state") return true;
            const length = phraseLength(state.lookup, cue);
            return count < at + length;
        })
        .sort(
            (a, b) =>
                b.at - a.at ||
                specificity(b.cue) - specificity(a.cue) ||
                b.cue.id - a.cue.id,
        )
        .map((p) => p.cue.id);
    return { winner, ...takeover, ...why, beaten };
}

/** Options for recompiling after an edit. */
export interface RecompileOptions {
    /** The compile before the edit. */
    previous: CompiledCues;
    /**
     * The channels whose cues changed. Every other channel is reused from
     * `previous`, so nothing else may have changed: not the beats, the
     * marchers, the phrase assets, positions, sections, Library items or
     * show defaults. A Carry edit also resolves Horn/Equipment and Silk
     * again, since what is held decides the cues that fit them.
     */
    channels: readonly CueChannel[];
}

const sectionKey = (name: string) => name.trim().toLowerCase();

/** The compile's value lookup, knowing the Library items and equipment it names. */
function compileLookup(input: CompileInput): CueValueLookup {
    const asItem = (e: CueEquipment): CueLibraryItem => ({
        id: e.id,
        channel: "carry",
        name: e.name,
        holds: e.holds,
        ...(e.label !== undefined ? { label: e.label } : {}),
    });
    const equipment = [
        ...(input.sections ?? []).flatMap((s) =>
            s.equipment ? [s.equipment] : [],
        ),
        ...Object.values(input.equipmentFallback ?? {}),
    ];
    return cueValueLookup(input.phraseAssets, input.showDefaults, [
        ...(input.libraryItems ?? []),
        ...equipment.map(asItem),
    ]);
}

/** Each marcher's Carry, Silk and Uniform defaults (ADR 0004 amendment). */
function marcherDefaults(
    input: CompileInput,
): (marcher: CueMarcher) => Omit<MarcherLooks, "holds"> {
    const sections = new Map(
        (input.sections ?? []).map((s) => [sectionKey(s.name), s]),
    );
    const fallback = new Map(
        Object.entries(input.equipmentFallback ?? {}).map(([name, e]) => [
            sectionKey(name),
            e,
        ]),
    );
    return (marcher) => marcherLooks(input, sections, fallback, marcher);
}

function marcherLooks(
    input: CompileInput,
    sections: ReadonlyMap<string, CueSection>,
    fallback: ReadonlyMap<string, CueEquipment>,
    marcher: CueMarcher,
): Omit<MarcherLooks, "holds"> {
    const key = sectionKey(marcher.section);
    const section = sections.get(key);
    const usual = section?.equipment;
    const fromFallback = usual === undefined ? fallback.get(key) : undefined;
    const carry: MarcherLooks["carry"] =
        usual === null
            ? {
                  source: "section_equipment",
                  value: "none",
                  section: marcher.section,
                  holds: "none",
              }
            : usual
              ? {
                    source: "section_equipment",
                    value: usual.id,
                    section: marcher.section,
                    holds: usual.holds,
                }
              : fromFallback
                ? {
                      source: "equipment_fallback",
                      value: fromFallback.id,
                      section: marcher.section,
                      holds: fromFallback.holds,
                  }
                : {
                      source: "marcher_carries",
                      value: defaultCueValue("carry", marcher.carries),
                      holds: marcher.carries,
                  };
    const color = section?.color ?? null;
    const guard = marcher.isGuard ?? GUARD_CARRIES.includes(marcher.carries);
    const defaults = input.showDefaults ?? {};
    return {
        carry,
        silk: {
            source: "section_color",
            value: defaultCueValue("silk", marcher.carries),
            section: marcher.section,
            color,
        },
        uniform: guard
            ? {
                  source: "guard_uniform",
                  value: defaults.guardUniform ?? "builtin:uniform.guard",
              }
            : {
                  source: "band_uniform",
                  value: defaults.bandUniform ?? "builtin:uniform.band",
              },
    };
}

/** What Carry gives over the show, from a marcher's resolved Carry channel. */
function holdsOver(
    lookup: CueValueLookup,
    carry: readonly CueSegment[],
    usual: PerformerCarry,
): MarcherLooks["holds"] {
    const out: { at: number; holds: PerformerCarry }[] = [];
    for (const seg of carry) {
        if (seg.to <= seg.from) continue;
        const holds =
            (seg.value !== null ? lookup(seg.value)?.holds : undefined) ??
            usual;
        if (out[out.length - 1]?.holds !== holds)
            out.push({ at: out.length === 0 ? 0 : seg.from, holds });
    }
    return out.length > 0 ? out : [{ at: 0, holds: usual }];
}

/** The default spans a channel starts from. */
function defaultSpans(looks: MarcherLooks, channel: CueChannel): DefaultSpan[] {
    switch (channel) {
        case "carry":
            return [{ at: 0, value: looks.carry.value }];
        case "silk":
            return [
                {
                    at: 0,
                    value: looks.silk.value,
                    settings: { color: looks.silk.color ?? null },
                },
            ];
        case "uniform":
            return [{ at: 0, value: looks.uniform.value }];
        case "horn_equipment":
            return looks.holds.map(({ at, holds }) => ({
                at,
                value: defaultCueValue(channel, holds),
                holds,
            }));
        default:
            return [
                { at: 0, value: defaultCueValue(channel, looks.carry.holds) },
            ];
    }
}

/**
 * Whether a cue fits a marcher holding `holds`: Carry and Uniform fit every
 * performer, Silk only those carrying a flag, the rest as their value says.
 */
function fitsHolding(
    lookup: CueValueLookup,
    cue: CueInput,
    holds: PerformerCarry,
): boolean {
    switch (cue.channel) {
        case "carry":
        case "uniform":
            return true;
        case "silk":
            return holds === "flag";
        default:
            return fitsHolds(lookup, cue.value, holds);
    }
}

/**
 * Whether skipping a Horn/Equipment cue is down to what Carry gives, so it
 * earns a quiet note: the value fits what the marcher usually carries, or
 * it's guard equipment work on a marcher holding other guard equipment. A
 * horn state on the guard is skipped without one.
 */
function carryMismatch(
    lookup: CueValueLookup,
    cue: CueInput,
    usual: PerformerCarry,
    holds: PerformerCarry,
): boolean {
    if (cue.channel !== "horn_equipment") return false;
    const fits = lookup(cue.value)?.fits ?? [];
    return (
        fits.includes(usual) ||
        (GUARD_CARRIES.includes(holds) &&
            fits.some((f) => GUARD_CARRIES.includes(f)))
    );
}

/** One compile's inputs and working state. */
interface Pass {
    input: CompileInput;
    lookup: CueValueLookup;
    placed: readonly PlacedCue[];
    time: TimeMap;
    previous: CompileState | undefined;
    /** Whether a channel is reused from the previous compile. */
    reused: (channel: CueChannel) => boolean;
    state: CompileState;
}

/**
 * A compile's pass. A Carry edit also resolves Horn/Equipment and Silk
 * again; channels nobody edited keep the previous compile's flags.
 */
function newPass(input: CompileInput, recompile?: RecompileOptions): Pass {
    const lookup = compileLookup(input);
    const previous = recompile && compileStates.get(recompile.previous);
    const edited = new Set(recompile?.channels ?? []);
    if (edited.has("carry")) {
        edited.add("horn_equipment");
        edited.add("silk");
    }
    const reused = (channel: CueChannel) =>
        previous !== undefined && !edited.has(channel);
    return {
        input,
        lookup,
        placed: placeAll(input),
        time: new TimeMap(input.beats),
        previous,
        reused,
        state: {
            lookup,
            channels: new Map(),
            channelFlags: new Map(
                CUE_CHANNELS.map((channel) => [
                    channel,
                    reused(channel)
                        ? previous!.channelFlags.get(channel)!
                        : new FlagCollector<CueFlagKind>(),
                ]),
            ),
            looks: new Map(),
        },
    };
}

/** One marcher's channel: reused from the previous compile, or resolved. */
function resolve(
    pass: Pass,
    marcher: CueMarcher,
    channel: CueChannel,
    looks: MarcherLooks,
    checked: CueChecks,
): ChannelResult {
    const { lookup, state } = pass;
    const key = segmentKey(marcher.id, channel);
    const kept = pass.reused(channel)
        ? pass.previous!.channels.get(key)
        : undefined;
    const result =
        kept ??
        resolveMarcherChannel(
            lookup,
            marcher,
            channel,
            pass.placed.filter(
                (p) =>
                    p.cue.channel === channel &&
                    !checked.notAllowed.has(p.cue.id) &&
                    appliesTo(p.cue, marcher) &&
                    fitsHolding(lookup, p.cue, holdsAt(looks, p.count)),
            ),
            checked.ripples,
            pass.input.beats.length,
            state.channelFlags.get(channel)!,
            defaultSpans(looks, channel),
        );
    state.channels.set(key, result);
    return result;
}

/**
 * Resolves the show's cues into each marcher's behavior per channel
 * (docs/3d/performer-behavior.md sections 2 and 6). Pure. Carry resolves
 * first: what it gives decides the Horn/Equipment default and the
 * Horn/Equipment and Silk cues that fit. With `recompile`, only the edited
 * channels are resolved again; take-overs and the flags and notes that
 * cross channels are always redone.
 */
export function compileCues(
    input: CompileInput,
    recompile?: RecompileOptions,
): CompiledCues {
    const byKey = new Map<string, CueSegment[]>();
    const flags = new FlagCollector<CueFlagKind>();
    const notes = new FlagCollector<CueNoteKind>();
    const pass = newPass(input, recompile);
    const { lookup, state } = pass;
    const defaultsOf = marcherDefaults(input);

    // Carry first: every performer, whatever they hold.
    const carryChecks = checkCues(pass, "carry", () => true, flags, notes);
    for (const marcher of input.marchers) {
        const looks: MarcherLooks = { ...defaultsOf(marcher), holds: [] };
        const carry = resolve(pass, marcher, "carry", looks, carryChecks);
        looks.holds = holdsOver(lookup, carry.base, looks.carry.holds);
        state.looks.set(marcher.id, looks);
    }

    const looksOf = (marcher: CueMarcher) => state.looks.get(marcher.id)!;
    const otherChecks = checkCues(
        pass,
        "others",
        (cue, marcher, count) =>
            fitsHolding(lookup, cue, holdsAt(looksOf(marcher), count)),
        flags,
        notes,
        looksOf,
    );
    for (const marcher of input.marchers) {
        const channels = new Map<CueChannel, CueSegment[]>();
        for (const channel of CUE_CHANNELS) {
            const result =
                channel === "carry"
                    ? state.channels.get(segmentKey(marcher.id, channel))!
                    : resolve(
                          pass,
                          marcher,
                          channel,
                          looksOf(marcher),
                          otherChecks,
                      );
            channels.set(channel, result.base);
        }
        applyTakeovers(lookup, marcher.id, channels, input.travels, flags);
        for (const [channel, segments] of channels)
            byKey.set(segmentKey(marcher.id, channel), segments);
    }

    const compiled: CompiledCues = {
        segments: (marcherId, channel) =>
            byKey.get(segmentKey(marcherId, channel)) ?? [],
        flags: [
            ...flags.flags,
            ...CUE_CHANNELS.flatMap((c) => state.channelFlags.get(c)!.flags),
        ],
        notes: notes.flags,
    };
    compileStates.set(compiled, state);
    return compiled;
}

/** Each cue on its count, sorted by count then id; cues on unknown beats are dropped. */
function placeAll(input: CompileInput): PlacedCue[] {
    const countOfBeat = new Map(input.beats.map((b, i) => [b.id, i]));
    const placed: PlacedCue[] = [];
    for (const cue of input.cues) {
        const count = countOfBeat.get(cue.beatId);
        if (count !== undefined) placed.push({ cue, count, at: count });
    }
    return placed.sort((a, b) => a.count - b.count || a.cue.id - b.cue.id);
}

interface CueChecks {
    ripples: Map<number, Map<number, number>>;
    notAllowed: Set<number>;
}

/**
 * Raises the flags that don't depend on one marcher's channel (fits
 * nobody, a phrase on a states-only channel), notes Horn/Equipment cues
 * skipped for what Carry gives, and works out ripples for the channels
 * being resolved.
 */
function checkCues(
    pass: Pass,
    which: "carry" | "others",
    fitsAt: (cue: CueInput, marcher: CueMarcher, count: number) => boolean,
    flags: FlagCollector<CueFlagKind>,
    notes: FlagCollector<CueNoteKind>,
    looksOf?: (marcher: CueMarcher) => MarcherLooks,
): CueChecks {
    const { input, lookup, reused, time } = pass;
    const counts = input.beats.length;
    const ripples = new Map<number, Map<number, number>>();
    const notAllowed = new Set<number>();
    for (const { cue, count } of pass.placed) {
        if ((cue.channel === "carry") !== (which === "carry")) continue;
        const targeted = input.marchers.filter((m) => appliesTo(cue, m));
        const fitting = targeted.filter((m) => fitsAt(cue, m, count));
        if (targeted.length > 0 && fitting.length === 0)
            for (const m of targeted) flags.add("fits_nobody", [cue.id], m.id);
        // A tag or hand-picked set naming only items reaches nobody.
        if (
            targeted.length === 0 &&
            (cue.target.kind === "tag" || cue.target.kind === "set")
        )
            for (const m of input.marchers)
                if (names(cue, m)) flags.add("fits_nobody", [cue.id], m.id);
        if (looksOf)
            for (const m of targeted) {
                if (fitting.includes(m)) continue;
                const looks = looksOf(m);
                if (
                    carryMismatch(
                        lookup,
                        cue,
                        looks.carry.holds,
                        holdsAt(looks, count),
                    )
                )
                    notes.add("carry_mismatch", [cue.id], m.id);
            }
        if (cue.kind === "phrase" && STATES_ONLY.has(cue.channel)) {
            for (const m of fitting)
                flags.add("kind_not_allowed", [cue.id], m.id);
            notAllowed.add(cue.id);
        }
        if (reused(cue.channel)) continue;
        const rippled = rippleCounts(
            cue,
            count,
            fitting,
            time,
            counts,
            input.positionAt,
        );
        if (rippled) ripples.set(cue.id, rippled);
    }
    return { ripples, notAllowed };
}

/** Places a marcher's applicable cues (after ripples) and resolves them. */
function resolveMarcherChannel(
    lookup: CueValueLookup,
    marcher: CueMarcher,
    channel: CueChannel,
    applicable: readonly PlacedCue[],
    ripples: ReadonlyMap<number, ReadonlyMap<number, number>>,
    counts: number,
    flags: FlagCollector<CueFlagKind>,
    defaults: readonly DefaultSpan[],
): ChannelResult {
    const placed = applicable.map((p) => ({
        ...p,
        at: ripples.get(p.cue.id)?.get(marcher.id) ?? p.count,
    }));
    return {
        placed,
        base: resolveChannel(
            lookup,
            marcher,
            channel,
            placed,
            counts,
            flags,
            defaults,
        ),
    };
}
