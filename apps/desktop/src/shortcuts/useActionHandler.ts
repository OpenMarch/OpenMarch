import { useEffect, useLayoutEffect, useRef } from "react";
import type { ActionArgs, ActionId } from "./definitions";
import {
    notifyActionHandlersChanged,
    registerActionHandler,
    type ReleaseReason,
} from "./registry";

interface HandlerOptions {
    /** When false the action is skipped by shortcuts and greyed out in the palette. Default true. */
    enabled?: boolean;
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
     * page range). Translated by the caller. Default: the definition's label.
     */
    label?: string;
    /**
     * Whether the action is already done for its target, so menus show it checked (holds: every
     * selected marcher is already in the state it sets). Pass `enabled: false` with it. Default
     * false.
     */
    checked?: boolean;
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

export function useActionHandlerGroup(
    ids: readonly ActionId[],
    run: (id: ActionId, args: ActionArgs | undefined) => void,
    options: HandlerOptions = {},
): void {
    const enabled = options.enabled ?? true;
    const runRef = useRef(run);
    const enabledRef = useRef(enabled);
    const ignoreRepeatRef = useRef<boolean | (() => boolean)>(
        options.ignoreRepeat ?? false,
    );
    const pressRef = useRef(options.onPress);
    const hasPress = options.onPress !== undefined;
    const releaseRef = useRef(options.onRelease);
    const labelRef = useRef(options.label);
    const checkedRef = useRef(options.checked ?? false);
    const hasRelease = options.onRelease !== undefined;
    useLayoutEffect(() => {
        runRef.current = run;
        ignoreRepeatRef.current = options.ignoreRepeat ?? false;
        pressRef.current = options.onPress;
        releaseRef.current = options.onRelease;
    });
    useLayoutEffect(() => {
        if (labelRef.current === options.label) return;
        labelRef.current = options.label;
        notifyActionHandlersChanged();
    }, [options.label]);
    useLayoutEffect(() => {
        const checked = options.checked ?? false;
        if (checkedRef.current === checked) return;
        checkedRef.current = checked;
        notifyActionHandlersChanged();
    }, [options.checked]);
    useLayoutEffect(() => {
        if (enabledRef.current === enabled) return;
        enabledRef.current = enabled;
        // Lets subscribers such as ActionButton re-read isActionEnabled().
        notifyActionHandlersChanged();
    }, [enabled]);

    const idsKey = ids.join("|");
    useEffect(() => {
        // "".split("|") is [""], so an empty list must not be split.
        const idList = idsKey === "" ? [] : idsKey.split("|");
        const unregister = idList.map((id) =>
            registerActionHandler(id as ActionId, {
                run: (args) => runRef.current(id as ActionId, args),
                isEnabled: () => enabledRef.current,
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
                label: () => labelRef.current,
                checked: () => checkedRef.current,
            }),
        );
        return () => unregister.forEach((off) => off());
    }, [idsKey, hasPress, hasRelease]);
}
