/**
 * What Visuals mode's cue band draws for the focused who on the current tab
 * (performer-behavior.md section 7.1): the editable lane (cues whose target
 * is the focused who), read-only rows for broader cues above and exceptions
 * inside below, and the result row, what the who does count by count and
 * where it came from. Counts are compile's (`@openmarch/core` cues): count
 * `c` is the c-th beat with a duration, and the number `c` is its click.
 * Pure, so the band and its tests read the same answers.
 */
import {
    CUE_LIBRARY,
    cueLibraryValue,
    defaultCueValue,
    type CompiledCues,
    type CueFlag,
    type CueFlagKind,
    type CueTarget,
    type PerformerCarry,
} from "@openmarch/core";
import type { DatabaseCue, NewCueArgs } from "@/db-functions/cues";
import type { VisualsClipboard } from "@/stores/VisualsStore";
import {
    sectionKey,
    type VisualsChannel,
    type VisualsWho,
    type WhoMarcher,
} from "./visualsWho";
import { cueValueLabel } from "./cueValueText";

/** Where a cue sits on its lane, in counts. */
export interface LaneCue {
    id: number;
    kind: "state" | "phrase";
    /** The cue's count: a state's arrival, a phrase's first count. */
    count: number;
    /** A state's ramp start (its transition's first click); a phrase's first count. */
    from: number;
    /** A state's count; a phrase's count after its last. */
    to: number;
    /**
     * Where the cue's value holds to on its row: for a state, the next cue's
     * start (or the show's end); for a phrase, its end.
     */
    holdTo: number;
    label: string;
}

/** One read-only row: every cue on the channel for one other target. */
export interface LaneRow {
    key: string;
    target: CueTarget;
    cues: LaneCue[];
}

export interface Lanes {
    /** The target the editable lane writes, or null (an empty selection). */
    target: CueTarget | null;
    own: LaneCue[];
    /** Broader targets than the focused who's, broadest first. */
    broader: LaneRow[];
    /** Narrower (or overlapping) targets inside the focused who. */
    exceptions: LaneRow[];
}

export type ResultSource = "own" | "broader" | "exception" | "default";

/** One stretch of the result row. */
export interface ResultSpan {
    from: number;
    to: number;
    /** The value's label, or null where the who is mixed. */
    label: string | null;
    /** Where it came from; null where mixed. */
    source: ResultSource | null;
    mixed: boolean;
    /** A flagged cue sets it for one or more of the who (section 7.2). */
    flagged: boolean;
}

/** Each beat's count (beats with a duration, in order), and back. */
export interface CountIndex {
    countOfBeatId: ReadonlyMap<number, number>;
    beatIdOfCount: readonly number[];
}

export function countIndex(
    beats: readonly { id: number; position: number; duration: number }[],
): CountIndex {
    const counted = beats
        .filter((b) => b.duration > 0)
        .sort((a, b) => a.position - b.position);
    return {
        countOfBeatId: new Map(counted.map((b, i) => [b.id, i])),
        beatIdOfCount: counted.map((b) => b.id),
    };
}

const RANK: Record<CueTarget["kind"], number> = {
    band: 0,
    section: 1,
    tag: 2,
    set: 3,
};

/** The target a cue made for `who` gets; null for an empty selection. */
export function targetOfWho(
    who: VisualsWho,
    selectedIds: readonly number[],
): CueTarget | null {
    switch (who.kind) {
        case "band":
            return { kind: "band" };
        case "section":
            return { kind: "section", section: who.section };
        case "tag":
            return { kind: "tag", tagId: who.tagId };
        case "selection":
            return selectedIds.length > 0
                ? {
                      kind: "set",
                      marcherIds: [...selectedIds].sort((a, b) => a - b),
                  }
                : null;
    }
}

/** A stable key per target; sections match ignoring case and outer spaces. */
export function targetKey(target: CueTarget): string {
    switch (target.kind) {
        case "band":
            return "band";
        case "section":
            return `section:${sectionKey(target.section)}`;
        case "tag":
            return `tag:${target.tagId}`;
        case "set":
            return `set:${[...target.marcherIds].sort((a, b) => a - b).join(",")}`;
    }
}

