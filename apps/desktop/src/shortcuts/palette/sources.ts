import { useEffect, useLayoutEffect, useRef } from "react";
import type { Translate } from "../labels";

/** One row in the command palette. */
export interface PaletteItem {
    /** Unique across all sources, e.g. "action:nextPage" or "page:12". */
    id: string;
    label: string;
    /** Shown beside the label and searched, e.g. the category. */
    group: string;
    /** Extra search words that aren't shown. */
    keywords?: readonly string[];
    /** Formatted shortcut, e.g. "⌘K". */
    shortcut?: string;
    /** Shown greyed out and can't be run. */
    disabled?: boolean;
    run: () => void;
}

export interface PaletteContext {
    t: Translate;
}

/**
 * Supplies palette items. Items are read only while the palette is open, so a source can
 * compute them from current state (pages, marchers, recent files) without subscribing.
 */
export interface PaletteSource {
    id: string;
    getItems: (context: PaletteContext) => readonly PaletteItem[];
}

const sources = new Map<string, PaletteSource>();
const listeners = new Set<() => void>();

export function registerPaletteSource(source: PaletteSource): () => void {
    sources.set(source.id, source);
    listeners.forEach((listener) => listener());
    return () => {
        if (sources.get(source.id) === source) sources.delete(source.id);
        listeners.forEach((listener) => listener());
    };
}

export function getPaletteItems(context: PaletteContext): PaletteItem[] {
    return [...sources.values()].flatMap((source) => [
        ...source.getItems(context),
    ]);
}

export function subscribeToPaletteSources(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Registers a palette source for the component's lifetime. `getItems` may close over current props/state. */
export function usePaletteSource(
    id: string,
    getItems: PaletteSource["getItems"],
): void {
    const getItemsRef = useRef(getItems);
    useLayoutEffect(() => {
        getItemsRef.current = getItems;
    });
    useEffect(
        () =>
            registerPaletteSource({
                id,
                getItems: (context) => getItemsRef.current(context),
            }),
        [id],
    );
}
