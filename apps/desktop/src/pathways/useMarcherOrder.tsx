/**
 * The line order's commands (pathways step 4g): Show order (Alt+O), Set order (Shift+O), Reverse
 * and Clear order, each a registered action, so the toolbar, the field's menu, the palette and the
 * keys run the same thing. While Set order is on, Enter keeps what's picked and Escape cancels.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import { rememberedOrderAt } from "@/db-functions/rememberedOrder";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { useUnlockedOnly } from "@/items/lockedItems";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { editingPositionAt } from "@/timeline/timelineIsolationPlan";
import {
    cancelOrderSweep,
    openOrderSweep,
    shownOrderOf,
    useMarcherOrderStore,
} from "./marcherOrderStore";
import {
    clearOrder,
    keepOrderSweep,
    reverseOrder,
} from "./marcherOrderCommands";
import type { XY } from "./orderSweep";
import {
    makeRoomForOrderSweep,
    orderSweepBlocked,
    undoInOrderSweep,
} from "./orderSweepRoom";
import { usePathPenStore } from "./pathPenStore";
import { useFollowTheLeader } from "./followTheLeader";

/** Where each of `ids` stands at `beat` as the field edits it, skipping any the resolver lacks */
function positionsAt(ids: readonly number[], beat: number): Map<number, XY> {
    const resolver = useTimelineResolverStore.getState().resolver;
    const at = new Map<number, XY>();
    if (!resolver) return at;
    for (const id of ids) {
        try {
            const [x, y] = editingPositionAt(resolver, id, beat);
            at.set(id, { x, y });
        } catch {
            // Not in the show at this beat
        }
    }
    return at;
}

/** Why the order commands can't run for `count` selected performers, or null when they can */
export function orderRefusal(count: number, playing: boolean): string | null {
    if (playing)
        return tolgee.t(
            "pathways.order.refusePlaying",
            "Stop playback to set the order",
        );
    if (count < 2)
        return tolgee.t(
            "pathways.order.refuseTwo",
            "Select the marchers of a line (two or more)",
        );
    return null;
}

/** The order's commands, mounted with the editor's other handlers */
export function useMarcherOrderActions(): void {
    const queryClient = useQueryClient();
    const selected = useSelectedMarchers()?.selectedMarchers;
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    // Marchers and props alike; a locked item has no place in an order
    const editable = useUnlockedOnly(selected);
    const ids = useMemo(
        () => editable.map((m) => m.id).sort((a, b) => a - b),
        [editable],
    );
    const key = ids.join(",");
    const beat = useTimelineSelectionStore(displayedBeat);
    const refusal = ready ? orderRefusal(ids.length, isPlaying) : "";
    const options = {
        enabled: refusal === null,
        disabledReason: refusal || undefined,
    };
    // A path being drawn would be thrown away: Set order waits for it (Shift+O still closes it)
    const sweeping = useMarcherOrderStore((s) => s.sweep !== null);
    const blocked = usePathPenStore((s) => orderSweepBlocked(s.session));
    const sweepRefusal = sweeping ? null : (refusal ?? blocked);
    const sweepOptions = {
        enabled: sweepRefusal === null,
        disabledReason: sweepRefusal || undefined,
    };

    /** Goes up whenever an open Set order would be out of date: an opening read then lands nowhere */
    const generation = useRef(0);
    // Set order is about one selection at one beat: another, or playing, leaves it
    useEffect(() => {
        generation.current++;
        cancelOrderSweep();
    }, [key, beat, isPlaying]);
    // ...and about the show as it was: an edit, undo or redo meanwhile leaves it too
    useEffect(
        () =>
            subscribeHistoryChanges(() => {
                generation.current++;
                cancelOrderSweep();
            }),
        [],
    );
    useEffect(() => () => void cancelOrderSweep(), []);
    // Follow-the-leader switched off (#1095) takes Set order away: an open one is cancelled
    const followTheLeader = useFollowTheLeader();
    useEffect(() => {
        if (!followTheLeader) cancelOrderSweep();
    }, [followTheLeader]);

    useActionHandler("toggleMarcherOrder", () => {
        const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
        const now = uiSettings.marcherOrder ?? "selected";
        setUiSettings({
            ...uiSettings,
            marcherOrder: now === "off" ? "selected" : "off",
        });
    });

    useActionHandler(
        "setMarcherOrder",
        () => {
            if (useMarcherOrderStore.getState().sweep) {
                cancelOrderSweep();
                return;
            }
            const opened = ++generation.current;
            void (async () => {
                const at = positionsAt(ids, beat);
                if (at.size < 2) return;
                // The order shown now, which the skipped keep
                const remembered = await rememberedOrderAt(db, ids, beat);
                // The selection, the beat or the show changed while it read: it's out of date
                if (opened !== generation.current) return;
                // A shape tool or the pen open meanwhile would hide it: they close first
                if (!makeRoomForOrderSweep()) return;
                openOrderSweep({
                    ids,
                    at,
                    beat,
                    before:
                        remembered && remembered.length === ids.length
                            ? remembered
                            : (shownOrderOf(null, ids, beat, at)?.order ??
                              null),
                });
            })();
        },
        sweepOptions,
    );

    useActionHandler(
        "reverseMarcherOrder",
        () => void reverseOrder(ids, beat, positionsAt(ids, beat), queryClient),
        options,
    );

    useActionHandler(
        "clearMarcherOrder",
        () => void clearOrder(ids, beat, queryClient),
        options,
    );
}

/**
 * The keys Set order takes while it's on, over everything else: Enter keeps what's picked (the
 * rest after, in the order they had), Escape cancels, and so do undo and redo, undo bringing back
 * a shape tool opening it discarded
 */
export function OrderSweepKeys(): null {
    const queryClient = useQueryClient();
    useActionHandler("cancelAlignmentUpdates", () => cancelOrderSweep(), {
        label: tolgee.t("pathways.order.cancel", "Cancel Set order"),
    });
    useActionHandler("applyShape", () => void keepOrderSweep(queryClient), {
        label: tolgee.t("pathways.order.done", "Keep this order"),
    });
    // Undo and redo cancel it rather than undo a show edit behind it (`undoInOrderSweep`)
    useActionHandler("performUndo", () => undoInOrderSweep());
    useActionHandler("performRedo", () => undoInOrderSweep(true));
    return null;
}
