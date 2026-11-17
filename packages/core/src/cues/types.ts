/**
 * Performer cues: one parameter of a performer set at a count, compiled per
 * performer (ADR 0015; the write rules are ADR 0004's).
 *
 * Counts: count `c` is the c-th beat in `CompileInput.beats` (from 0), and
 * the number `c` means that count's click, the start of its beat row. A
 * fractional count is a time between clicks, proportional within the beat.
 */

/**
 * A cue type controls exactly one parameter of a performer (ADR 0015 D-3):
 * what they hold (Equipment), how they hold it (Position), a held flag's
 * design (Silk), their uniform look (Look), where they face (Facing) and
 * their body's posture (Posture).
 */
export type CueType =
    | "equipment"
    | "position"
    | "silk"
    | "look"
    | "facing"
    | "posture";

export const CUE_TYPES: readonly CueType[] = [
    "equipment",
    "position",
    "silk",
    "look",
    "facing",
    "posture",
];

/** Whether this build knows a stored cue's type. Cues of other types are kept and ignored. */
export const isCueType = (type: string): type is CueType =>
    (CUE_TYPES as readonly string[]).includes(type);

/** What a performer holds, which decides the Position and Silk cues that fit them. */
export type PerformerCarry =
    | "winds"
    | "battery"
    | "flag"
    | "rifle"
    | "sabre"
    | "none";

/** A stored cue, as the compile step reads it. */
export interface CueInput {
    id: number;
    /**
     * A {@link CueType}. A cue of a type this build doesn't know is ignored
     * (ADR 0015 D-9), so a newer build's cues do no harm here.
     */
    type: string;
    /** The beat the cue sits on: its moment is that count's click. */
    beatId: number;
    /** A built-in id (`builtin:...`) or a value the show adds (`CompileInput.values`). */
    value: string;
    settings?: Readonly<Record<string, unknown>>;
    /**
     * Null or omitted, the cue is **lasting**: it sets the parameter until
     * each performer's next lasting cue of the type. A number, it is
     * **momentary**: it applies for that many counts (at least 1), then the
     * lasting value shows again.
     */
    length?: number | null;
    /**
     * How many counts the change takes, landing on the cue's count (1 is a
     * snap); null is the value's default. Ignored by a value that cuts.
     */
    transition?: number | null;
    /**
     * The performers the cue applies to: the ones selected when it was made
     * (ADR 0015 D-4). The list is fixed; it follows no section or tag.
     */
    marcherIds: readonly number[];
}

/** A `marchers` row's type: a performer, or an item (ADR 0010 D-10). */
export type CueMarcherType = "marcher" | "prop" | "equipment";

export interface CueMarcher {
    id: number;
    section: string;
    /**
     * What the marcher usually holds. Equipment's default is the section's
     * usual equipment (`CompileInput.sections`, then `equipmentFallback`);
     * this is the last fallback, and what that equipment counts as when it
     * doesn't say.
     */
    carries: PerformerCarry;
    /**
     * Whether the marcher wears the guard's default look. Omitted, a marcher
     * carrying a flag, rifle or sabre counts as guard.
     */
    isGuard?: boolean;
    /** Omitted is a performer. A cue never reaches an item, even one it names. */
    type?: CueMarcherType;
}

/** A piece of equipment an Equipment value or default names. */
export interface CueEquipment {
    /** A built-in id, or one the app names. */
    id: string;
    name: string;
    /** The timeline's short label; the name when omitted. */
    label?: string;
    /** What holding it counts as, which decides the Position cues that fit. */
    holds: PerformerCarry;
}

/** What compile needs of a section for the Equipment and Silk defaults. */
export interface CueSection {
    /** The section's name, matched to `CueMarcher.section` ignoring case and outer spaces. */
    name: string;
    /**
     * The section's usual equipment, Equipment's default; null holds nothing.
     * Omitted, `CompileInput.equipmentFallback` decides.
     */
    equipment?: CueEquipment | null;
    /** The section's 2D color, which the default plain silk shows. */
    color?: string | null;
}

