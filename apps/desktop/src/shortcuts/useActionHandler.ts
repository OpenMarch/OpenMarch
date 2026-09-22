import { useEffect, useLayoutEffect, useRef } from "react";
import type { ActionArgs, ActionId } from "./definitions";
import { registerActionHandler } from "./registry";

interface HandlerOptions {
    /** When false the action is skipped by shortcuts and greyed out in the palette. Default true. */
    enabled?: boolean;
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
    const runRef = useRef(run);
    const enabledRef = useRef(options.enabled ?? true);
    useLayoutEffect(() => {
        runRef.current = run;
        enabledRef.current = options.enabled ?? true;
    });

    const idsKey = ids.join("|");
    useEffect(() => {
        // "".split("|") is [""], so an empty list must not be split.
        const idList = idsKey === "" ? [] : idsKey.split("|");
        const unregister = idList.map((id) =>
            registerActionHandler(id as ActionId, {
                run: (args) => runRef.current(id as ActionId, args),
                isEnabled: () => enabledRef.current,
            }),
        );
        return () => unregister.forEach((off) => off());
    }, [idsKey]);
}
