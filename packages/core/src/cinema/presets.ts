import type { CinemaShot } from "./types";

/**
 * The built-in shots: named combinations of a rig, a subject, a tightness, a
 * move and a transition. The subject is a starting point; the director swaps
 * in who the shot is about.
 */

export interface CinemaPreset {
    id: string;
    /** The English name. The app shows its own translated name by id. */
    label: string;
    shot: Pick<
        CinemaShot,
        "rig" | "subject" | "tightness" | "move" | "transition"
    > &
        Partial<Pick<CinemaShot, "rigSettings" | "moveSettings">>;
}

/** In menu order. */
export const BUILTIN_PRESETS: readonly CinemaPreset[] = [
    {
        id: "box",
        label: "Press box",
        shot: {
            rig: { kind: "builtin", id: "pressBox" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "smooth",
        },
    },
    {
        id: "yard25L",
        label: "25 yard line, side 1",
        shot: {
            rig: { kind: "builtin", id: "yard25" },
            rigSettings: { side: 1 },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "cut",
        },
    },
    {
        id: "yard25R",
        label: "25 yard line, side 2",
        shot: {
            rig: { kind: "builtin", id: "yard25" },
            rigSettings: { side: 2 },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "cut",
        },
    },
    {
        id: "topDown",
        label: "Top down",
        shot: {
            rig: { kind: "builtin", id: "topDown" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "craneThrough",
        },
    },
    {
        id: "endZone",
        label: "End zone",
        shot: {
            rig: { kind: "builtin", id: "endZone" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "cut",
        },
    },
    {
        id: "lowSideline",
        label: "Low sideline",
        shot: {
            rig: { kind: "builtin", id: "lowSideline" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "track",
            transition: "cut",
        },
    },
    {
        id: "closeUp",
        label: "Close-up",
        shot: {
            rig: { kind: "builtin", id: "closeUp" },
            subject: { kind: "center" },
            tightness: "closeUp",
            move: "hold",
            transition: "cut",
        },
    },
    {
        id: "follow",
        label: "Follow",
        shot: {
            rig: { kind: "builtin", id: "follow" },
            subject: { kind: "center" },
            tightness: "medium",
            move: "hold",
            transition: "smooth",
        },
    },
    {
        id: "craneOver",
        label: "Crane over",
        shot: {
            rig: { kind: "builtin", id: "yard25" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "craneOver",
            transition: "smooth",
        },
    },
    {
        id: "cableCam",
        label: "Cable cam",
        shot: {
            rig: { kind: "builtin", id: "lowSideline" },
            // Starts on the side 1 30 and runs 40 m to the side 2 35.
            rigSettings: { yardLine: 30, heightM: 5 },
            subject: { kind: "band" },
            tightness: "medium",
            move: "track",
            moveSettings: { meters: 40 },
            transition: "cut",
        },
    },
    {
        id: "pushIn",
        label: "Push in",
        shot: {
            rig: { kind: "builtin", id: "pressBox" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "pushIn",
            transition: "smooth",
        },
    },
];
