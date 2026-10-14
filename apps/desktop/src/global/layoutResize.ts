/**
 * Whether a layout drag (the canvas/timeline splitter) is resizing the panes. While it is, the
 * field canvas keeps its size (only growing when its viewport outgrows it) and refits once when
 * the drag ends, instead of clearing and redrawing the whole field on every frame.
 */
let resizing = false;
const listeners = new Set<(resizing: boolean) => void>();

export const isLayoutResizing = () => resizing;

export const setLayoutResizing = (next: boolean) => {
    if (resizing === next) return;
    resizing = next;
    for (const listener of listeners) listener(next);
};

export const subscribeLayoutResizing = (
    listener: (resizing: boolean) => void,
) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
