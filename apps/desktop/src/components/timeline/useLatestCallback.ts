import { useCallback, useRef } from "react";

/**
 * A callback whose identity stays the same across renders while it calls the latest `callback`,
 * so a memoized child that gets it doesn't re-render when only the closure changed. It is
 * `undefined` while `callback` is, so a child can still tell whether the command is offered.
 * Only for event handlers and effects: it reads the closure from the last render.
 */
export function useLatestCallback<Args extends unknown[], Result>(
    callback: ((...args: Args) => Result) | undefined,
): ((...args: Args) => Result) | undefined {
    const latest = useRef(callback);
    latest.current = callback;
    const stable = useCallback((...args: Args) => latest.current!(...args), []);
    return callback ? stable : undefined;
}
