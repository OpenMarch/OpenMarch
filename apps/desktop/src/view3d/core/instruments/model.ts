/**
 * What every instrument model is, whichever section builds it
 * (docs/3d/instruments.md §3, §4): pieces in the instrument frame, each
 * riding one bone of the v4 skeleton. Pure: no three.js.
 */
import type { Piece, Vec3 } from "./mesh";

export type BrassModelId =
    | "trumpet"
    | "mellophone"
    | "baritone"
    | "euphonium"
    | "trombone"
    | "bassTrombone"
    | "contra";
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
export type InstrumentBone = "handR" | "handL" | "spine002";

export type Detail = "high" | "low";

export interface InstrumentModel {
    id: ModelId;
    /** The options the model was built with, when any. */
    options?: ModelOptions;
    pieces: Piece[];
    /** The bone pieces ride unless they name their own. Default: the right hand. */
    bone?: InstrumentBone;
    /** The left hand's grip point in the instrument frame. */
    leftGrip: Vec3;
    /** The mouthpiece's position in the instrument frame. */
    mouthpiece: Vec3;
}
