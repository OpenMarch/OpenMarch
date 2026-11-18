import type { ActionId } from "@/shortcuts/definitions";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import tolgee from "@/global/singletons/Tolgee";

/**
 * The Follow-the-leader switch (pathways M2, #1095): Settings › Field › Follow-the-leader
 * (preview), off by default, kept in the UI settings (`UiSettings.followTheLeader`).
 *
 * With it off nobody makes or edits a trail: Follow, Set order and the order lane, Ripple in,
 * corner counts and Reverse leader are gone from the toolbar, the field bar, the menus, the
 * palette, the shortcut lists and their keys. Plain paths (the Path pen, group paths, Adjust,
 * Detach and Rejoin) don't change. A file that already has a trail (from a lab or preview build)
 * still opens and plays it as before: its line shows its path quiet, with Remove trail, but the
 * trail can't be opened, drawn again or turned around. Turned on, everything is back at once.
 */

/** The actions that only make, edit or show trails and line orders: off with the switch */
export const FOLLOW_THE_LEADER_ACTIONS: ReadonlySet<ActionId> =
    new Set<ActionId>([
        "followTrail",
        "followPreview",
        "followEndsTrail",
        "followEndsKeep",
        "followEndsRipple",
        "reverseTrail",
        "toggleMarcherOrder",
        "setMarcherOrder",
        "reverseMarcherOrder",
        "clearMarcherOrder",
    ]);

/** Whether Follow-the-leader is on now, for code that reads it at event time */
export const isFollowTheLeaderOn = (): boolean =>
    useUiSettingsStore.getState().uiSettings.followTheLeader === true;

/** Whether Follow-the-leader is on, re-rendering when it's switched */
export const useFollowTheLeader = (): boolean =>
    useUiSettingsStore((s) => s.uiSettings.followTheLeader === true);

/** Turns Follow-the-leader on or off, and saves it, as the Settings switch does */
export function setFollowTheLeader(on: boolean): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    if ((uiSettings.followTheLeader === true) === on) return;
    setUiSettings({ ...uiSettings, followTheLeader: on });
}

/** Whether the switch turns `id` off: a Follow-the-leader action while it's off */
export const isActionOffByFollowTheLeader = (id: ActionId): boolean =>
    FOLLOW_THE_LEADER_ACTIONS.has(id) && !isFollowTheLeaderOn();

/** Calls `listener` whenever the switch changes, with the new state */
export function subscribeToFollowTheLeader(
    listener: (on: boolean) => void,
): () => void {
    return useUiSettingsStore.subscribe((state, previous) => {
        const on = state.uiSettings.followTheLeader === true;
        if (on !== (previous.uiSettings.followTheLeader === true)) listener(on);
    });
}

/** Why a trail can't be edited with the switch off: said on Edit path and when P is pressed */
export const trailOffReason = (): string =>
    tolgee.t(
        "pathways.refusals.followTheLeaderOff",
        "This line follows a trail. Turn on Follow-the-leader (preview) in Settings › Field to edit it",
    );
