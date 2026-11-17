import {
    GUARD_CARRIES,
    cueSettings,
    cueValueLookup,
    defaultCueValue,
    equipmentValue,
    type CueValueLookup,
} from "./library";
import { holdStyles, isItem } from "./holdStyle";
import {
    CUE_TYPES,
    isCueType,
    type CompileInput,
    type CompiledCues,
    type CueEquipment,
    type CueFlagKind,
    type CueInput,
    type CueMarcher,
    type CueNoteKind,
    type CueSection,
    type CueSegment,
    type CueTrace,
    type CueTraceDefault,
    type CueType,
    type CueValue,
    type PerformerCarry,
} from "./types";

const segmentKey = (marcherId: number, type: CueType) => `${marcherId}:${type}`;

/** A cue this build can compile, on its count. */
interface PlacedCue {
    cue: CueInput;
    type: CueType;
    value: CueValue;
    count: number;
    /** A momentary cue's length in counts; null for a lasting cue. */
    length: number | null;
}

function segment(
    from: number,
    to: number,
    kind: CueSegment["kind"],
    value: CueValue | undefined,
    cue: CueInput | null,
    extra: Partial<CueSegment> = {},
): CueSegment {
    return {
        from,
        to,
        kind,
        value: value?.id ?? null,
        label: value?.label ?? "",
        settings: value ? cueSettings(value, cue?.settings) : {},
        cueId: cue?.id ?? null,
        ...extra,
    };
}

/**
 * A type's default from count `at`. On Position a new span starts wherever
 * what Equipment gives changes.
 */
interface DefaultSpan {
    at: number;
    value: string | null;
    /** Settings the default shows beside its value's (the plain silk's color). */
    settings?: Readonly<Record<string, unknown>>;
}

function defaultSegment(
    lookup: CueValueLookup,
    from: number,
    to: number,
    span: DefaultSpan,
    extra: Partial<CueSegment> = {},
): CueSegment {
    const value = span.value === null ? undefined : lookup(span.value);
    const seg = segment(from, to, "default", value, null, extra);
    // a default the lookup doesn't know (an equipment id the app names) keeps its id
    if (!value) seg.value = span.value;
    return span.settings
        ? { ...seg, settings: { ...seg.settings, ...span.settings } }
        : seg;
}

/** The default span in effect at `count`. */
function defaultAt(defaults: readonly DefaultSpan[], count: number) {
    let found = defaults[0]!;
    for (const span of defaults) {
        if (span.at > count) break;
        found = span;
    }
    return found;
}

/**
 * How many counts a cue's change takes, landing on its count (1 is a snap);
 * 0 for a value that cuts on its count, whatever the cue says.
 */
function transitionOf({ cue, value }: PlacedCue): number {
    if (value.defaultTransition === undefined) return 0;
    return Math.max(1, cue.transition ?? value.defaultTransition);
}

/** The transition into a cue landing on `count`, starting no earlier than `floor`. */
function transitionSegment(
    placed: PlacedCue,
    count: number,
    floor: number,
): CueSegment | null {
    const length = transitionOf(placed);
    if (length === 0) return null;
    const start = Math.max(count - length + 1, floor);
    return start < count
        ? segment(start, count, "transition", placed.value, placed.cue)
        : segment(count, count, "transition", placed.value, placed.cue, {
              snap: true,
          });
}

/**
 * The lasting timeline for one performer and type: the default, then each
 * lasting cue landing on its count's click with its transition before it,
 * counted inclusively (a transition of L counts starts on the click of
 * `count - L + 1`; L = 1 is a snap). A value that cuts has no transition.
 * Where `defaults` start a new span (what Equipment gives changed), the
 * parameter returns to the new default until its next cue (ADR 0015 D-3).
 */