/** What a performer's feet do on a hold (a count where their dot doesn't travel). */
export type HoldTechnique = "stand" | "markTime" | "highMarkTime";

/** Show-wide defaults a parameter has before its first cue (ADR 0015 D-2). */
export interface CueShowDefaults {
    /**
     * The hold style, which is not a cue (ADR 0015 D-1), where the hold itself
     * carries none (`CompileInput.holdStyles`): what a holding performer does
     * on a count where any performer travels. `stand` when omitted (holds
     * stand still unless asked, ADR 0015 D-5). On counts where the whole band
     * holds, they stand.
     */
    holdWhileBandMoves?: HoldTechnique;
    /** The band's default look; `builtin:look.band` when omitted. */
    bandLook?: string;
    /** The guard's default look; `builtin:look.guard` when omitted. */
    guardLook?: string;
}

/**
 * One performer's hold style over the counts `[from, to)` (ADR 0015 D-5): what
 * its feet do while its dot holds there. It comes from the hold itself, so it
 * wins over the show default whether or not the band moves.
 */
export interface CueHoldStyle {
    marcherId: number;
    /** The first count it covers. */
    from: number;
    /** The count after the last one it covers. */
    to: number;
    style: HoldTechnique;
}

export interface CompileInput {
    /** The show's timed beats in order. */
    beats: readonly { id: number; duration: number }[];
    marchers: readonly CueMarcher[];
    cues: readonly CueInput[];
    showDefaults?: CueShowDefaults;
    /**
     * Whether the marcher's dot travels during count `count`. A value that
     * shows only on holds (a kneel) reads it, and so does the hold style.
     */
    travels?: (marcherId: number, count: number) => boolean;
    /**
     * Whether any performer's dot travels during count `count`, for the hold
     * style (`CueShowDefaults.holdWhileBandMoves`). Omitted, it's derived
     * from `travels` over the performers; with neither, every count is a band
     * hold.
     */
    bandTravels?: (count: number) => boolean;
    /**
     * The styles the performers' holds carry (ADR 0015 D-5). Each wins over
     * the show setting for the counts it covers; where two of one performer's
     * overlap, the later in the list wins. They are not cues, so a recompile
     * that changes them needs no cue type named: the hold style is worked out
     * afresh on every compile.
     */
    holdStyles?: readonly CueHoldStyle[];
    /** Each section's usual equipment and 2D color, for the Equipment and Silk defaults. */
    sections?: readonly CueSection[];
    /**
     * Equipment's fallback when a section doesn't give its usual equipment:
     * equipment by section name, matched ignoring case and outer spaces (the
     * app's `carryForSection` data).
     */
    equipmentFallback?: Readonly<Record<string, CueEquipment>>;
    /**
     * Values the show adds to the built-in library, such as a look or a
     * piece of equipment. A built-in wins over one with the same id.
     */
    values?: readonly CueValue[];
}

/** One setting a value takes, with its default. */
export type CueSettingField =
    | {
          key: string;
          kind: "choice";
          options: readonly string[];
          default: string;
      }
    | { key: string; kind: "number"; default: number };

/** A value a cue of one type can set, with the rules for where it applies. */
export interface CueValue {
    id: string;
    type: CueType;
    name: string;
    /** The timeline's short label. */
    label: string;
    /** What a performer must hold for the value to fit; a cue skips everyone else. */
    fits: readonly PerformerCarry[];
    /**
     * Whether a new cue of this value starts lasting or momentary (ADR 0015
     * D-2); the cue's own `length` decides what it is. `lasting` when omitted.
     */
    natural?: "lasting" | "momentary";
    /** Set when the value works only as its `natural` kind: a toss is momentary only. */
    locked?: boolean;
    /** The length in counts a new momentary cue of the value starts with. 1 when omitted. */
    defaultLength?: number;
    /**
     * The default transition length in counts (1 is a snap). Omitted, the
     * value cuts on its count and a cue's own transition is ignored.
     */
    defaultTransition?: number;
    /** Shows only while the dot holds (a kneel); the default shows while it travels. */
    standingOnly?: boolean;
    /** The settings it takes; a cue's missing settings get these defaults. */
    settings?: readonly CueSettingField[];
    /** Equipment values: what holding it counts as. */
    holds?: PerformerCarry;
}