/** The marchers a cue's target holds. */
export function targetMarcherIds(
    target: CueTarget,
    marchers: readonly WhoMarcher[],
    marcherIdsByTagId: ReadonlyMap<number, readonly number[]>,
): Set<number> {
    switch (target.kind) {
        case "band":
            return new Set(marchers.map((m) => m.id));
        case "section": {
            const key = sectionKey(target.section);
            return new Set(
                marchers
                    .filter((m) => sectionKey(m.section) === key)
                    .map((m) => m.id),
            );
        }
        case "tag":
            return new Set(marcherIdsByTagId.get(target.tagId) ?? []);
        case "set":
            return new Set(target.marcherIds);
    }
}

/** A cue's place on its lane; null for a cue on a beat with no count. */
export function laneCue(cue: DatabaseCue, counts: CountIndex): LaneCue | null {
    const count = counts.countOfBeatId.get(cue.beatId);
    if (count === undefined) return null;
    const value = cueLibraryValue(cue.value);
    const label = cueValueLabel(
        cue.value,
        cue.settings,
        value?.label ?? cue.value,
    );
    if (cue.kind === "phrase") {
        // as compile plays it: held to the value's range, never under 2
        const min = Math.max(2, value?.minLength ?? 2);
        const max = Math.max(min, value?.maxLength ?? Infinity);
        const length = Math.min(max, Math.max(min, cue.length ?? min));
        return {
            id: cue.id,
            kind: "phrase",
            count,
            from: count,
            to: count + length,
            holdTo: count + length,
            label,
        };
    }
    const transition = Math.max(
        1,
        cue.transitionLength ?? value?.defaultTransition ?? 1,
    );
    return {
        id: cue.id,
        kind: "state",
        count,
        from: Math.max(0, count - transition + 1),
        to: count,
        holdTo: count + 1,
        label,
    };
}

/**
 * The lanes for `focusIds` on `channel`: the cues whose target is the
 * focused who's (the editable lane), and the other targets that reach any
 * focused marcher, as broader rows (a less specific target: band before
 * section before tag before set) or exceptions (as specific or more).
 */
export function visualsLanes({
    cues,
    channel,
    target,
    focusIds,
    marchers,
    marcherIdsByTagId,
    counts,
}: {
    cues: readonly DatabaseCue[];
    channel: VisualsChannel;
    target: CueTarget | null;
    focusIds: ReadonlySet<number>;
    marchers: readonly WhoMarcher[];
    marcherIdsByTagId: ReadonlyMap<number, readonly number[]>;
    counts: CountIndex;
}): Lanes {
    const ownKey = target ? targetKey(target) : null;
    const ownRank = target ? RANK[target.kind] : RANK.set;
    const own: LaneCue[] = [];
    const rows = new Map<string, LaneRow>();
    // Whether each target reaches a focused marcher, worked out once per
    // target: a show's cues share few targets, and a band holds everyone
    const reaches = new Map<string, boolean>();
    for (const cue of cues) {
        if (cue.channel !== channel) continue;
        const placed = laneCue(cue, counts);
        if (!placed) continue;
        const key = targetKey(cue.target);
        if (key === ownKey) {
            own.push(placed);
            continue;
        }
        let reach = reaches.get(key);
        if (reach === undefined) {
            reach = false;
            for (const id of targetMarcherIds(
                cue.target,
                marchers,
                marcherIdsByTagId,
            ))
                if (focusIds.has(id)) {
                    reach = true;
                    break;
                }
            reaches.set(key, reach);
        }
        if (!reach) continue;
        const row = rows.get(key) ?? { key, target: cue.target, cues: [] };
        row.cues.push(placed);
        rows.set(key, row);
    }
    const end = counts.beatIdOfCount.length;
    /** Sorted by count, each state holding until the next cue on the row. */
    const holding = (row: LaneCue[]) => {
        row.sort((a, b) => a.count - b.count);
        row.forEach((cue, i) => {
            if (cue.kind === "state")
                cue.holdTo = Math.max(cue.to + 1, row[i + 1]?.from ?? end);
        });
        return row;
    };
    holding(own);
    const sorted = [...rows.values()]
        .map((row) => ({ ...row, cues: holding(row.cues) }))
        .sort(
            (a, b) =>
                RANK[a.target.kind] - RANK[b.target.kind] ||
                a.key.localeCompare(b.key),
        );
    return {
        target,
        own,
        broader: sorted.filter((r) => RANK[r.target.kind] < ownRank),
        exceptions: sorted.filter((r) => RANK[r.target.kind] >= ownRank),
    };
}

/**
 * What the focused marchers do on `channel` at each count's click, merged
 * into spans: one value and where it came from, or mixed where they differ,
 * and flagged where any of them follows a cue in `flagged`.
 */
