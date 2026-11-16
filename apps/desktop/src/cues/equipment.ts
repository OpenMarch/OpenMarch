/**
 * Equipment cues (ADR 0015 D-3, D-6; fork #992): what a performer holds, set for the selection at
 * the playhead. The rules here are pure, so the commands, the field menu, the lane and their tests
 * read the same answers.
 */
import {
    cueValueLookup,
    heldAt,
    type CompiledCues,
    type PerformerCarry,
} from "@openmarch/core";
import type { DatabaseCue, NewCueArgs } from "@/db-functions/cues";

/**
 * What the Equipment commands set. "instrument" is each performer's own section instrument (a horn
 * or a drum), so one command can hand a mixed selection back their instruments.
 */
export type EquipmentChoice =
    | "instrument"
    | "flag"
    | "rifle"
    | "sabre"
    | "none";

export const EQUIPMENT_CHOICES: readonly EquipmentChoice[] = [
    "instrument",
    "flag",
    "rifle",
    "sabre",
    "none",
];

/** The Library value of an Equipment cue holding `carry` (`builtin:equipment.<carry>`). */
export const equipmentValueOf = (carry: PerformerCarry): string =>
    `builtin:equipment.${carry}`;

/** What `value` counts as holding, or undefined for a value this build doesn't know. */
export function carryOfEquipmentValue(
    value: string,
): PerformerCarry | undefined {
    return lookup(value)?.holds;
}
const lookup = cueValueLookup();

/** Whether a performer whose section usually holds `usual` plays an instrument. */
export const hasInstrument = (usual: PerformerCarry): boolean =>
    usual === "winds" || usual === "battery";

/** What `choice` hands a performer whose section usually holds `usual`; null when it can't. */
export function carryForChoice(
    choice: EquipmentChoice,
    usual: PerformerCarry,
): PerformerCarry | null {
    if (choice !== "instrument") return choice;
    return hasInstrument(usual) ? usual : null;
}

/**
 * The cues that set `choice` for `marcherIds` on `beatId`: one per value, since "instrument" is a
 * horn for some and a drum for others. Performers `choice` can't reach (an instrument for the
 * guard) are left out; with nobody left, there are none. Lasting, as Equipment naturally is
 * (ADR 0015 D-2).
 */
export function planEquipmentCues({
    choice,
    marcherIds,
    beatId,
    usualOf,
    label,
}: {
    choice: EquipmentChoice;
    marcherIds: readonly number[];
    beatId: number;
    usualOf: (marcherId: number) => PerformerCarry;
    label: string | null;
}): NewCueArgs[] {
    const byCarry = new Map<PerformerCarry, number[]>();
    for (const id of marcherIds) {
        const carry = carryForChoice(choice, usualOf(id));
        if (carry === null) continue;
        const list = byCarry.get(carry);
        if (list) list.push(id);
        else byCarry.set(carry, [id]);
    }
    return [...byCarry].map(([carry, ids]) => ({
        type: "equipment",
        beatId,
        value: equipmentValueOf(carry),
        marcherIds: ids,
        label,
    }));
}

/**
 * The short tag the 2D field draws by a drill number for what a performer holds: only when it
 * isn't their section's usual (fork #992 decision 1), so winds and a guard on its own equipment
 * show none.
 */
export const EQUIPMENT_TAG: Readonly<Record<PerformerCarry, string>> = {
    flag: "F",
    rifle: "R",
    sabre: "S",
    winds: "H",
    battery: "D",
    none: "N",
};

/** Each performer's tag at `count`, for those holding something other than their usual. */
export function equipmentTagsAt(
    compiled: CompiledCues,
    usual: ReadonlyMap<number, PerformerCarry>,
    count: number,
): Map<number, string> {
    const tags = new Map<number, string>();
    for (const [id, carry] of usual) {
        const held = heldAt(compiled, id, count);
        if (held !== carry) tags.set(id, EQUIPMENT_TAG[held]);
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
