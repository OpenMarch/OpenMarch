import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Translate } from "../labels";
import type { ParamCommand } from "./commandBar";

/** One row in the command palette. */
export interface PaletteItem {
    /** Unique across all sources, e.g. "action:nextPage" or "page:12". */
    id: string;
    label: string;
    /** Heading the item is listed under, also searched, e.g. the category. */
    group: string;
    icon?: ReactNode;
    /** Extra search words that aren't shown. */
    keywords?: readonly string[];
    /** Shortcut split into keycaps, e.g. ["⌘", "K"]. */
    shortcut?: readonly string[];
    /** Shown greyed out and can't be run. */
    disabled?: boolean;
    /** Why a disabled item can't run, shown in its row ("Edits the drill — switch to Editor"). */
    disabledReason?: string;
    /** Curated position in "Suggested" before usage history exists (lower comes first). */
    suggestedRank?: number;
    /** A plain action: runs once the palette has closed */
    run?: () => void;
    /** Shows what it would change while it's the highlighted row (true), and stops (false) */
    preview?: (on: boolean) => void;
    /**
     * A branch of the command tree (Shape › Box): choosing it lists these instead. Searching
     * finds them from the top as "Shape › Box".
     */
    children?: () => readonly PaletteItem[];
    /** A command that asks for parameters (`commandBar.ts`): choosing it docks the bar */
    command?: ParamCommand;
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
