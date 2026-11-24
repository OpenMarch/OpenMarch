import { create } from "zustand";

/**
 * The item whose resize and turn handles the field shows, or null (props epic step 2): a prop is
 * usually drawn at its real size, so a selected prop moves like a marcher and its handles show
 * only once asked for, with its right-click menu's Resize and turn (owner, 2026-11-24). They go
 * again when the selection becomes anything else (`useItemActionHandlers`).
 */
export const useItemHandlesStore = create<{ readonly id: number | null }>(
    () => ({ id: null }),
);

export const showItemHandles = (id: number) =>
    useItemHandlesStore.setState({ id });

export const hideItemHandles = () => {
    if (useItemHandlesStore.getState().id !== null)
        useItemHandlesStore.setState({ id: null });
};

/** Whether item `id`'s handles are shown */
export const itemHandlesShown = (id: number) =>
    useItemHandlesStore.getState().id === id;
