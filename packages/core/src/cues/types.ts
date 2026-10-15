/**
 * Show-authored performer behavior: cues on channels, compiled per marcher.
 * The spec is docs/3d/performer-behavior.md; the storage is ADR 0004.
 *
 * Counts: count `c` is the c-th beat in `CompileInput.beats` (from 0), and
 * the number `c` means that count's click, the start of its beat row. A
 * fractional count is a time between clicks, proportional within the beat.
 */

/**
 * One part of a performer's behavior or look that cues set independently.
 * Carry (what is held), Silk (a carried flag's Artwork) and Uniform take
 * states only, as hard cuts (ADR 0004 amendment of 2026-10-11).
 */
export type CueChannel =
    | "feet"
    | "horn_equipment"
    | "facing"
    | "body"
    | "carry"
    | "silk"
    | "uniform";

export const CUE_CHANNELS: readonly CueChannel[] = [
    "feet",
    "horn_equipment",
    "facing",
    "body",
    "carry",
    "silk",
    "uniform",
];

/** What a performer carries, which decides the cues that fit them. */
export type PerformerCarry =
    | "winds"
    | "battery"
    | "flag"
    | "rifle"
    | "sabre"
    | "none";

/** Who a cue applies to, broadest first. */
export type CueTarget =
    | { kind: "band" }
    | { kind: "section"; section: string }
    | { kind: "tag"; tagId: number }
    | { kind: "set"; marcherIds: readonly number[] };

export type RippleOrder = "drill" | "left_right" | "right_left" | "down_form";

export interface CueRipple {
    /** Counts the starts are spread over, inclusive. */
    span: number;
    order: RippleOrder;
}

/** A stored cue, as the compile step reads it. */
export interface CueInput {
    id: number;
    channel: CueChannel;
    kind: "state" | "phrase";
    target: CueTarget;
    /** The beat the cue sits on. */
    beatId: number;
    /**
     * A built-in id (`builtin:...`), a show phrase (`show:<id>`), a Library
     * item at an exact Version (`library:<uuid>@<version hash>`, on Carry,
     * Silk and Uniform) or `none` (Carry).
     */
    value: string;
    settings?: Readonly<Record<string, unknown>>;
    /** Phrases: the length in counts, inclusive, at least 2. */
    length?: number | null;
    /**
     * States: the transition length in counts; null is the library default.
     * Ignored on Carry, Silk and Uniform, which cut at the cue's count.
     */
    transitionLength?: number | null;
    ripple?: CueRipple | null;
}

/** A `marchers` row's type: a performer, or an item (ADR 0002 D-10). */
export type CueMarcherType = "marcher" | "prop" | "equipment";

export interface CueMarcher {
    id: number;
    section: string;
    tagIds: readonly number[];
    drillOrder: number;
    /**
     * What the marcher usually carries. Carry's default is the section's
     * usual equipment (`CompileInput.sections`, then `equipmentFallback`);
     * this is the last fallback, and what that equipment counts as when it
     * doesn't say.
     */
    carries: PerformerCarry;
    /**
     * Whether the marcher wears the Guard default uniform. Omitted, a
     * marcher carrying a flag, rifle or sabre counts as guard.
     */
    isGuard?: boolean;
    /** Omitted is a performer. Band and section targets never reach items. */
    type?: CueMarcherType;
}

/** A piece of equipment a Carry value or default names. */
export interface CueEquipment {
    /** `library:<uuid>@<version hash>`, or a built-in id the app names. */
    id: string;
    name: string;
    /** The timeline's short label; the name when omitted. */
    label?: string;
    /** What holding it counts as, which decides the Horn/Equipment cues that fit. */
    holds: PerformerCarry;
}

/** A Library item a Carry, Silk or Uniform cue names, with what compile needs of it. */
export interface CueLibraryItem {
    /** `library:<uuid>@<version hash>`. */
    id: string;
    channel: "carry" | "silk" | "uniform";
    name: string;
    /** The timeline's short label; the name when omitted. */
    label?: string;
    /** Carry items: what holding it counts as. Unknown, the section's usual equipment counts. */
    holds?: PerformerCarry;
}

/** What compile needs of a section for the Carry and Silk defaults. */
export interface CueSection {
    /** The section's name, matched to `CueMarcher.section` ignoring case and outer spaces. */
    name: string;
    /**
     * The section's usual equipment, Carry's default; null carries nothing.
     * Omitted, `CompileInput.equipmentFallback` decides.
     */
    equipment?: CueEquipment | null;
    /** The section's 2D color, which the default plain silk shows. */
    color?: string | null;
}

