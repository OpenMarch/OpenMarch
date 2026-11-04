// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { isActionEnabled, registerActionHandler, runAction } from "../registry";
import { isActionOffInWorkspace } from "../workspaceActions";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import {
    ACTION_IDS,
    getActionDefinition,
    type ActionCategory,
    type ActionId,
} from "../definitions";

const handle = (id: ActionId) => {
    const run = vi.fn();
    const off = registerActionHandler(id, { run, isEnabled: () => true });
    return { run, off };
};

describe("Preview, which edits nothing", () => {
    afterEach(() => usePreviewModeStore.setState({ isPreview: false }));

    it("turns off edits, undo and selecting, and keeps playback, navigation and files", () => {
        const ids: ActionId[] = [
            "moveSelectedMarchersUp",
            "performUndo",
            "selectAllMarchers",
            "toggleLoop",
            "focusTimeline",
            "playPause",
            "nextPage",
            "nextPlaybackSpeed",
            "launchSaveFileDialogue",
            "togglePreview",
        ];
        const handlers = ids.map(handle);
        usePreviewModeStore.setState({ isPreview: true });
        const enabled = Object.fromEntries(
            ids.map((id) => [id, isActionEnabled(id)]),
        );
        expect(enabled).toEqual({
            moveSelectedMarchersUp: false,
            performUndo: false,
            selectAllMarchers: false,
            toggleLoop: false,
            focusTimeline: false,
            playPause: true,
            nextPage: true,
            nextPlaybackSpeed: true,
            launchSaveFileDialogue: true,
            togglePreview: true,
        });
        expect(runAction("performUndo")).toBe(false);

        usePreviewModeStore.setState({ isPreview: false });
        for (const id of ids) expect(isActionEnabled(id), id).toBe(true);
        handlers.forEach((h) => h.off());
    });

    it("turns off every moving, aligning and shape action", () => {
        usePreviewModeStore.setState({ isPreview: true });
        const offCategories = new Set<ActionCategory>([
            "movement",
            "alignment",
            "batchEdit",
            "cursor",
            "shape",
        ]);
        for (const id of ACTION_IDS)
            if (offCategories.has(getActionDefinition(id).category))
                expect(isActionOffInWorkspace(id), id).toBe(true);
    });
});
