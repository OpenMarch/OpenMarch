/**
 * Whether to ask before the open show is closed or replaced (Close, Open,
 * New): only when its latest changes aren't safely kept.
 */
import type { FlushResult } from "../protocol";
import tolgee from "../../src/global/singletons/Tolgee";

export type LeaveDecision =
    /** Nothing would be lost. */
    | { ask: false }
    /** A memory-only tab with changes since the last download. */
    | { ask: true; reason: "memory" }
    /** The latest changes couldn't be stored in the browser. */
    | { ask: true; reason: "unsaved"; error: string };

export function leaveDecision({
    storedInBrowser,
    changedInPage,
    flush,
}: {
    storedInBrowser: boolean;
    changedInPage: boolean;
    /** The worker's answer to storing the changes now; null if it failed outright. */
    flush: FlushResult | null;
}): LeaveDecision {
    if (!storedInBrowser || flush?.memoryOnly)
        return changedInPage ? { ask: true, reason: "memory" } : { ask: false };
    if (flush?.safe) return { ask: false };
    return {
        ask: true,
        reason: "unsaved",
        error: flush?.error ?? tolgee.t("web.leave.noAnswer"),
    };
}

export function leaveQuestion(decision: LeaveDecision): string | null {
    if (!decision.ask) return null;
    if (decision.reason === "memory") return tolgee.t("web.leave.memory");
    return tolgee.t("web.leave.unsaved", { error: decision.error });
}
