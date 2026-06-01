import { RegisteredActionsEnum } from "./registeredActionsEnum";

export const MARCHER_PLACEMENT_REGISTERED_ACTIONS: ReadonlySet<RegisteredActionsEnum> =
    new Set([
        // Batch copy positions from adjacent pages
        RegisteredActionsEnum.setAllMarchersToPreviousPage,
        RegisteredActionsEnum.setSelectedMarchersToPreviousPage,
        RegisteredActionsEnum.setAllMarchersToNextPage,
        RegisteredActionsEnum.setSelectedMarchersToNextPage,
        // Nudge / WASD
        RegisteredActionsEnum.moveSelectedMarchersUp,
        RegisteredActionsEnum.moveSelectedMarchersDown,
        RegisteredActionsEnum.moveSelectedMarchersLeft,
        RegisteredActionsEnum.moveSelectedMarchersRight,
        // Alignment & transforms
        RegisteredActionsEnum.snapToNearestCustomFraction,
        RegisteredActionsEnum.lockX,
        RegisteredActionsEnum.lockY,
        RegisteredActionsEnum.alignVertically,
        RegisteredActionsEnum.alignHorizontally,
        RegisteredActionsEnum.evenlyDistributeHorizontally,
        RegisteredActionsEnum.evenlyDistributeVertically,
        RegisteredActionsEnum.flipHorizontal,
        RegisteredActionsEnum.flipVertical,
        RegisteredActionsEnum.swapMarchers,
        // Shape / line placement that writes coordinates
        RegisteredActionsEnum.applyQuickShape,
        RegisteredActionsEnum.createMarcherShape,
        RegisteredActionsEnum.createCircle,
        RegisteredActionsEnum.alignmentEventLine,
    ]);

export function isMarcherPlacementRegisteredAction(
    action: RegisteredActionsEnum,
): boolean {
    return MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(action);
}
