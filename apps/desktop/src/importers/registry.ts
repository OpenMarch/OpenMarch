/**
 * Importer adapter registry.
 * Each adapter is a native module — no plugin system, just an array.
 * Adding a new format = adding a new module and registering it here.
 */

import type { ImporterAdapter } from "./types";
import { pdfAdapter } from "./pdfCoordinates";

const ADAPTERS: ImporterAdapter[] = [pdfAdapter];

/** Find the first adapter that can handle the given file, or undefined. */
export function detectAdapter(file: File): ImporterAdapter | undefined {
    return ADAPTERS.find((a) => a.accepts(file));
}

/** All registered adapters. */
export function getAdapters(): readonly ImporterAdapter[] {
    return ADAPTERS;
}

/** Comma-separated file extensions accepted by any registered adapter. */
export function getAcceptedExtensions(): string {
    const exts = new Set(ADAPTERS.flatMap((a) => a.extensions));
    return [...exts].join(",");
}
