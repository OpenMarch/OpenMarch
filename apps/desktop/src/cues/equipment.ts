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
import type {
    DatabaseCue,
    ModifiedCueArgs,
    NewCueArgs,
} from "@/db-functions/cues";
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

/**
 * What setting an Equipment value writes, as one undo step: performers taken out of the other cues
 * on that beat (a cue left with nobody is deleted), then the matching cue joined or a new one made.
 * Every list is empty when nothing changes.
 */
export interface EquipmentSet {
    readonly modifiedCues: ModifiedCueArgs[];
    readonly deletedCueIds: number[];
    readonly newCues: NewCueArgs[];
}

export const equipmentSetIsEmpty = (plan: EquipmentSet): boolean =>
    plan.modifiedCues.length === 0 &&
    plan.deletedCueIds.length === 0 &&
    plan.newCues.length === 0;

/**
 * Setting `choice` for `marcherIds` on `beatId` replaces what they hold there (fork #992): a
 * performer is in at most one Equipment cue of a kind (lasting, or momentary of one length) on a
 * beat. So the selection leaves every other cue of that kind on the beat, and a cue left with no
 * performers is deleted. Then they join the cue with that value (the newest, which is the one that
 * wins), or a new cue is made; performers already in it stay. `labelFor` names a new cue's
 * performers; `relabelFor` renames a cue whose performers changed (defaults to `labelFor`).
 */
export function planEquipmentSet({
    cues,
    choice,
    marcherIds,
    beatId,
    labelFor,
    relabelFor = labelFor,
    length = null,
}: {
    cues: readonly DatabaseCue[];
    choice: EquipmentChoice;
    marcherIds: readonly number[];
    beatId: number;
    /** The label for a new cue with these performers */
    labelFor: (marcherIds: readonly number[]) => string | null;
    /** The label for a cue now holding these performers */
    relabelFor?: (marcherIds: readonly number[]) => string | null;
    /** Null for a lasting cue (what the Equipment commands make) */
    length?: number | null;
}): EquipmentSet {
    const plan: EquipmentSet = {
        modifiedCues: [],
        deletedCueIds: [],
        newCues: [],
    };
    if (marcherIds.length === 0) return plan;
    const value = equipmentValueOfChoice(choice);
    const sameKind = cues.filter(
        (c) =>
            c.type === "equipment" &&
            c.beatId === beatId &&
            c.length === length,
    );
    // The newest wins when two cues on a count cover one performer (compile), so join that one
    const target = sameKind
        .filter((c) => c.value === value)
        .reduce<DatabaseCue | null>(
            (newest, c) => (newest === null || c.id > newest.id ? c : newest),
            null,
        );

    for (const cue of sameKind) {
        if (cue === target) continue;
        const rest = editedPerformers(cue, marcherIds, "remove");
        if (rest === null) continue;
        if (rest.length === 0) plan.deletedCueIds.push(cue.id);
        else
            plan.modifiedCues.push({
                id: cue.id,
                marcherIds: rest,
                label: relabelFor(rest),
            });
    }

    if (target) {
        const joined = editedPerformers(target, marcherIds, "add");
        if (joined)
            plan.modifiedCues.push({
                id: target.id,
                marcherIds: joined,
                label: relabelFor(joined),
            });
    } else {
        plan.newCues.push(
            ...planEquipmentCues({
                choice,
                marcherIds,
                beatId,
                label: labelFor(marcherIds),
            }).map((c) => (length === null ? c : { ...c, length })),
        );
    }
    return plan;
}
