import { useEffect, useLayoutEffect, useRef } from "react";
import type { ActionArgs, ActionId } from "./definitions";
import {
    notifyActionHandlersChanged,
    registerActionHandler,
    type ReleaseReason,
} from "./registry";

interface HandlerOptions {
    /**
     * When false the action is skipped by shortcuts and greyed out in the palette. A function is
     * read only when asked (a key press, the palette, a button's render), for a check too costly to
     * run on every change. Default true.
     */
    enabled?: boolean | (() => boolean);
    /**
     * When true, a held key runs the action once rather than on each repeat, as the definition's
     * `ignoreRepeat` does, but it can change with state (navigation while playing). A function is
     * read at each repeat, for state kept outside React (an undo still running). Default false.
     */
    ignoreRepeat?: boolean | (() => boolean);
    /**
     * Runs instead of `run` when a key press runs the action; the palette and buttons still call
     * `run`. For held actions whose key works differently (hold N to peek, the palette latches).
     */
    onPress?: (args: ActionArgs | undefined) => void;
    /** Runs when the key that ran the action is let go (or lost: the window lost focus while held) */
    onRelease?: (reason: ReleaseReason) => void;
    /**
     * The label shown in the palette instead of the definition's, for one that names state (a
     * page range). Translated by the caller. A function is read only when the palette asks, for
     * one too costly to work out on every change. Default: the definition's label.
     */
    label?: string | (() => string | undefined);
    /**
     * Whether the action is already done for its target, so menus show it checked (holds: every
     * selected marcher is already in the state it sets). Pass `enabled: false` with it. Default
     * false.
     */
    checked?: boolean;
    /**
     * Why the action is disabled, said where it's greyed out (the palette shows it beside the
     * entry), instead of a toast after a press. Translated by the caller. A function is read only
     * when asked, and only while the action is disabled. Default: none.
     */
    disabledReason?: string | (() => string | undefined);
    /**
     * Shows what the action would change while the palette highlights it (true), and stops
     * (false). It must not edit anything.
     */
    preview?: (on: boolean) => void;
}

export function useActionHandler(
    id: ActionId,
    run: (args: ActionArgs | undefined) => void,
    options: HandlerOptions = {},
    /**
     * When false the action has no handler at all, so the command palette doesn't list it (not
     * just greyed out). Default true.
     */
    registered = true,
): void {
    useActionHandlerGroup(
        registered ? [id] : [],
        (_id, args) => run(args),
        options,
    );
}

/** A value, or a function read only when asked */
const read = <T>(value: T | (() => T)): T =>
    typeof value === "function" ? (value as () => T)() : value;

/**
 * A ref to `value` that tells the action's subscribers when it changes. A function is read when
 * asked, so a new one each render tells nobody.
 */
function useWatchedRef<T>(value: T) {
    const ref = useRef(value);
    useLayoutEffect(() => {
        if (ref.current === value) return;
        const quiet =
            typeof ref.current === "function" && typeof value === "function";
        ref.current = value;
        if (!quiet) notifyActionHandlersChanged();
    }, [value]);
    return ref;
}

export function useActionHandlerGroup(
    ids: readonly ActionId[],
    run: (id: ActionId, args: ActionArgs | undefined) => void,
    options: HandlerOptions = {},
): void {
    const enabled = options.enabled ?? true;
    const runRef = useRef(run);
    // Subscribers such as ActionButton re-read these when they change
    const enabledRef = useWatchedRef(enabled);
    const ignoreRepeatRef = useRef<boolean | (() => boolean)>(
        options.ignoreRepeat ?? false,
    );
    const pressRef = useRef(options.onPress);
    const hasPress = options.onPress !== undefined;
    const releaseRef = useRef(options.onRelease);
    const labelRef = useWatchedRef(options.label);
    const checkedRef = useRef(options.checked ?? false);
    const previewRef = useRef(options.preview);
    const reasonRef = useWatchedRef(options.disabledReason);
    const hasRelease = options.onRelease !== undefined;
    useLayoutEffect(() => {
        runRef.current = run;
        ignoreRepeatRef.current = options.ignoreRepeat ?? false;
        pressRef.current = options.onPress;
        releaseRef.current = options.onRelease;
        previewRef.current = options.preview;
    });
    useLayoutEffect(() => {
        const checked = options.checked ?? false;
        if (checkedRef.current === checked) return;
        checkedRef.current = checked;
        notifyActionHandlersChanged();
    }, [options.checked]);

    const idsKey = ids.join("|");
    useEffect(() => {
        // "".split("|") is [""], so an empty list must not be split.
        const idList = idsKey === "" ? [] : idsKey.split("|");
        const unregister = idList.map((id) =>
            registerActionHandler(id as ActionId, {
                run: (args) => runRef.current(id as ActionId, args),
                isEnabled: () => {
                    const on = enabledRef.current;
                    return typeof on === "function" ? on() : on;
                },
                ignoresRepeat: () => {
                    const ignore = ignoreRepeatRef.current;
                    return typeof ignore === "function" ? ignore() : ignore;
                },
                press: hasPress
                    ? (args) => pressRef.current?.(args)
                    : undefined,
                release: hasRelease
                    ? (reason) => releaseRef.current?.(reason)
                    : undefined,
                label: () => read(labelRef.current),
                checked: () => checkedRef.current,
                disabledReason: () => read(reasonRef.current),
                preview: (on) => previewRef.current?.(on),
            }),
        );
        return () => unregister.forEach((off) => off());
        // The refs are stable (useWatchedRef)
    }, [idsKey, hasPress, hasRelease, enabledRef, labelRef, reasonRef]);
}
