/**
 * CanvasListeners represent all of the listeners that can be attached to a fabric.Canvas instance on OpenMarch.
 */
export default interface CanvasListeners {
    /** Use this function to attach listeners to the canvas */
    initiateListeners: () => void;
    /** Use this function to detach listeners and perform any cleanup actions when switching the cursor mode */
    cleanupListeners: () => void;
    /** A function to call when the canvas refreshes the marchers */
    refreshMarchers?: () => void;
}
