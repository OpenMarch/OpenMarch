import { useEffect, useLayoutEffect, useRef } from "react";
import type { ActionArgs, ActionId } from "./definitions";
import { notifyActionHandlersChanged, registerActionHandler } from "./registry";

interface HandlerOptions {
    /** When false the action is skipped by shortcuts and greyed out in the palette. Default true. */
    enabled?: boolean;
    /**
     * When true, a held key runs the action once rather than on each repeat, as the definition's
     * `ignoreRepeat` does, but it can change with state (navigation while playing). Default false.
     */
    ignoreRepeat?: boolean;
}

export function useActionHandler(
    id: ActionId,
    run: (args: ActionArgs | undefined) => void,
    options: HandlerOptions = {},
): void {
    useActionHandlerGroup([id], (_id, args) => run(args), options);
}

export function useActionHandlerGroup(
    ids: readonly ActionId[],
    run: (id: ActionId, args: ActionArgs | undefined) => void,
    options: HandlerOptions = {},
): void {
    const enabled = options.enabled ?? true;
    const runRef = useRef(run);
    const enabledRef = useRef(enabled);
    const ignoreRepeatRef = useRef(options.ignoreRepeat ?? false);
    useLayoutEffect(() => {
        runRef.current = run;
        ignoreRepeatRef.current = options.ignoreRepeat ?? false;
    });
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
                ignoresRepeat: () => ignoreRepeatRef.current,
            }),
        );
        return () => unregister.forEach((off) => off());
    }, [idsKey]);
}
