// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import {
    isVisualsView,
    useWorkspaceViewStore,
} from "@/stores/WorkspaceViewStore";
import { isActionEnabled, registerActionHandler, runAction } from "../registry";
import {
    isActionOffInWorkspace,
    isDrillEditingAction,
} from "../workspaceActions";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import {
    ACTION_IDS,
    getActionDefinition,
    type ActionCategory,
    type ActionId,
} from "../definitions";

afterEach(() => useWorkspaceViewStore.setState({ view: "editor" }));

const handle = (id: ActionId) => {
    const run = vi.fn();
    const off = registerActionHandler(id, { run, isEnabled: () => true });
    return { run, off };
};

describe("drill edits in Visuals mode (performer-behavior.md 7.1)", () => {
    // Over the whole registry, not a list of ids, so actions added or removed later are held to
    // the same rule
    it("are the actions whose definitions say they edit the drill", () => {
        for (const id of ACTION_IDS)
            expect(isDrillEditingAction(id), id).toBe(
                getActionDefinition(id).editsDrill,
            );
    });

    it("include every moving, aligning, batch, cursor and shape action", () => {
        const drillCategories = new Set<ActionCategory>([
            "movement",
            "alignment",
            "batchEdit",
            "cursor",
            "shape",
        ]);
        const inDrillCategories = ACTION_IDS.filter((id) =>
            drillCategories.has(getActionDefinition(id).category),
        );
        expect(inDrillCategories.length).toBeGreaterThan(0);
        for (const id of inDrillCategories)
            expect(isDrillEditingAction(id), id).toBe(true);
    });

    it("leave out files, undo, playback, navigation, selecting and the workspace switch", () => {
        const kept = new Set<ActionCategory>([
            "file",
            "edit",
            "playback",
            "navigation",
            "select",
        ]);
        for (const id of ACTION_IDS)
            if (kept.has(getActionDefinition(id).category))
                expect(isDrillEditingAction(id), id).toBe(false);
        expect(isDrillEditingAction("toggleWorkspace")).toBe(false);
        // Unset here changes the drill, filed under the timeline
        expect(isDrillEditingAction("timelineUnsetHere")).toBe(true);
    });

    it("don't run in Visuals mode, and run again in the Editor", () => {
        const nudge = handle("moveSelectedMarchersUp");
        const undo = handle("performUndo");
        useWorkspaceViewStore.setState({ view: "visuals" });
        expect(isActionEnabled("moveSelectedMarchersUp")).toBe(false);
        expect(runAction("moveSelectedMarchersUp")).toBe(false);
        expect(nudge.run).not.toHaveBeenCalled();
        // undo, selecting and playback stay
        expect(runAction("performUndo")).toBe(true);
        expect(undo.run).toHaveBeenCalledOnce();

        useWorkspaceViewStore.setState({ view: "editor" });
        expect(runAction("moveSelectedMarchersUp")).toBe(true);
        expect(nudge.run).toHaveBeenCalledOnce();
        nudge.off();
        undo.off();
    });

    it("run in Basic, which has no Visuals mode", () => {
        const nudge = handle("moveSelectedMarchersUp");
        const mode = useEditorModeStore.getState().mode;
        useEditorModeStore.setState({ mode: "basic" });
        useWorkspaceViewStore.setState({ view: "visuals" });
        expect(runAction("moveSelectedMarchersUp")).toBe(true);
        useEditorModeStore.setState({ mode });
        nudge.off();
    });
});

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

    it("shows over Visuals, which comes back when Preview ends", () => {
        useWorkspaceViewStore.setState({ view: "visuals" });
        expect(isVisualsView()).toBe(true);
        usePreviewModeStore.setState({ isPreview: true });
        expect(isVisualsView()).toBe(false);
        usePreviewModeStore.setState({ isPreview: false });
        expect(isVisualsView()).toBe(true);
    });

    it("keeps no drill edit", () => {
        usePreviewModeStore.setState({ isPreview: true });
        for (const id of ACTION_IDS)
            if (isDrillEditingAction(id))
                expect(isActionOffInWorkspace(id), id).toBe(true);
    });
});
