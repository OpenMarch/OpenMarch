import {
    getActionDefinition,
    type ActionArgs,
    type ActionId,
} from "./definitions";
import { isActionOffInWorkspace } from "./workspaceActions";

/**
 * Why a held action was let go: its key came up, or the key was lost (the window lost focus, a
 * second press arrived without a key up, or the listener went away).
 */
export type ReleaseReason = "keyup" | "lost";

export interface ActionHandler {
    run: (args: ActionArgs | undefined) => void;
    isEnabled: () => boolean;
    /** True while a held key's repeats shouldn't run the action again */
    ignoresRepeat?: () => boolean;
    /**
     * Runs instead of `run` when a key press runs the action (`pressAction`), for actions whose
     * key works differently from the palette or a button (hold N to peek, the palette latches)
     */
    press?: (args: ActionArgs | undefined) => void;
    /** Runs when the key that ran the action is let go, for actions that last while held */
    release?: (reason: ReleaseReason) => void;
    /** The label right now, when it depends on state (a page range); the definition's otherwise */
    label?: () => string | undefined;
    /**
     * Whether the action is already done for its target (every selected marcher already in the
     * state it sets): menus show it checked. Such an action is disabled too
     */
    checked?: () => boolean;
    /**
     * Shows what the action would change while it's highlighted in the palette (true) and stops
     * (false): a preview with no edit, such as the hold bars a follow-back lights
     */
    preview?: (on: boolean) => void;
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
    return !isActionOffInWorkspace(id) && (top(id)?.isEnabled() ?? false);
}

/** The label the action's handler gives right now (`useActionHandler`'s `label`), if any */
export function actionLabelNow(id: ActionId): string | undefined {
    return top(id)?.label?.();
}

/** Whether the action's handler says it is already done (`useActionHandler`'s `checked`) */
export function isActionChecked(id: ActionId): boolean {
    return top(id)?.checked?.() ?? false;
}

/** Shows (`on`) or stops the action's preview (`useActionHandler`'s `preview`), if it has one */
export function previewAction(id: ActionId, on: boolean): void {
    top(id)?.preview?.(on);
}

/** Whether the action's handler skips key repeats right now (`useActionHandler`'s `ignoreRepeat`) */
export function actionIgnoresRepeat(id: ActionId): boolean {
    return top(id)?.ignoresRepeat?.() ?? false;
}

/**
 * Runs the action's handler (its `press` for a key press, when it has one) with its definition's
 * `args`, and `args` (a command's answers) over them; null if it can't run
 */
function runHandler(
    id: ActionId,
    byKey: boolean,
    args?: ActionArgs,
): ActionHandler | null {
    const handler = top(id);
    if (!handler || !handler.isEnabled() || isActionOffInWorkspace(id))
        return null;
    runListeners.forEach((listener) => listener(id));
    const run = byKey && handler.press ? handler.press : handler.run;
    const own = getActionDefinition(id).args;
    run(args ? { ...own, ...args } : own);
    return handler;
}

/** Runs the action with its definition's `args`, and `args` (a command's answers) over them */
export function runAction(id: ActionId, args?: ActionArgs): boolean {
    return runHandler(id, false, args) !== null;
}

/**
 * Runs the action and returns what to call when its key is let go, or null if it didn't run or
 * doesn't care about release (`useActionHandler`'s `onRelease`).
 */
export function pressAction(
    id: ActionId,
): ((reason: ReleaseReason) => void) | null {
    const release = runHandler(id, true)?.release;
    if (!release) return null;
    return (reason) => release(reason);
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
