import {
    getActionDefinition,
    type ActionArgs,
    type ActionId,
} from "./definitions";

export interface ActionHandler {
    run: (args: ActionArgs | undefined) => void;
    isEnabled: () => boolean;
}

const handlers = new Map<ActionId, ActionHandler[]>();
const listeners = new Set<() => void>();

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

export function runAction(id: ActionId): boolean {
    const handler = top(id);
    if (!handler || !handler.isEnabled()) return false;
    handler.run(getActionDefinition(id).args);
    return true;
}

export function subscribeToActionHandlers(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
