/**
 * What each performer holds over the show in the 3D View, from their
 * compiled Equipment (ADR 0015 D-3, D-6): which piece is in their hands from
 * which count, and the Horn/Equipment channel's events tagged with the piece
 * each one plays on.
 *
 * - Equipment cuts on its count: the piece swaps on that count's click, with
 *   no animation of the swap.
 * - When Equipment changes, Position returns to the new piece's default
 *   hold until its next event (D-3).
 * - A performer whose Equipment never leaves their section's usual piece
 *   gets nothing here, so a show without Equipment cues draws as before.
 *
 * Pure: no three.js.
 */
import type { CueSegment, PerformerCarry } from "@openmarch/core";
import { carryForModel, type Carry } from "../instruments/catalog";
import { modelOfValue } from "@/cues/equipmentItems";
import type { HoldFamily, HoldState } from "../instruments/holds";
import { performerCarryOf, type HornEvent } from "./hornChannel";

/**
 * The piece a performer draws for the Equipment value `value` (fork #992's catalog), given
 * `base`, the piece their look carries (their section's): the item's own model, kept as `base`
 * when it is that model (so a show setting such as the sousaphone or a silk shape stays). Null
 * for nothing. A value without a model (a section without a catalog item, or one this build
 * doesn't know) falls back on what it counts as holding: `base` when that's the same kind.
 */
export function carryForValue(
    value: string | null,
    holds: PerformerCarry,
    base: Carry | null,
): Carry | null {
    if (holds === "none") return null;
    const model = modelOfValue(value);
    if (model) {
        if (base && base.model === model) return base;
        // The section's own kind of flag or tuba stays as the show set it
        if (base && sameKind(base.model, model)) return base;
        return carryForModel(model);
    }
    if (base && performerCarryOf(base.family) === holds) return base;
    return null;
}

/** The 6 ft flag and the tuba are the section default, which a show setting may swap. */
const sameKind = (a: string, b: string) =>
    (a === "contra" || a === "sousaphone") && b === "contra";

/** From count `from` on, the performer holds `carries[held]`. */
export interface HeldSpan {
    from: number;
    held: number;
}

/** Every piece one performer holds over the show, and when. */
export interface SlotEquipment {
    /** Each piece once (null: empty hands); the first is the look's own. */
    carries: (Carry | null)[];
    /** From count 0, a span per change of piece, in order. */
    spans: HeldSpan[];
}

/**
 * One performer's pieces over the show, from their compiled Equipment
 * `segments` and `holdsAt`, what Equipment gives them on a count's click
 * (`heldAt`). `base` is the piece their look carries. Null when they hold
 * `base` the whole show.
 */
export function slotEquipment(
    segments: readonly CueSegment[],
    holdsAt: (count: number) => PerformerCarry,
    base: Carry | null,
): SlotEquipment | null {
    const carries: (Carry | null)[] = [base];
    const keys = [JSON.stringify(base)];
    const spans: HeldSpan[] = [];
    for (const seg of segments) {
        if (!(seg.to > seg.from)) continue;
        const carry = carryForValue(seg.value, holdsAt(seg.from), base);
        const key = JSON.stringify(carry);
        let held = keys.indexOf(key);
        if (held < 0) {
            held = carries.length;
            carries.push(carry);
            keys.push(key);
        }
        if (spans.length > 0 && spans[spans.length - 1].held === held) continue;
        spans.push({ from: spans.length === 0 ? 0 : seg.from, held });
    }
    if (spans.every((s) => s.held === 0)) return null;
    return { carries, spans };
}

/** A Horn/Equipment event with the piece it plays on. */
export interface HeldHornEvent extends HornEvent {
    /** The hold family it plays in; null for empty hands (the arms follow the Feet). */
    family: HoldFamily | null;
    /** Which of the performer's pieces draws (`SlotEquipment.carries`). */
    held: number;
}

/**
 * The channel's `events` (from `planHornChannel`) over the performer's
 * pieces: each event plays in the family of the piece held when it lands,
 * and each change of piece starts on `defaultState`, the new piece's
 * default hold, until the next event. A transition that would start before
 * its piece is in hand starts on the swap.
 */
export function heldHornEvents(
    events: readonly HornEvent[],
    equipment: SlotEquipment,
    defaultState: HoldState,
): HeldHornEvent[] {
    const { carries, spans } = equipment;
    const spanAt = (c: number) => {
        let k = 0;
        while (k + 1 < spans.length && spans[k + 1].from <= c) k++;
        return k;
    };
    const tag = (e: HornEvent, k: number): HeldHornEvent => {
        const from = Math.max(e.from, spans[k].from);
        return {
            ...e,
            from,
            to: Math.max(e.to, from),
            family: carries[spans[k].held]?.family ?? null,
            held: spans[k].held,
        };
    };
    // each swap first, so an event of its own on the same count wins
    const all = [
        ...spans.slice(1).map((s, n) => ({
            e: tag(
                {
                    from: s.from,
                    to: s.from,
                    state: defaultState,
                    fromState: null,
                },
                n + 1,
            ),
            order: 0,
        })),
        ...events.map((e) => ({ e: tag(e, spanAt(e.to)), order: 1 })),
    ].sort((a, b) => a.e.from - b.e.from || a.order - b.order);
    const out: HeldHornEvent[] = [];
    for (const { e } of all) {
        if (out.length > 0 && out[out.length - 1].from === e.from) out.pop();
        out.push(e);
    }
    return out;
}
