// Types for the vendored step-blend.js (om-pose). Hand-written; keep in step with the .js.

export interface ManifestClip {
    name: string;
    base: string;
    height?: number;
    step_m?: number;
    dir?: [number, number];
    loop?: boolean;
    min_bpm?: number;
    file?: string;
    root_x?: number[];
    root_z?: number[];
    from_count?: number;
    from?: string;
    to?: string;
    turn_window?: [number, number];
    turn_pivot?: [number, number];
    [key: string]: unknown;
}
export type Manifest = ManifestClip[] | { clips: ManifestClip[] };

export type Family = "forward" | "backward" | "slideL" | "slideR";
export const FAMILIES: Record<Family, [number, number]>;
export const SIDEWAYS_TOL: number;

export interface Pick {
    a: string;
    b: string;
    weight: number;
    baseA: string;
    baseB: string;
    stepA: number;
    stepB: number;
    d: number;
    height: number;
    clamped: boolean;
}
export interface ClipPair {
    a: string;
    b: string | null;
    weight: number;
    clipA: ManifestClip;
    clipB: ManifestClip;
}
export interface Direction {
    family: Family | "none";
    legYaw: number;
    phi: number;
}
export interface TurnedPair extends ClipPair {
    built: number;
    residual: number;
    window: [number, number];
    pivot: [number, number] | null;
    kind: string;
    legYaw: [number, number, number, number];
}
interface SizeOpts {
    height?: number;
    bpm?: number;
}

export function familySizes(
    manifest: Manifest,
    family: Family | [number, number],
    opts?: SizeOpts,
): ManifestClip[];
export function pickBlend(
    manifest: Manifest,
    family: Family,
    d: number,
    opts?: SizeOpts,
): Pick;
export function blendClips(
    manifest: Manifest,
    pick: Pick,
    kind?: "" | "stepoff" | "halt" | "halt2",
): ClipPair;
export function blendRoot(
    manifest: Manifest,
    pair: ClipPair,
    u: number,
): [number, number];
export function pickDirection(
    facing: number,
    tx: number,
    tz: number,
): Direction;
export function turnedDir(family: Family, legYaw: number): [number, number];
export function turnedClips(
    manifest: Manifest,
    pick: Pick,
    dir: Direction,
    kind: "stepoff" | "halt" | "halt2",
): TurnedPair;
export const turnEase: (x: number) => number;
export function turnAt(pair: TurnedPair, u: number): number;
export function turnRoot(
    manifest: Manifest,
    pair: TurnedPair,
    u: number,
): [number, number];