function lastingTimeline(
    lookup: CueValueLookup,
    marcherId: number,
    lasting: readonly PlacedCue[],
    counts: number,
    flags: FlagCollector<CueFlagKind>,
    defaults: readonly DefaultSpan[],
): CueSegment[] {
    const out: CueSegment[] = [];
    let current = defaultSegment(lookup, 0, counts, defaults[0]!);
    let previousCount = 0;
    let previous: CueInput | null = null;
    const spansFirst = (e: object) => ("span" in e ? 0 : 1);
    const events = [
        ...defaults.slice(1).map((span) => ({ at: span.at, span })),
        ...lasting.map((placed) => ({ at: placed.count, placed })),
    ].sort((a, b) => a.at - b.at || spansFirst(a) - spansFirst(b));

    for (const event of events) {
        if ("span" in event) {
            const { span } = event;
            if (span.at > current.from) out.push({ ...current, to: span.at });
            current = defaultSegment(lookup, span.at, counts, span);
            previousCount = Math.max(previousCount, span.at);
            previous = null;
            continue;
        }
        const { placed } = event;
        const { cue, count, value } = placed;
        const length = transitionOf(placed);
        if (previous && length > 0 && count - length + 1 < previousCount)
            flags.add("transition_cut", [previous.id, cue.id], marcherId);
        const transition = transitionSegment(placed, count, previousCount);
        const start = transition?.from ?? count;
        if (start > current.from) out.push({ ...current, to: start });
        if (transition) out.push(transition);
        current = segment(count, counts, "lasting", value, cue);
        previousCount = count;
        previous = cue;
    }
    out.push(current);
    return out;
}

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
 * Of one performer's cues of a type and kind, sorted by count, the one that
 * wins each count: the newest (highest id), flagging the tie.
 */
function winnersByCount(
    cues: readonly PlacedCue[],
    marcherId: number,
    flags: FlagCollector<CueFlagKind>,
): PlacedCue[] {
    const winners: PlacedCue[] = [];
    for (const placed of cues) {
        const last = winners[winners.length - 1];
        if (!last || last.count !== placed.count) {
            winners.push(placed);
            continue;
        }
        flags.add("clash", [last.cue.id, placed.cue.id], marcherId);
        if (placed.cue.id > last.cue.id) winners[winners.length - 1] = placed;
    }
    return winners;
}

/**
 * The momentary cues' segments for one performer and type. A cue of L counts
 * on count c covers counts c to c + L - 1, so the parameter is the cue's over
 * `[c, c + L)`; its transition, if its value has one, leads into c. A later
 * momentary cue that starts inside it takes over on its own count, and the
 * overlap is flagged. A cue ends where `endsAt` says the parameter resets
 * (Position, when Equipment changes).
 */
