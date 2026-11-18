import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useBoxSelection } from "../placed/boxSelection";
import {
    clearReleasedPreview,
    previewPlacedBox,
    useBoxSelectionStore,
} from "../placed/boxSelectionStore";
import {
    LiveBoxMode,
    liveBoxHolding,
    setActiveLiveBox,
} from "../placed/liveBoxMode";
import { closeHandleMenu } from "./handleMenu";
import {
    closeShapeTool,
    useShapeHidden,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { isAwayFrom } from "../tool/shapeMoment";
import { forgetDiscardedShape } from "../tool/shapeLeave";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { shapeToolMode } from "../tool/shapeToolMode";
import { resetShapePointer, watchShapeEditorFocus } from "./shapePointer";
import {
    objectsDrawn,
    ownLinesDrawn,
    usePathPenStore,
} from "@/pathways/pathPenStore";
import {
    drawingOf,
    objectDrawingOf,
    ownLineDrawingOf,
    pathPenMode,
} from "@/pathways/pathPenMode";
import {
    cancelOrderSweep,
    useMarcherOrderStore,
} from "@/pathways/marcherOrderStore";
import { OrderSweepMode } from "@/pathways/orderSweepMode";
import { keepOrderSweep } from "@/pathways/marcherOrderCommands";
import {
    setFieldObjects,
    setFieldUnderlay,
} from "@/field/editor/fieldUnderlayStore";

/**
 * Puts the shapes on the field's editor (#204): the open Shape tool takes every edit press
 * (`shapeToolMode`), and otherwise a selected placed box takes the presses on its handles and
 * inside it (`LiveBoxMode`). Also keeps placed boxes in the selection (`useBoxSelection`).
 *
 * The tool is about one moment and one group of marchers. Only Place (Enter) places it (#416):
 * moving around the timeline, playing and a new selection leave it open. While it waits
 * out of sight (`useShapeHidden`) the field doesn't draw it or give it presses, and an armed tool
 * with nothing drawn yet closes once the timeline moves off its moment.
 */
export function useShapeFieldModes(
    editor: FieldEditor,
    isPlaying: boolean,
): void {
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const hidden = useShapeHidden();
    // The path pen drawing, or a path open, takes the field's presses first (pathways step 1). A
    // path only shown (closed) takes a double-click or a right-click on it, under an open shape or
    // a selected placed box
    const pathOpen = usePathPenStore(
        (s) => s.session !== null && s.session.phase !== "closed",
    );
    // A closed path start flag positions hide (paths level off) isn't the field's mode; a selected
    // path object always is, and so are Paths All's paths, so a click selects one (step 3a)
    const pathShown = usePathPenStore(
        (s) =>
            (s.session?.phase === "closed" &&
                (!s.hidden || s.session.object)) ||
            s.objects.length > 0,
    );
    const box = useBoxSelectionStore((s) => s.selected);
    const queryClient = useQueryClient();
    useBoxSelection({ isPlaying });

    // One live mode per box, told when the box is saved or read again
    const boxId = box?.recipe.id ?? null;
    const live = useMemo(
        () =>
            box
                ? (liveBoxHolding(box) ??
                  new LiveBoxMode(box, queryClient, pathPenMode))
                : null,
        // A new mode only for another box
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [boxId, queryClient],
    );
    useEffect(() => {
        setActiveLiveBox(live);
        return () => setActiveLiveBox(null);
    }, [live]);
    useEffect(() => {
        if (box) live?.setBox(box);
        // The box read back replaces a released number drag's preview; a drag still held keeps
        // its own, though an earlier save was read back meanwhile (#515)
        clearReleasedPreview();
    }, [live, box]);
    // Another box (or none) drops any preview, held or not; so does the tool opening, which takes
    // the editor and with it a drag's release (review of #516)
    useEffect(() => () => previewPlacedBox(null), [live, toolOpen]);

    const order = useOrderSweepMode(isPlaying);
    // A tool opened by its key (O for Circle, P for the pen) while Set order is on closes Set
    // order, rather than opening hidden behind it
    useEffect(() => {
        if (toolOpen || pathOpen) cancelOrderSweep();
    }, [toolOpen, pathOpen]);

    useEffect(() => {
        // The pointer was over the last shape, if any; the next cursor check finds the new one
        resetShapePointer();
        // A handle's menu is for the shape it was opened on (#569)
        closeHandleMenu();
        editor.setMode(
            order
                ? order
                : pathOpen && !isPlaying
                  ? pathPenMode
                  : toolOpen
                    ? hidden
                        ? null
                        : shapeToolMode
                    : (live ?? (pathShown && !isPlaying ? pathPenMode : null)),
        );
    }, [editor, toolOpen, hidden, live, pathOpen, pathShown, isPlaying, order]);
    useEffect(() => () => editor.setMode(null), [editor]);
    // A selected box takes the presses, but its members' closed group path is still drawn, under
    // it: the group's line and faint lanes, as when the box isn't selected (owner on #683)
    const closedSession = usePathPenStore((s) =>
        s.session?.phase === "closed" && !s.hidden ? s.session : null,
    );
    const underBox =
        live !== null && !toolOpen && !pathOpen && !isPlaying
            ? closedSession
            : null;
    useEffect(() => {
        setFieldUnderlay(underBox ? drawingOf(underBox) : null);
    }, [underBox]);
    useEffect(() => () => setFieldUnderlay(null), []);
    usePathFieldObjects(toolOpen, isPlaying);
    // Keyboard focus in the floating editor shows the shape's controls (#430)
    useEffect(() => watchShapeEditorFocus(), []);

    useShapeWaits(isPlaying, toolOpen);
}

/**
 * The path drawings under the field mode's own: Paths All's group paths, each as its one line with
 * faint lanes (step 3a, AP-O7), and with several marchers on their own paths selected, each one's
 * line, faint (round 8)
 */
function usePathFieldObjects(toolOpen: boolean, isPlaying: boolean): void {
    const session = usePathPenStore((s) => s.session);
    const objects = usePathPenStore((s) => s.objects);
    const ownLines = usePathPenStore((s) => s.ownLines);
    const pathHidden = usePathPenStore((s) => s.hidden);
    useEffect(() => {
        setFieldObjects(
            isPlaying
                ? []
                : [
                      ...objectsDrawn(objects, session, toolOpen).flatMap(
                          (o) => objectDrawingOf(o) ?? [],
                      ),
                      ...ownLinesDrawn(
                          ownLines,
                          session,
                          pathHidden,
                          toolOpen,
                      ).map(ownLineDrawingOf),
                  ],
        );
    }, [objects, session, toolOpen, isPlaying, ownLines, pathHidden]);
    useEffect(() => () => setFieldObjects([]), []);
}

/**
 * Set order's mode while it's on and nothing plays (pathways step 4g): it takes every press, over
 * everything else
 */
function useOrderSweepMode(isPlaying: boolean): OrderSweepMode | null {
    const queryClient = useQueryClient();
    const sweeping = useMarcherOrderStore((s) => s.sweep !== null);
    const mode = useMemo(
        () => new OrderSweepMode(() => void keepOrderSweep(queryClient)),
        [queryClient],
    );
    return sweeping && !isPlaying ? mode : null;
}

function useShapeWaits(isPlaying: boolean, open: boolean): void {
    // A discarded shape comes back only on the undo right after Escape: any edit to the show
    // in between takes undo back
    useEffect(() => subscribeHistoryChanges(forgetDiscardedShape), []);

    useEffect(() => {
        if (isPlaying) forgetDiscardedShape();
    }, [isPlaying]);

    const selected = useSelectedMarchers()?.selectedMarchers;
    useEffect(() => {
        if (!selected) return;
        const ids = new Set(selected.map((m) => m.id));
        const { discarded } = useShapeToolStore.getState();
        const same =
            !!discarded &&
            ids.size === discarded.tool.marchers.length &&
            discarded.tool.marchers.every((m) => ids.has(m.id));
        if (discarded && !same) forgetDiscardedShape();
    }, [selected]);

    const discarded = useShapeToolStore((s) => s.discarded !== null);
    // Only while a shape is open or waits on undo: moving the playhead changes the window, and the
    // field calls this, so it would re-render for nothing (#455)
    const watching = open || discarded;
    const windowKey = useTimelineSelectionStore((s) => {
        if (!watching) return "";
        const sel = s.selection;
        const iso = s.isolation;
        return [
            sel.kind,
            sel.kind === "range" ? `${sel.start}-${sel.end}` : "",
            iso ? `${iso.timelineId}:${iso.start}-${iso.end}` : "",
        ].join("|");
    });
    useEffect(() => {
        if (!open) return;
        const { tool, moment } = useShapeToolStore.getState();
        // Nothing drawn yet: the marchers it armed on were where they stood at that moment
        if (tool?.params === null && isAwayFrom(moment)) closeShapeTool();
    }, [windowKey, open]);
    // Undo after Escape opens the shape at the moment it was discarded, so a new moment ends it
    const discardedAt = useRef(windowKey);
    useEffect(() => {
        if (discarded) discardedAt.current = windowKey;
        // Only the discarding: a later change of window is handled below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discarded]);
    useEffect(() => {
        if (discarded && windowKey !== discardedAt.current)
            forgetDiscardedShape();
    }, [windowKey, discarded]);
}
