import { useSyncExternalStore } from "react";

/**
 * A value that changes on every pointer move of a drag, such as a drawn range's preview. The
 * component that owns it holds it without reading it, so writing it re-renders only the leaf
 * that shows it (`useLiveValue`), not the whole timeline. Writing an equal value does nothing.
 */
export interface TimelineLiveValue<T> {
    readonly get: () => T;
    readonly set: (next: T) => void;
    readonly subscribe: (listener: () => void) => () => void;
}

export function createLiveValue<T>(
    initial: T,
    equal: (a: T, b: T) => boolean = Object.is,
): TimelineLiveValue<T> {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set: (next) => {
            if (equal(value, next)) return;
            value = next;
            for (const listener of listeners) listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

/** Reads a live value, re-rendering when it changes */
export const useLiveValue = <T>(value: TimelineLiveValue<T>): T =>
    useSyncExternalStore(value.subscribe, value.get, value.get);