export function resultRow({
    compiled,
    channel,
    focusIds,
    countCount,
    lanes,
    flagged = new Set(),
}: {
    compiled: CompiledCues;
    channel: VisualsChannel;
    focusIds: ReadonlySet<number>;
    countCount: number;
    lanes: Lanes;
    /** The cues with a flag that reaches a focused marcher (`flagsByCue`). */
    flagged?: ReadonlySet<number>;
}): ResultSpan[] {
    const sourceOf = new Map<number, ResultSource>();
    for (const c of lanes.own) sourceOf.set(c.id, "own");
    for (const row of lanes.broader)
        for (const c of row.cues) sourceOf.set(c.id, "broader");
    for (const row of lanes.exceptions)
        for (const c of row.cues) sourceOf.set(c.id, "exception");

    // Per count: the first marcher's (label, cue) and whether anyone differs
    const label: (string | null)[] = new Array(countCount).fill(null);
    const cueId: (number | null)[] = new Array(countCount).fill(null);
    const seen = new Array<boolean>(countCount).fill(false);
    const mixed = new Array<boolean>(countCount).fill(false);
    const flaggedAt = new Array<boolean>(countCount).fill(false);
    for (const id of focusIds) {
        const segments = compiled.segments(id, channel);
        let s = 0;
        for (let k = 0; k < countCount; k++) {
            while (s < segments.length && segments[s]!.to <= k) s++;
            const seg = segments[s];
            const here =
                seg && seg.from <= k
                    ? {
                          label: cueValueLabel(
                              seg.value,
                              seg.settings,
                              seg.label,
                          ),
                          cue: seg.cueId,
                      }
                    : { label: null, cue: null };
            if (here.cue !== null && flagged.has(here.cue)) flaggedAt[k] = true;
            if (!seen[k]) {
                seen[k] = true;
                label[k] = here.label;
                cueId[k] = here.cue;
            } else if (label[k] !== here.label || cueId[k] !== here.cue)
                mixed[k] = true;
        }
    }

    const spans: ResultSpan[] = [];
    for (let k = 0; k < countCount; k++) {
        if (!seen[k]) continue;
        const span: ResultSpan = {
            from: k,
            to: k + 1,
            label: mixed[k] ? null : (label[k] ?? null),
            source: mixed[k]
                ? null
                : cueId[k] === null
                  ? "default"
                  : (sourceOf.get(cueId[k]!) ?? "exception"),
            mixed: mixed[k]!,
            flagged: flaggedAt[k]!,
        };
        const last = spans[spans.length - 1];
        if (
            last &&
            last.to === k &&
            last.mixed === span.mixed &&
            last.label === span.label &&
            last.source === span.source &&
            last.flagged === span.flagged
        )
            last.to = k + 1;
        else spans.push(span);
    }
    return spans;
}

/**
 * The value a click on the lane adds: the channel's first state that fits
 * everyone focused and isn't what they do by default (so the new cue shows),
 * else the default. A drag adds the channel's first phrase that fits them,
 * or null when the channel has none (Feet and Facing).
 */
export function newCueValue(
    channel: VisualsChannel,
    kind: "state" | "phrase",
    carries: readonly PerformerCarry[],
): string | null {
    const fitsAll = (fits: readonly PerformerCarry[]) =>
        carries.every((c) => fits.includes(c));
    const candidates = CUE_LIBRARY.filter(
        (v) => v.channel === channel && v.kind === kind && fitsAll(v.fits),
    );
    if (kind === "phrase") return candidates[0]?.id ?? null;
    const defaults = new Set(carries.map((c) => defaultCueValue(channel, c)));
    return (
        candidates.find((v) => !defaults.has(v.id))?.id ??
        candidates[0]?.id ??
        null
    );
}

const FEET_STEP = "builtin:feet.step";

/**
 * Settings that make a value differ from the default, for a channel whose only state is the
 * default (Feet: Step): a click there adds mark time on holds, not a cue that changes nothing.
 */
const NOT_DEFAULT_SETTINGS: Readonly<
    Record<string, Readonly<Record<string, string>>>
> = {
    [FEET_STEP]: { onHolds: "markTime" },
};

/** What a press on the lane adds (`laneCreate`). */
export interface LaneCreate {
    kind: "state" | "phrase";
    value: string;
    /** Only where the value alone would be the default (`NOT_DEFAULT_SETTINGS`). */
    settings?: Record<string, string>;
    /** The cue's count: a state's, a phrase's first. */
    count: number;
    /** Counts it covers on the lane: a phrase's length, 1 for a state. */
    length: number;
}

