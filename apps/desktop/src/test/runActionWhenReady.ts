import { act, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import type { ActionId } from "@/shortcuts/definitions";
import { isActionEnabled, runAction } from "@/shortcuts/registry";

/**
 * Runs a shortcut action the way a toolbar button or its key does, once its handler is mounted
 * and enabled (an editor handler waits for the selected page, field and marcher pages to load).
 */
export const runActionWhenReady = async (id: ActionId) => {
    await waitFor(() => expect(isActionEnabled(id), id).toBe(true));
    act(() => {
        runAction(id);
    });
};
