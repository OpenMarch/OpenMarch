import { describe, expect, it } from "vitest";
import { RegisteredActionsEnum } from "../RegisteredActionsHandler";
import {
    isMarcherPlacementRegisteredAction,
    MARCHER_PLACEMENT_REGISTERED_ACTIONS,
} from "../marcherPlacementRegisteredActions";

describe("marcherPlacementRegisteredActions", () => {
    it("includes marcher coordinate placement actions", () => {
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.moveSelectedMarchersUp,
            ),
        ).toBe(true);
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.alignHorizontally,
            ),
        ).toBe(true);
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.setSelectedMarchersToNextPage,
            ),
        ).toBe(true);
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.createCircle,
            ),
        ).toBe(true);
    });

    it("excludes navigation, selection, and history actions", () => {
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.nextPage,
            ),
        ).toBe(false);
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.selectAllMarchers,
            ),
        ).toBe(false);
        expect(
            MARCHER_PLACEMENT_REGISTERED_ACTIONS.has(
                RegisteredActionsEnum.performUndo,
            ),
        ).toBe(false);
    });

    it("isMarcherPlacementRegisteredAction matches set membership", () => {
        expect(
            isMarcherPlacementRegisteredAction(
                RegisteredActionsEnum.swapMarchers,
            ),
        ).toBe(true);
        expect(
            isMarcherPlacementRegisteredAction(RegisteredActionsEnum.playPause),
        ).toBe(false);
    });
});
