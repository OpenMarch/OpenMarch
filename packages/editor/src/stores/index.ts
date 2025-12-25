// Simple stores with no internal dependencies
export { useFullscreenStore } from "./FullscreenStore";
export { useSelectionStore } from "./SelectionStore";
export { useSidebarModalStore } from "./SidebarModalStore";
export { useMetronomeStore } from "./MetronomeStore";
export {
    useUiSettingsStore,
    defaultSettings,
    type UiSettings,
    type FocusableComponents,
} from "./UiSettingsStore";

// TODO: Add these stores after copying their class dependencies
// export { useAlignmentEventStore } from "./AlignmentEventStore";
// export { useCanvasStore } from "./CanvasStore";
// export { useCollisionStore } from "./CollisionStore";
// export { useRegisteredActionsStore } from "./RegisteredActionsStore";
