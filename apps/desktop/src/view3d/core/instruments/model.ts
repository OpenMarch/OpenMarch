/**
 * What every instrument model is, whichever section builds it
 * (docs/3d/instruments.md §3, §4): pieces in the instrument frame, each
 * riding one bone of the v4 skeleton. Pure: no three.js.
 */
import type { Piece, Vec3 } from "./mesh";
import type { SilkCutId } from "./silkWave";

export type BrassModelId =
    | "trumpet"
    | "mellophone"
    | "baritone"
    | "euphonium"
    | "trombone"
    | "bassTrombone"
    | "contra"
    | "sousaphone";
export type WoodwindModelId =
    | "piccolo"
    | "flute"
    | "clarinet"
    | "bassClarinet"
    | "sopranoSax"
    | "altoSax"
    | "tenorSax"
    | "bariSax";
export type BatteryModelId = "snare" | "tenors" | "bass" | "cymbals";
export type GuardModelId =
    | "flag6"
    | "swingFlag"
    | "doubleSwingFlag"
    | "rifle"
    | "sabre";
export type ModelId =
    | BrassModelId
    | WoodwindModelId
    | BatteryModelId
    | GuardModelId;

/** Per-model options: a bass drum's head diameter in inches. */
export interface ModelOptions {
    bassInches?: number;
}

/** The bones instrument pieces ride: the hands, or the chest for a carrier. */
export type InstrumentBone = "handR" | "handL" | "spine002" | "head";

export type Detail = "high" | "low";

/**
 * A flag's silk: drawn apart from the instrument, in its own cloth mesh
 * with the silk wave (`silkWave.ts`, props-spec.md section 7). The silk
 * frame has +X out to the fly, +Y up the pole and +Z its face, with the
 * origin at the top of the hoist edge.
 */
export interface SilkSpec {
    /** Out from the pole to the fly edge, m. */
    fly: number;
    /** Along the pole, m. */
    header: number;
    /**
     * The silk frame in the instrument frame, a rotation, row-major: its
     * columns are the silk's +X, +Y and +Z.
     */
    basis: [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
    ];
    /** The silk frame's origin in the instrument frame. */
    origin: Vec3;
    /**
     * −1 for a mirror image (the second of a pair of swing flags): the
     * wave's face offset flips, so `basis` stays a rotation.
     */
    mirror: 1 | -1;
    /** The bone the silk rides, when not the model's default. */
    bone?: InstrumentBone;
    /** The silk's Cut (`silkWave.ts`); none is the header × fly rectangle. */
    cut?: SilkCutId;
}

export interface InstrumentModel {
    id: ModelId;
    /** The options the model was built with, when any. */
    options?: ModelOptions;
    pieces: Piece[];
    /** A flag's silks, drawn by the silk mesh rather than with the pieces. */
    silks?: SilkSpec[];
    /** The bone pieces ride unless they name their own. Default: the right hand. */
    bone?: InstrumentBone;
    /** The left hand's grip point in the instrument frame. */
    leftGrip: Vec3;
    /** The mouthpiece's position in the instrument frame. */
    mouthpiece: Vec3;
}
