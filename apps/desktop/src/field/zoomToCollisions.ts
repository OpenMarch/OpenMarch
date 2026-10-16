import { useCollisionStore } from "@/stores/CollisionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { collisionsView } from "./timelineOverlays";
import { useFieldViewStore } from "./three/fieldView";
import { setView } from "./three/fieldNavigation";

/**
 * "Zoom to collisions": frames the selected page's collisions
 * (`collisionsView`, fork #201) while the field draws them: the Show
 * collisions setting on, and not playing.
 */
export function zoomToCollisions(isPlaying: boolean): void {
    if (isPlaying || !useUiSettingsStore.getState().uiSettings.showCollisions)
        return;
    const { width, height } = useFieldViewStore.getState();
    const view = collisionsView(
        useCollisionStore.getState().currentCollisions,
        width,
        height,
    );
    if (view) setView({ width, height, ...view });
}
