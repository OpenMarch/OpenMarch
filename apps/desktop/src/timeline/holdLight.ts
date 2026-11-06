import { create } from "zustand";
import type { HoldLight } from "./timelineHoldBars";

/**
 * What lights the timeline's hold bars besides a drag (fork #477): while **Remove keyframe, Pages
 * N–M move back too** is hovered or focused (the keyframe diamond's menu, the command palette),
 * the bars of exactly the pages that would follow back. Set on enter, cleared on leave; `owner`
 * keeps one menu's leave from clearing what another has lit since.
 */
export const useHoldLightStore = create<{
    readonly light: HoldLight | null;
    readonly owner: string | null;
}>(() => ({ light: null, owner: null }));

/** Lights `light` for `owner` (null lights nothing). */
export function setHoldLight(owner: string, light: HoldLight | null): void {
    useHoldLightStore.setState({ light, owner: light ? owner : null });
}

/** Clears what `owner` lit, if it's still the one lit. */
export function clearHoldLight(owner: string): void {
    if (useHoldLightStore.getState().owner === owner)
        useHoldLightStore.setState({ light: null, owner: null });
}
