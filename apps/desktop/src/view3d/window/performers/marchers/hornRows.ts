/**
 * The Horn/Equipment channel's bake rows for the window
 * (performer-behavior.md section 8.3): one hold row per hold a marcher can
 * play, and a transition row between two holds of one family. The hold's
 * arm pose is the channel's default row, so the Feet clips bake once
 * whatever the marchers carry.
 */
import type * as THREE from "three";
import type { ArmHold, HornRowSpec } from "@/view3d/render/channelBake";
import type { ChannelPlay } from "@/view3d/render/channelState";
import {
    hold as holdFor,
    holdId,
    type HoldFamily,
    type HoldState,
} from "@/view3d/core/instruments/holds";
import type { HornEvent } from "@/view3d/core/marchers/hornChannel";
import { poseArms } from "./armPose";
import { gripMatrix } from "./instrumentGeometry";

/** The bake row of a hold (`holdId`). */
export const holdRowName = (holdId: string) => `hold:${holdId}`;

/** The bake row of the transition from one hold state to another. */
export const transitionRowName = (
    family: HoldFamily,
    from: HoldState,
    to: HoldState,
) => `trans:${family}:${from}>${to}`;

/** The arm pose and right-hand grip of a hold, for the bake. */
export function armHold(
    skeleton: THREE.Skeleton,
    family: HoldFamily,
    state: HoldState,
): ArmHold {
    const h = holdFor(family, state);
    const pose = poseArms(skeleton, h);
    return { local: pose.local, grip: gripMatrix(skeleton, pose, h) };
}

interface Rows {
    row: number;
    frames: number;
    counts: number;
}

/**
 * What the channel plays for `event`: its hold row looping, or its
 * transition row once, stretched from the event's start to its click.
 * Null when the row isn't baked (yet): the bones then follow the Feet.
 */
export function hornPlay(
    event: HornEvent,
    family: HoldFamily,
    rows: Readonly<Record<string, Rows>>,
): ChannelPlay | null {
    if (event.fromState !== null && event.to > event.from) {
        const r = rows[transitionRowName(family, event.fromState, event.state)];
        if (r) {
            const rate = r.counts / (event.to - event.from);
            return {
                row: r.row,
                frames: r.frames,
                counts: r.counts,
                phase: -event.from * rate,
                rate,
                once: true,
            };
        }
    }
    const r = rows[holdRowName(holdId(family, event.state))];
    if (!r) return null;
    return {
        row: r.row,
        frames: r.frames,
        counts: r.counts,
        phase: 0,
        rate: 1,
        once: false,
    };
}

/** The rows `events` play for `family`: hold and transition row names. */
export function hornRowsOf(
    events: readonly HornEvent[],
    family: HoldFamily,
): string[] {
    const out = new Set<string>();
    for (const e of events) {
        out.add(holdRowName(holdId(family, e.state)));
        if (e.fromState !== null)
            out.add(transitionRowName(family, e.fromState, e.state));
    }
    return [...out];
}

/** The bake spec of a hold or transition row named as above, or null for another name. */
export function hornRowSpec(
    name: string,
    skeleton: THREE.Skeleton,
): HornRowSpec | null {
    const hold = /^hold:([A-Za-z]+):([a-z]+)$/.exec(name);
    if (hold)
        return {
            name,
            from: armHold(
                skeleton,
                hold[1] as HoldFamily,
                hold[2] as HoldState,
            ),
        };
    const tr = /^trans:([A-Za-z]+):([a-z]+)>([a-z]+)$/.exec(name);
    if (tr)
        return {
            name,
            from: armHold(skeleton, tr[1] as HoldFamily, tr[2] as HoldState),
            to: armHold(skeleton, tr[1] as HoldFamily, tr[3] as HoldState),
        };
    return null;
}