function momentarySpans(
    momentary: readonly PlacedCue[],
    marcherId: number,
    counts: number,
    flags: FlagCollector<CueFlagKind>,
    endsAt: (count: number) => number,
): CueSegment[] {
    const out: CueSegment[] = [];
    let previous: { seg: CueSegment; count: number } | null = null;
    for (const placed of momentary) {
        const { cue, count, value } = placed;
        if (previous && previous.seg.to > count)
            flags.add(
                "momentary_overlap",
                [previous.seg.cueId!, cue.id],
                marcherId,
            );
        const transition = transitionSegment(
            placed,
            count,
            previous?.count ?? 0,
        );
        const start = transition?.from ?? count;
        if (previous && previous.seg.to > start) previous.seg.to = start;
        if (transition) out.push(transition);
        const seg = segment(
            count,
            Math.min(count + placed.length!, counts, endsAt(count)),
            "momentary",
            value,
            cue,
        );
        out.push(seg);
        previous = { seg, count };
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
 * Where a value shows only while the dot holds (a kneel), gives the counts on
 * which the dot travels back to the default, and flags the cue. The default
 * segment names the cue it hides.
 */
function hideWhileMoving(
    lookup: CueValueLookup,
    marcherId: number,
    segments: readonly CueSegment[],
    travels: NonNullable<CompileInput["travels"]>,
    defaults: readonly DefaultSpan[],
    flags: FlagCollector<CueFlagKind>,
): CueSegment[] {
    const out: CueSegment[] = [];
    for (const seg of segments) {
        const standingOnly =
            (seg.kind === "lasting" || seg.kind === "momentary") &&
            seg.cueId !== null &&
            seg.value !== null &&
            lookup(seg.value)?.standingOnly;
        if (!standingOnly) {
            out.push(seg);
            continue;
        }
        let run: { from: number; moving: boolean } | null = null;
        const close = (to: number) => {
            if (!run) return;
            out.push(
                run.moving
                    ? defaultSegment(
                          lookup,
                          run.from,
                          to,
                          defaultAt(defaults, run.from),
                          { hiddenCueId: seg.cueId! },
                      )
                    : { ...seg, from: run.from, to },
            );
        };
        for (let c = seg.from; c < seg.to; c++) {
            const moving = travels(marcherId, c);
            if (run && run.moving === moving) continue;
            close(c);
            run = { from: c, moving };
            if (moving)
                flags.add(
                    "standing_only_while_moving",
                    [seg.cueId!],
                    marcherId,
                );
        }
        close(seg.to);
    }
    return out;
}

/** One performer's cue type, kept for tracing and reuse. */
interface TypeResult {
    /** The performer's cues of the type that fit them, by count then id. */
    placed: readonly PlacedCue[];
    segments: CueSegment[];
}

/**
 * A performer's Equipment, Silk and Look defaults, and what Equipment gives
 * over the show, which sets the Position default and the cues that fit.
 */
interface PerformerDefaults {
    equipment: CueTraceDefault & { holds: PerformerCarry };
    silk: CueTraceDefault;
    look: CueTraceDefault;
    /** What Equipment gives from each count where its value changes, from count 0. */
    holds: readonly { at: number; holds: PerformerCarry }[];
}

/** What a compile keeps beside its output. */
interface CompileState {
    lookup: CueValueLookup;
    /** The performers, in the input's order. */
    performers: readonly CueMarcher[];
    results: Map<string, TypeResult>;
    /** Flags raised while resolving each type (clashes, overlaps, cuts). */
    typeFlags: Map<CueType, FlagCollector<CueFlagKind>>;
    defaults: Map<number, PerformerDefaults>;
}

const compileStates = new WeakMap<CompiledCues, CompileState>();

/** What Equipment gives the performer at `count` (the usual, before Equipment resolves). */
function holdsAt(defaults: PerformerDefaults, count: number): PerformerCarry {
    let holds = defaults.equipment.holds;
    for (const span of defaults.holds) {
        if (span.at > count) break;
        holds = span.holds;
    }
    return holds;
}

/** The first count after `count` where what Equipment gives changes, or Infinity. */
function nextEquipmentChange(defaults: PerformerDefaults, count: number) {
    for (const span of defaults.holds) if (span.at > count) return span.at;
    return Infinity;
}

/** Why a type shows its default at `count`. */
function defaultTrace(
    defaults: PerformerDefaults,
    type: CueType,
    count: number,
): CueTraceDefault {
    switch (type) {
        case "equipment": {
            const { holds: _holds, ...equipment } = defaults.equipment;
            return equipment;
        }
        case "silk":
            return defaults.silk;
        case "look":
            return defaults.look;
        case "position": {
            const holds = holdsAt(defaults, count);
            return {
                source: "equipment",
                value: defaultCueValue(type, holds),
                holds,
            };
        }
        default:
            return {
                source: "library",
                value: defaultCueValue(type, defaults.equipment.holds),
            };
    }
}

/** The non-empty segment that covers `count`. */
const segmentAt = (segments: readonly CueSegment[], count: number) =>
    segments.find((s) => s.from <= count && count < s.to);

/**
 * Why a performer's parameter is what it is at a count: the cue in effect
 * (null for the default, with where the default comes from) and the
 * performer's other cues of the type that would apply there, latest first.
 */
export function traceCue(
    compiled: CompiledCues,
    marcherId: number,
    type: CueType,
    count: number,
): CueTrace {
    const current = segmentAt(compiled.segments(marcherId, type), count);
    const winner = current?.cueId ?? null;
    const hidden =
        current?.hiddenCueId !== undefined
            ? { hidden: current.hiddenCueId }
            : {};
    const state = compileStates.get(compiled);
    const entry = state?.results.get(segmentKey(marcherId, type));
    const defaults = state?.defaults.get(marcherId);
    const why =
        winner === null && defaults
            ? { default: defaultTrace(defaults, type, count) }
            : {};
    if (!entry) return { winner, ...why, ...hidden, beaten: [] };
    const beaten = entry.placed
        .filter(({ cue, count: at, length }) => {
            if (cue.id === winner || cue.id === current?.hiddenCueId)
                return false;
            if (at > count) return false;
            return length === null || count < at + length;
        })
        .sort((a, b) => b.count - a.count || b.cue.id - a.cue.id)
        .map((p) => p.cue.id);
    return { winner, ...why, ...hidden, beaten };
}

/**
 * The value a performer's parameter has at a count's click. A transition
 * hasn't landed: until its count, the value before it is still in place.
 */
export function cueValueAt(
    compiled: CompiledCues,
    marcherId: number,
    type: CueType,
    count: number,
): string | null {
    let landed: string | null = null;
    for (const seg of compiled.segments(marcherId, type)) {
        if (seg.from > count) break;
        if (seg.kind !== "transition" || seg.to <= count) landed = seg.value;
    }
    return landed;
}

/**
 * Who has a value of a cue type on a count (ADR 0015 D-10): the performers
 * whose parameter is `value` at that count's click, in the input's order.
 */
export function whoHasValue(
    compiled: CompiledCues,
    type: CueType,
    value: string,
    count: number,
): number[] {
    const performers = compileStates.get(compiled)?.performers ?? [];
    return performers
        .filter((m) => cueValueAt(compiled, m.id, type, count) === value)
        .map((m) => m.id);
}

/** What a performer holds at a count's click, as the cue compile groups it. */
export function heldAt(
    compiled: CompiledCues,
    marcherId: number,
    count: number,
): PerformerCarry {
    const state = compileStates.get(compiled);
    const usual = state?.defaults.get(marcherId)?.equipment.holds ?? "none";
    const value = cueValueAt(compiled, marcherId, "equipment", count);
    return (value !== null ? state?.lookup(value)?.holds : undefined) ?? usual;
}

/**
 * Who holds a kind of equipment on a count, whatever their section and
 * whichever piece it is ("select Rifles", ADR 0015 D-4), in the input's order.
 */
export function whoHolds(
    compiled: CompiledCues,
    holds: PerformerCarry,
    count: number,
): number[] {
    const performers = compileStates.get(compiled)?.performers ?? [];
    return performers
        .filter((m) => heldAt(compiled, m.id, count) === holds)
        .map((m) => m.id);
}

/** Options for recompiling after an edit. */
export interface RecompileOptions {
    /** The compile before the edit. */
    previous: CompiledCues;
    /**
     * The cue types whose cues changed. Every other type is reused from
     * `previous`, so nothing else may have changed: not the beats, the
     * marchers, the added values, the sections, `travels` or the show
     * defaults. An Equipment edit also resolves Position and Silk again,
     * since what is held decides the cues that fit them.
     */
    types: readonly CueType[];
}

const sectionKey = (name: string) => name.trim().toLowerCase();

/** The compile's value lookup, knowing the values and equipment the input names. */
function compileLookup(input: CompileInput): CueValueLookup {
    const equipment: CueEquipment[] = [
        ...(input.sections ?? []).flatMap((s) =>
            s.equipment ? [s.equipment] : [],
        ),
        ...Object.values(input.equipmentFallback ?? {}),
    ];
    return cueValueLookup([
        ...(input.values ?? []),
        ...equipment.map(equipmentValue),
    ]);
}

/** Each performer's Equipment, Silk and Look defaults. */
function performerDefaultsOf(
    input: CompileInput,
): (marcher: CueMarcher) => Omit<PerformerDefaults, "holds"> {
    const sections = new Map(
        (input.sections ?? []).map((s) => [sectionKey(s.name), s]),
    );
    const fallback = new Map(
        Object.entries(input.equipmentFallback ?? {}).map(([name, e]) => [
            sectionKey(name),
            e,
        ]),
    );
    return (marcher) => performerDefaults(input, sections, fallback, marcher);
}

function performerDefaults(
    input: CompileInput,
    sections: ReadonlyMap<string, CueSection>,
    fallback: ReadonlyMap<string, CueEquipment>,
    marcher: CueMarcher,
): Omit<PerformerDefaults, "holds"> {
    const key = sectionKey(marcher.section);
    const section = sections.get(key);
    const usual = section?.equipment;
    const fromFallback = usual === undefined ? fallback.get(key) : undefined;
    const equipment: PerformerDefaults["equipment"] =
        usual === null
            ? {
                  source: "section_equipment",
                  value: defaultCueValue("equipment", "none"),
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
                      value: defaultCueValue("equipment", marcher.carries),
                      holds: marcher.carries,
                  };
    const color = section?.color ?? null;
    const guard = marcher.isGuard ?? GUARD_CARRIES.includes(marcher.carries);
    const show = input.showDefaults ?? {};
    return {
        equipment,
        silk: {
            source: "section_color",
            value: defaultCueValue("silk", marcher.carries),
            section: marcher.section,
            color,
        },
        look: guard
            ? {
                  source: "guard_look",
                  value: show.guardLook ?? "builtin:look.guard",
              }
            : {
                  source: "band_look",
                  value: show.bandLook ?? "builtin:look.band",
              },
    };
}

/** What Equipment gives over the show, from a performer's resolved Equipment. */
function holdsOver(
    lookup: CueValueLookup,
    equipment: readonly CueSegment[],
    usual: PerformerCarry,
): PerformerDefaults["holds"] {
    const out: { at: number; holds: PerformerCarry }[] = [];
    let last: string | null | undefined;
    for (const seg of equipment) {
        if (seg.to <= seg.from) continue;
        if (out.length > 0 && seg.value === last) continue;
        last = seg.value;
        const holds =
            (seg.value !== null ? lookup(seg.value)?.holds : undefined) ??
            usual;
        out.push({ at: out.length === 0 ? 0 : seg.from, holds });
    }
    return out.length > 0 ? out : [{ at: 0, holds: usual }];
}

/** The default spans a type starts from. */
function defaultSpans(
    defaults: PerformerDefaults,
    type: CueType,
): DefaultSpan[] {
    switch (type) {
        case "equipment":
            return [{ at: 0, value: defaults.equipment.value }];
        case "silk":
            return [
                {
                    at: 0,
                    value: defaults.silk.value,
                    settings: { color: defaults.silk.color ?? null },
                },
            ];
        case "look":
            return [{ at: 0, value: defaults.look.value }];
        case "position":
            return defaults.holds.map(({ at, holds }) => ({
                at,
                value: defaultCueValue(type, holds),
            }));
        default:
            return [
                {
                    at: 0,
                    value: defaultCueValue(type, defaults.equipment.holds),
                },
            ];
    }
}

/**
 * Whether a cue fits a performer holding `holds`: Equipment fits every
 * performer, Silk only those holding a flag, the rest as their value says
 * (a Position value fits only the equipment it names).
 */
function fitsHolding(placed: PlacedCue, holds: PerformerCarry): boolean {
    switch (placed.type) {
        case "equipment":
            return true;
        case "silk":
            return holds === "flag";
        default:
            return placed.value.fits.includes(holds);
    }
}

/**
 * Whether skipping a Position cue is down to what Equipment gives, so it
 * earns a quiet note: the value fits what the performer usually holds, or
 * it's guard equipment work on a performer holding other guard equipment. A
 * horn position on the guard is skipped without one.
 */
function equipmentMismatch(
    placed: PlacedCue,
    usual: PerformerCarry,
    holds: PerformerCarry,
): boolean {
    if (placed.type !== "position") return false;
    const { fits } = placed.value;
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
    /** Each performer's cues by type (`segmentKey`), by count then id. */
    cuesOf: ReadonlyMap<string, readonly PlacedCue[]>;
    previous: CompileState | undefined;
    /** Whether a type is reused from the previous compile. */
    reused: (type: CueType) => boolean;
    state: CompileState;
}

/**
 * A compile's pass. An Equipment edit also resolves Position and Silk again;
 * types nobody edited keep the previous compile's flags.
 */
function newPass(
    input: CompileInput,
    flags: FlagCollector<CueFlagKind>,
    recompile?: RecompileOptions,
): Pass {
    const lookup = compileLookup(input);
    const previous = recompile && compileStates.get(recompile.previous);
    const edited = new Set(recompile?.types ?? []);
    if (edited.has("equipment")) {
        edited.add("position");
        edited.add("silk");
    }
    const reused = (type: CueType) =>
        previous !== undefined && !edited.has(type);
    const performers = input.marchers.filter((m) => !isItem(m));
    const performerIds = new Set(performers.map((m) => m.id));
    const placed = placeAll(input, lookup, flags);
    const cuesOf = new Map<string, PlacedCue[]>();
    for (const p of placed)
        for (const marcherId of new Set(p.cue.marcherIds)) {
            if (!performerIds.has(marcherId)) continue;
            const key = segmentKey(marcherId, p.type);
            const list = cuesOf.get(key);
            if (list) list.push(p);
            else cuesOf.set(key, [p]);
        }
    return {
        input,
        lookup,
        placed,
        cuesOf,
        previous,
        reused,
        state: {
            lookup,
            performers,
            results: new Map(),
            typeFlags: new Map(
                CUE_TYPES.map((type) => [
                    type,
                    reused(type)
                        ? previous!.typeFlags.get(type)!
                        : new FlagCollector<CueFlagKind>(),
                ]),
            ),
            defaults: new Map(),
        },
    };
}

/** One performer's type: reused from the previous compile, or resolved. */
function resolve(
    pass: Pass,
    marcher: CueMarcher,
    type: CueType,
    defaults: PerformerDefaults,
): TypeResult {
    const key = segmentKey(marcher.id, type);
    const kept = pass.reused(type)
        ? pass.previous!.results.get(key)
        : undefined;
    const result = kept ?? resolveType(pass, marcher, type, defaults);
    pass.state.results.set(key, result);
    return result;
}

/**
 * One performer's type from their cues: the lasting timeline with the
 * momentary cues laid over it. A cue's fit is checked on its count, against
 * what Equipment gives the performer there.
 */
function resolveType(
    pass: Pass,
    marcher: CueMarcher,
    type: CueType,
    defaults: PerformerDefaults,
): TypeResult {
    const { lookup, state, input } = pass;
    const counts = input.beats.length;
    const flags = state.typeFlags.get(type)!;
    const spans = defaultSpans(defaults, type);
    const placed = (pass.cuesOf.get(segmentKey(marcher.id, type)) ?? []).filter(
        (p) => fitsHolding(p, holdsAt(defaults, p.count)),
    );
    const lasting = winnersByCount(
        placed.filter((p) => p.length === null),
        marcher.id,
        flags,
    );
    const momentary = winnersByCount(
        placed.filter((p) => p.length !== null),
        marcher.id,
        flags,
    );
    const resolved = overlay(
        lastingTimeline(lookup, marcher.id, lasting, counts, flags, spans),
        momentarySpans(momentary, marcher.id, counts, flags, (count) =>
            type === "position"
                ? nextEquipmentChange(defaults, count)
                : Infinity,
        ),
    );
    return {
        placed,
        segments: input.travels
            ? hideWhileMoving(
                  lookup,
                  marcher.id,
                  resolved,
                  input.travels,
                  spans,
                  flags,
              )
            : resolved,
    };
}

/**
 * Resolves the show's cues into each performer's parameters per cue type
 * (ADR 0015 D-2 to D-4, D-10). Pure.
 *
 * - Each type is one parameter: a cue never touches another type's.
 * - A lasting cue sets it from its count until the performer's next lasting
 *   cue of the type. A momentary cue sits over that for its length, then the
 *   lasting value shows again.
 * - For a performer and type, the latest cue wins; of two on one count, the
 *   newer (and the tie is flagged).
 * - Equipment resolves first: what it gives decides the Position default and
 *   the Position and Silk cues that fit.
 *
 * With `recompile`, only the edited types are resolved again; the flags and
 * notes that cross types are always redone.
 */
export function compileCues(
    input: CompileInput,
    recompile?: RecompileOptions,
): CompiledCues {
    const byKey = new Map<string, CueSegment[]>();
    const flags = new FlagCollector<CueFlagKind>();
    const notes = new FlagCollector<CueNoteKind>();
    const pass = newPass(input, flags, recompile);
    const { lookup, state } = pass;
    const defaultsOf = performerDefaultsOf(input);

    // Equipment first: every performer, whatever they hold.
    for (const marcher of state.performers) {
        const defaults: PerformerDefaults = {
            ...defaultsOf(marcher),
            holds: [],
        };
        const equipment = resolve(pass, marcher, "equipment", defaults);
        defaults.holds = holdsOver(
            lookup,
            equipment.segments,
            defaults.equipment.holds,
        );
        state.defaults.set(marcher.id, defaults);
    }
    checkCues(pass, flags, notes);
    for (const marcher of state.performers) {
        const defaults = state.defaults.get(marcher.id)!;
        for (const type of CUE_TYPES) {
            const result =
                type === "equipment"
                    ? state.results.get(segmentKey(marcher.id, type))!
                    : resolve(pass, marcher, type, defaults);
            byKey.set(segmentKey(marcher.id, type), result.segments);
        }
    }

    const holds = holdStyles(input);
    const compiled: CompiledCues = {
        segments: (marcherId, type) =>
            byKey.get(segmentKey(marcherId, type)) ?? [],
        holdStyle: (marcherId) => holds.of(marcherId),
        flags: [
            ...flags.flags,
            ...CUE_TYPES.flatMap((t) => state.typeFlags.get(t)!.flags),
        ],
        notes: notes.flags,
    };
    compileStates.set(compiled, state);
    return compiled;
}

/**
 * Each cue this build can compile on its count, sorted by count then id.
 * Left out: a cue of a type this build doesn't know (kept, never flagged), a
 * cue on an unknown beat, a cue whose value isn't one of its type's, and a
 * lasting cue on a momentary-only value or the reverse (both flagged).
 */
function placeAll(
    input: CompileInput,
    lookup: CueValueLookup,
    flags: FlagCollector<CueFlagKind>,
): PlacedCue[] {
    const countOfBeat = new Map(input.beats.map((b, i) => [b.id, i]));
    const known = new Set(input.marchers.map((m) => m.id));
    const flagAll = (kind: CueFlagKind, cue: CueInput) => {
        for (const id of cue.marcherIds)
            if (known.has(id)) flags.add(kind, [cue.id], id);
    };
    const placed: PlacedCue[] = [];
    for (const cue of input.cues) {
        if (!isCueType(cue.type)) continue;
        const count = countOfBeat.get(cue.beatId);
        if (count === undefined) continue;
        const value = lookup(cue.value);
        if (!value || value.type !== cue.type) {
            flagAll("unknown_value", cue);
            continue;
        }
        const momentary = cue.length !== null && cue.length !== undefined;
        if (value.locked && momentary !== (value.natural === "momentary")) {
            flagAll("kind_not_allowed", cue);
            continue;
        }
        placed.push({
            cue,
            type: cue.type,
            value,
            count,
            length: momentary ? Math.max(1, cue.length!) : null,
        });
    }
    return placed.sort((a, b) => a.count - b.count || a.cue.id - b.cue.id);
}

/**
 * Raises the flags that don't depend on one performer's type (a cue that
 * fits nobody) and notes Position cues skipped for what Equipment gives.
 */
function checkCues(
    pass: Pass,
    flags: FlagCollector<CueFlagKind>,
    notes: FlagCollector<CueNoteKind>,
): void {
    const { input, state } = pass;
    const marchers = new Map(input.marchers.map((m) => [m.id, m]));
    for (const placed of pass.placed) {
        const named = [...new Set(placed.cue.marcherIds)].flatMap((id) => {
            const marcher = marchers.get(id);
            return marcher ? [marcher] : [];
        });
        const performers = named.filter((m) => !isItem(m));
        const fits = (m: CueMarcher) =>
            fitsHolding(
                placed,
                holdsAt(state.defaults.get(m.id)!, placed.count),
            );
        // A cue naming only items reaches nobody.
        if (!performers.some(fits))
            for (const m of performers.length > 0 ? performers : named)
                flags.add("fits_nobody", [placed.cue.id], m.id);
        for (const m of performers) {
            if (fits(m)) continue;
            const defaults = state.defaults.get(m.id)!;
            if (
                equipmentMismatch(
                    placed,
                    defaults.equipment.holds,
                    holdsAt(defaults, placed.count),
                )
            )
                notes.add("equipment_mismatch", [placed.cue.id], m.id);
        }
    }
}
