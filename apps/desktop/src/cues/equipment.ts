/**
 * Equipment cues (ADR 0015 D-3, D-6; fork #992): what a performer holds, set for the selection at
 * the playhead from a fixed catalog of real items. The rules here are pure, so the commands, the
 * field menu, the lane and their tests read the same answers.
 */
import {
    cueValueAt,
    EQUIPMENT_NONE,
    EQUIPMENT_USUAL,
    type CompiledCues,
} from "@openmarch/core";
import type { DatabaseCue, NewCueArgs } from "@/db-functions/cues";
import { itemValueId, tagOfValue } from "./equipmentItems";

/**
 * What an Equipment command sets: a catalog item's key ("trumpet", "rifle"), "usual" for the
 * performer's own instrument (their section's default) or "none".
 */
export type EquipmentChoice = string;

/** The value an Equipment cue for `choice` stores. */
export const equipmentValueOfChoice = (choice: EquipmentChoice): string =>
    choice === "usual"
        ? EQUIPMENT_USUAL
        : choice === "none"
          ? EQUIPMENT_NONE
          : itemValueId(choice);

/**
 * The cue that sets `choice` for `marcherIds` on `beatId`, lasting, as Equipment naturally is
 * (ADR 0015 D-2). Any performer can hold any item.
 */
export function planEquipmentCues({
    choice,
    marcherIds,
    beatId,
    label,
}: {
    choice: EquipmentChoice;
    marcherIds: readonly number[];
    beatId: number;
    label: string | null;
}): NewCueArgs[] {
    if (marcherIds.length === 0) return [];
    return [
        {
            type: "equipment",
            beatId,
            value: equipmentValueOfChoice(choice),
            marcherIds: [...marcherIds],
            label,
        },
    ];
}

/** The Equipment value a performer holds at `count` (their section's default before any cue). */
export const heldValueAt = (
    compiled: CompiledCues,
    marcherId: number,
    count: number,
): string | null => cueValueAt(compiled, marcherId, "equipment", count);

/**
 * Each performer's field tag at `count` (fork #992 decision 1), for those holding something other
 * than their section's usual: "R" for a rifle, "Tp" for a trumpet.
 */
export function equipmentTagsAt(
    compiled: CompiledCues,
    usualValue: ReadonlyMap<number, string | null>,
    count: number,
): Map<number, string> {
    const tags = new Map<number, string>();
    for (const [id, usual] of usualValue) {
        const held = heldValueAt(compiled, id, count);
        if (held !== usual) tags.set(id, tagOfValue(held));
    }
    return tags;
}

/** A stable key for a tag map, so a hook only hands out a new map when a tag changes. */
export const tagsKey = (tags: ReadonlyMap<number, string>): string =>
    [...tags].map(([id, tag]) => `${id}${tag}`).join(",");

/** The Equipment cues on `beatId` (newest last). */
export const equipmentCuesOn = (
    cues: readonly DatabaseCue[],
    beatId: number,
): DatabaseCue[] =>
    cues.filter((c) => c.type === "equipment" && c.beatId === beatId);

/**
 * The performers a cue would have after adding or removing the selection, or null when nothing
 * changes. Removing everyone leaves an empty list: the caller deletes the cue then.
 */
export function editedPerformers(
    cue: Pick<DatabaseCue, "marcherIds">,
    selected: readonly number[],
    edit: "add" | "remove",
): number[] | null {
    const current = new Set(cue.marcherIds);
    const next = new Set(current);
    for (const id of selected)
        if (edit === "add") next.add(id);
        else next.delete(id);
    if (next.size === current.size && [...next].every((id) => current.has(id)))
        return null;
    return [...next].sort((a, b) => a - b);
}

/** How many recent Equipment choices the field menu keeps. */
export const RECENT_EQUIPMENT_LIMIT = 4;

/** The recent catalog items after choosing `key`: it goes first, at most four, no repeats. */
export function withRecent(
    recent: readonly string[],
    key: EquipmentChoice,
): string[] {
    if (key === "usual" || key === "none") return [...recent];
    return [key, ...recent.filter((k) => k !== key)].slice(
        0,
        RECENT_EQUIPMENT_LIMIT,
    );
}

/** What setting an Equipment value does: join a matching cue, or make a new one. */
export type EquipmentSet =
    | {
          readonly kind: "join";
          readonly cue: DatabaseCue;
          readonly marcherIds: number[];
      }
    | { readonly kind: "create"; readonly newCues: NewCueArgs[] }
    | { readonly kind: "none" };

/**
 * Setting `choice` for `marcherIds` on `beatId` (owner, fork #992): when a cue of the same type,
 * value, beat and kind is already there (both lasting, or both momentary with the same length),
 * the performers join it; performers already in it stay. Otherwise a new lasting cue is made.
 * `label` names the performers either way: the new cue's, or the joined cue's after joining.
 */
export function planEquipmentSet({
    cues,
    choice,
    marcherIds,
    beatId,
    labelFor,
    length = null,
}: {
    cues: readonly DatabaseCue[];
    choice: EquipmentChoice;
    marcherIds: readonly number[];
    beatId: number;
    /** The label for a cue with these performers */
    labelFor: (marcherIds: readonly number[]) => string | null;
    /** Null for a lasting cue (what the Equipment commands make) */
    length?: number | null;
}): EquipmentSet {
    if (marcherIds.length === 0) return { kind: "none" };
    const value = equipmentValueOfChoice(choice);
    const match = cues.find(
        (c) =>
            c.type === "equipment" &&
            c.value === value &&
            c.beatId === beatId &&
            c.length === length,
    );
    if (match) {
        const joined = editedPerformers(match, marcherIds, "add");
        return joined
            ? { kind: "join", cue: match, marcherIds: joined }
            : { kind: "none" };
    }
    return {
        kind: "create",
        newCues: planEquipmentCues({
            choice,
            marcherIds,
            beatId,
            label: labelFor(marcherIds),
        }).map((c) => (length === null ? c : { ...c, length })),
    };
}
