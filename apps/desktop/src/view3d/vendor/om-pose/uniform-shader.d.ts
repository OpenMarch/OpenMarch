// Types for the vendored uniform-shader.js (om-pose). Hand-written; keep in step with the .js.
import type { MeshStandardMaterial } from "three";

type Three = typeof import("three");

export const PALETTE_SLOTS: string[];
export const STYLES: Record<string, { id: number; label: string; about: string }>;
export const DEFAULT_OPTIONS: Record<string, unknown>;
export const INSTRUMENTS: string[];
export const HAT_TYPES: string[];

export interface UniformInput {
    style?: string;
    colors?: Record<string, number>;
    skin?: number;
    options?: Record<string, unknown>;
    flatShading?: boolean;
}
export function createUniformMaterial(
    THREE: Three,
    input?: UniformInput,
): MeshStandardMaterial;
export function setUniform(
    mat: MeshStandardMaterial,
    input?: UniformInput,
): void;
