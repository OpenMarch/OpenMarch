import { ANNOUNCE_HISTORY_ARG } from "@/shortcuts/handlers/useHistoryActionHandlers";
import { runAction } from "@/shortcuts/registry";

/**
 * Two- and three-finger taps on the field (tablet plan 1.6): the same Undo
 * and Redo actions the keyboard runs, in the same queue, with a short
 * "Undone"/"Redone" note when something changed.
 */
export function runFieldHistory(direction: "undo" | "redo"): void {
    runAction(direction === "undo" ? "performUndo" : "performRedo", {
        [ANNOUNCE_HISTORY_ARG]: true,
    });
}