/** A show-stored phrase asset's metadata (ADR 0004 D-3). */
export interface ShowPhraseAsset {
    id: number;
    name: string;
    label: string;
    /** The channel it plays on and any it takes over. */
    channels: readonly CueChannel[];
}

/** Show-wide defaults the cues fall back to (ADR 0004 D-4). */
export interface CueShowDefaults {
    stepOffFoot?: "left" | "right";
    /** The band's default uniform; `builtin:uniform.band` when omitted. */
    bandUniform?: string;
    /** The guard's default uniform; `builtin:uniform.guard` when omitted. */
    guardUniform?: string;
}

export interface CompileInput {
    /** The show's timed beats in order. */
    beats: readonly { id: number; duration: number }[];
    marchers: readonly CueMarcher[];
    cues: readonly CueInput[];
    phraseAssets?: readonly ShowPhraseAsset[];
    showDefaults?: CueShowDefaults;
    /** Whether the marcher's dot travels during count `count`. */
    travels?: (marcherId: number, count: number) => boolean;
    /** The marcher's field position at a count's click (x toward side 2, y toward the front). */
    positionAt?: (marcherId: number, count: number) => { x: number; y: number };
    /** Each section's usual equipment and 2D color, for the Carry and Silk defaults. */
    sections?: readonly CueSection[];
    /**
     * Carry's fallback when a section doesn't give its usual equipment:
     * equipment by section name, matched ignoring case and outer spaces (the
     * app's `carryForSection` data).
     */
    equipmentFallback?: Readonly<Record<string, CueEquipment>>;
    /** The Library items the show's Carry, Silk and Uniform cues name. */
    libraryItems?: readonly CueLibraryItem[];
}

export type SegmentKind = "default" | "state" | "transition" | "phrase";

/** What one marcher does on one channel over `[from, to)` counts. */
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
    /** Set when another channel's cue owns this channel here. */
    takenOverFrom?: CueChannel;
}

export type CueFlagKind =
    | "clash"
    | "phrase_overlap"
    | "takeover_while_moving"
    | "fits_nobody"
    | "kind_not_allowed"
    | "transition_cut";

export interface CueFlag {
    kind: CueFlagKind;
    cueIds: readonly number[];
    marcherIds: readonly number[];
}

/** Where a channel's default comes from. */
export type CueTraceDefaultSource =
    /** The library's fixed default (step, facing front, body neutral). */
    | "library"
    /** Horn/Equipment: horns up, or the set position of what Carry gives. */
    | "carry"
    /** Carry: the section's usual equipment. */
    | "section_equipment"
    /** Carry: the equipment fallback for the section's name. */
    | "equipment_fallback"
    /** Carry: what the marcher usually carries, with nothing else given. */
    | "marcher_carries"
    /** Silk: a plain silk in the section's 2D color. */
    | "section_color"
    /** Uniform: the band default. */
    | "band_uniform"
    /** Uniform: the guard default, for a marcher in the guard. */
    | "guard_uniform";

/** Why a channel shows its default. */
export interface CueTraceDefault {
    source: CueTraceDefaultSource;
    value: string | null;
    /** The section it comes from (Carry, Silk). */
    section?: string;
    /** Horn/Equipment: what Carry gives at the count. */
    carries?: PerformerCarry;
    /** Silk: the section's 2D color. */
    color?: string | null;
}

export interface CueTrace {
    /** The cue in effect, or null for the default. */
    winner: number | null;
    /** Set when there's no winner: where the default comes from. */
    default?: CueTraceDefault;
    /** Set when the winner is another channel's cue taking this one over. */
    takenOverFrom?: CueChannel;
    /** Applicable cues it beat, latest and most specific first. */
    beaten: readonly number[];
}

export type CueNoteKind =
    /** A Horn/Equipment cue that doesn't match what Carry gives, ignored for those performers. */
    "carry_mismatch";

/** Something compile did quietly that the editor may show, not a problem to fix. */
export interface CueNote {
    kind: CueNoteKind;
    cueIds: readonly number[];
    marcherIds: readonly number[];
}

export interface CompiledCues {
    segments(marcherId: number, channel: CueChannel): readonly CueSegment[];
    flags: readonly CueFlag[];
    notes: readonly CueNote[];
}