export type SegmentKind = "default" | "lasting" | "transition" | "momentary";

/** What one performer's parameter is over `[from, to)` counts. */
export interface CueSegment {
    from: number;
    to: number;
    kind: SegmentKind;
    value: string | null;
    label: string;
    settings: Readonly<Record<string, unknown>>;
    /** The cue that set it, or null for the default. */
    cueId: number | null;
    /** A zero-length transition keyed in fixed time, ending on `to`. */
    snap?: boolean;
    /**
     * Set on a default segment that stands in for a cue whose value doesn't
     * show here: a kneel while the dot travels.
     */
    hiddenCueId?: number;
}

export type CueFlagKind =
    /** Two cues of one type and kind on one count for the same performer; the newer wins. */
    | "clash"
    /** A momentary cue starting inside an earlier one, which it ends. */
    | "momentary_overlap"
    /** A value that shows only on holds, on a count where the dot travels. */
    | "standing_only_while_moving"
    /** The cue's value fits none of its performers on its count. */
    | "fits_nobody"
    /** A lasting cue on a momentary-only value, or the reverse; the cue is ignored. */
    | "kind_not_allowed"
    /** A value this build doesn't know for the cue's type; the cue is ignored. */
    | "unknown_value"
    /** A transition that would start before the cue before it; it starts there instead. */
    | "transition_cut";

export interface CueFlag {
    kind: CueFlagKind;
    cueIds: readonly number[];
    marcherIds: readonly number[];
}

/** Where a parameter's default comes from. */
export type CueTraceDefaultSource =
    /** The library's fixed default (facing front, posture neutral). */
    | "library"
    /** Position: horns up, or the set position of what Equipment gives. */
    | "equipment"
    /** Equipment: the section's usual equipment. */
    | "section_equipment"
    /** Equipment: the equipment fallback for the section's name. */
    | "equipment_fallback"
    /** Equipment: what the marcher usually carries, with nothing else given. */
    | "marcher_carries"
    /** Silk: a plain silk in the section's 2D color. */
    | "section_color"
    /** Look: the band default. */
    | "band_look"
    /** Look: the guard default, for a marcher in the guard. */
    | "guard_look";

/** Why a parameter shows its default. */
export interface CueTraceDefault {
    source: CueTraceDefaultSource;
    value: string | null;
    /** The section it comes from (Equipment, Silk). */
    section?: string;
    /** Position: what Equipment gives at the count. */
    holds?: PerformerCarry;
    /** Silk: the section's 2D color. */
    color?: string | null;
}

export interface CueTrace {
    /** The cue in effect, or null for the default. */
    winner: number | null;
    /** Set when there's no winner: where the default comes from. */
    default?: CueTraceDefault;
    /** Set when a cue is in effect but its value doesn't show (a kneel while the dot travels). */
    hidden?: number;
    /** The performer's other cues of the type at or before the count, latest first. */
    beaten: readonly number[];
}

export type CueNoteKind =
    /** A Position cue that doesn't match what Equipment gives, ignored for those performers. */
    "equipment_mismatch";

/** Something compile did quietly that the editor may show, not a problem to fix. */
export interface CueNote {
    kind: CueNoteKind;
    cueIds: readonly number[];
    marcherIds: readonly number[];
}

/** One performer's hold style over `[from, to)` counts. */
export interface HoldStyleSpan {
    from: number;
    to: number;
    style: HoldTechnique;
}

export interface CompiledCues {
    segments(marcherId: number, type: CueType): readonly CueSegment[];
    /**
     * The performer's hold style over the show: what their feet do on counts
     * where their dot doesn't travel. Not a cue (ADR 0015 D-1); it comes from
     * the styles their holds carry and, elsewhere, the show setting (D-5).
     */
    holdStyle(marcherId: number): readonly HoldStyleSpan[];
    flags: readonly CueFlag[];
    notes: readonly CueNote[];
}
