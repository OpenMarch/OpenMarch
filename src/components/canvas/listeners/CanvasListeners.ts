/**
 * CanvasListeners represent all of the listeners that can be attached to a fabric.Canvas instance on OpenMarch.
 */
export default interface CanvasListeners {
    handleObjectModified: (fabricEvent: fabric.IEvent<MouseEvent>) => void;
    handleSelect: (fabricEvent: fabric.IEvent<MouseEvent>) => void;
    handleDeselect: (fabricEvent: fabric.IEvent<MouseEvent>) => void;
    handleMouseDown: (fabricEvent: fabric.IEvent<MouseEvent>) => void;
    handleMouseMove: (fabricEvent: fabric.IEvent<MouseEvent>) => void;
    handleMouseUp: (fabricEvent: fabric.IEvent<MouseEvent>) => void;

    /** Use this function to perform any cleanup actions when switching the cursor mode */
    cleanupListener?: () => void;
}
