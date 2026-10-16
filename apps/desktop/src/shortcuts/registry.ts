import {
    getActionDefinition,
    type ActionArgs,
    type ActionId,
} from "./definitions";

export interface ActionHandler {
    run: (args: ActionArgs | undefined) => void;
    isEnabled: () => boolean;
    /** True while a held key's repeats shouldn't run the action again */
    ignoresRepeat?: () => boolean;
    /** Runs when the key that ran the action is let go, for actions that last while held */
    release?: () => void;
}

const handlers = new Map<ActionId, ActionHandler[]>();
const listeners = new Set<() => void>();
const runListeners = new Set<(id: ActionId) => void>();

function notify() {
    listeners.forEach((listener) => listener());
}

function top(id: ActionId): ActionHandler | undefined {
    const stack = handlers.get(id);
    return stack?.[stack.length - 1];
}

export function registerActionHandler(
    id: ActionId,
    handler: ActionHandler,
): () => void {
    handlers.set(id, [...(handlers.get(id) ?? []), handler]);
    notify();
    return () => {
        const remaining = (handlers.get(id) ?? []).filter((h) => h !== handler);
        if (remaining.length > 0) handlers.set(id, remaining);
        else handlers.delete(id);
        notify();
    };
}

export function hasActionHandler(id: ActionId): boolean {
    return top(id) !== undefined;
}

export function isActionEnabled(id: ActionId): boolean {
    return top(id)?.isEnabled() ?? false;
}

/** Whether the action's handler skips key repeats right now (`useActionHandler`'s `ignoreRepeat`) */
export function actionIgnoresRepeat(id: ActionId): boolean {
    return top(id)?.ignoresRepeat?.() ?? false;
}

export function runAction(id: ActionId): boolean {
    const handler = top(id);
    if (!handler || !handler.isEnabled()) return false;
    runListeners.forEach((listener) => listener(id));
    handler.run(getActionDefinition(id).args);
    return true;
}

/**
 * Runs the action and returns what to call when its key is let go, or null if it didn't run or
 * doesn't care about release (`useActionHandler`'s `onRelease`).
 */
export function pressAction(id: ActionId): (() => void) | null {
    const handler = top(id);
    if (!runAction(id) || !handler?.release) return null;
    const release = handler.release;
    return () => release();
}

/** Call when a handler's `isEnabled()` result may have changed without a (un)registration. */
export function notifyActionHandlersChanged(): void {
    notify();
}

export function subscribeToActionHandlers(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Calls `listener` with each action's id just before the action runs. */
export function subscribeToActionRuns(
    listener: (id: ActionId) => void,
): () => void {
    runListeners.add(listener);
    return () => {
        runListeners.delete(listener);
    };
}