/**
 * What a press from count `start` released on `end` adds (performer-behavior.md section 7.2),
 * and so what the lane draws while it is held: a drag over 2 counts or more is a phrase of that
 * length where the channel has one for everyone focused; otherwise a state on the release's
 * count. A states-only channel (Feet, Facing, the winds' Horn) draws no span, as it saves none.
 * Null when nothing fits.
 */
export function laneCreate(
    channel: VisualsChannel,
    carries: readonly PerformerCarry[],
    start: number,
    end: number,
): LaneCreate | null {
    const length = Math.abs(end - start) + 1;
    const phrase = length >= 2 ? newCueValue(channel, "phrase", carries) : null;
    if (phrase)
        return {
            kind: "phrase",
            value: phrase,
            count: Math.min(start, end),
            length,
        };
    const value = newCueValue(channel, "state", carries);
    if (!value) return null;
    const isDefault = carries.every(
        (c) => defaultCueValue(channel, c) === value,
    );
    const settings = isDefault ? NOT_DEFAULT_SETTINGS[value] : undefined;
    return {
        kind: "state",
        value,
        ...(settings ? { settings: { ...settings } } : {}),
        count: end,
        length: 1,
    };
}

/**
 * Copies `cueIds` (performer-behavior.md section 7.4): their channel and
 * each one's spacing in counts from the first, with values, settings,
 * transitions, ripples and notes; not their who. Null when none are on a
 * counted beat.
 */
export function copyCues(
    cues: readonly DatabaseCue[],
    cueIds: readonly number[],
    counts: CountIndex,
): VisualsClipboard | null {
    const picked = cues
        .filter((c) => cueIds.includes(c.id))
        .map((c) => ({ cue: c, count: counts.countOfBeatId.get(c.beatId) }))
        .filter(
            (p): p is { cue: DatabaseCue; count: number } =>
                p.count !== undefined,
        )
        .sort((a, b) => a.count - b.count);
    if (picked.length === 0) return null;
    const first = picked[0]!.count;
    return {
        channel: picked[0]!.cue.channel as VisualsChannel,
        cues: picked.map(({ cue, count }) => ({
            offset: count - first,
            kind: cue.kind,
            value: cue.value,
            length: cue.length,
            transitionLength: cue.transitionLength,
            settings: cue.settings,
            ripple: cue.ripple,
            notes: cue.notes,
        })),
    };
}

/**
 * The cues a paste at `count` makes for `target`, keeping their spacing;
 * any that would land past the show's last count are left out.
 */
export function pastedCues(
    clipboard: VisualsClipboard,
    count: number,
    target: CueTarget,
    counts: CountIndex,
): NewCueArgs[] {
    return clipboard.cues.flatMap((c) => {
        const beatId = counts.beatIdOfCount[count + c.offset];
        if (beatId === undefined) return [];
        return [
            {
                channel: clipboard.channel,
                kind: c.kind,
                target,
                beatId,
                value: c.value,
                length: c.length,
                transitionLength: c.transitionLength,
                settings: c.settings,
                ripple: c.ripple,
                notes: c.notes,
            },
        ];
    });
}

/** Each cue's flags (clash, overlap, take-over…) that reach a focused marcher. */
export function flagsByCue(
    flags: readonly CueFlag[],
    focusIds: ReadonlySet<number>,
): Map<number, CueFlagKind[]> {
    const byCue = new Map<number, CueFlagKind[]>();
    for (const flag of flags) {
        if (!flag.marcherIds.some((id) => focusIds.has(id))) continue;
        for (const id of flag.cueIds) {
            const kinds = byCue.get(id) ?? [];
            if (!kinds.includes(flag.kind)) kinds.push(flag.kind);
            byCue.set(id, kinds);
        }
    }
    return byCue;
}

/**
 * The count at the playhead: the count of the beat at `beatIndex` among the
 * show's beats in order, or of the last counted beat before it (the
 * zero-length start reads as count 0). Null in a show with no counts.
 */
export function countAtBeatIndex(
    beats: readonly { id: number; position: number }[],
    beatIndex: number,
    counts: CountIndex,
): number | null {
    const sorted = [...beats].sort((a, b) => a.position - b.position);
    for (let i = Math.min(beatIndex, sorted.length - 1); i >= 0; i--) {
        const c = counts.countOfBeatId.get(sorted[i]!.id);
        if (c !== undefined) return c;
    }
    return counts.beatIdOfCount.length > 0 ? 0 : null;
}
