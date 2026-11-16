import { useMemo } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { clearHoldLight, setHoldLight } from "@/timeline/holdLight";
import {
    unsetFollowingLabel,
    unsetHere,
    unsetHereAndFollowing,
    useUnsetFollowingPages,
    useUnsetTargets,
} from "@/timeline/timelineUnset";
import tolgee from "@/global/singletons/Tolgee";
import { useActionHandler } from "../useActionHandler";

/** Who lights the hold bars while the palette highlights the follow-back entry (`setHoldLight`) */
const PALETTE_LIGHT = "palette:timelineUnsetHereAndFollowing";

/** Set vs Following (#304, #305): **Unset here** and **Unset here and on Pages N–M** */
export function useUnsetActionHandlers() {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const marcherIds = useMemo(
        () => (selected ?? []).map((m) => m.id),
        [selected],
    );
    const targets = useUnsetTargets(marcherIds);
    const following = useUnsetFollowingPages(marcherIds);
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    // Why one is greyed out: playing, nobody selected, or nothing for it to do here
    const reason = (none: string) =>
        isPlaying
            ? tolgee.t("timeline.keyframes.paused")
            : marcherIds.length === 0
              ? tolgee.t("actions.shape.noMarchersSelected")
              : tolgee.t(none);

    // Only the selected marchers Set on the count shown; off when none is
    useActionHandler("timelineUnsetHere", () => void unsetHere(marcherIds), {
        enabled: !isPlaying && targets.length > 0,
        disabledReason: reason("timeline.keyframes.removeNone"),
    });
    // Only when some later pages follow their spot, and the label names them. Highlighted in the
    // palette, it lights the hold bars of exactly those pages (#477)
    useActionHandler(
        "timelineUnsetHereAndFollowing",
        () => void unsetHereAndFollowing(marcherIds),
        {
            enabled: !isPlaying && following.pages !== null,
            disabledReason: reason("timeline.keyframes.followNone"),
            label: following.pages
                ? unsetFollowingLabel(following.pages)
                : undefined,
            preview: (on) =>
                on
                    ? setHoldLight(PALETTE_LIGHT, following.light())
                    : clearHoldLight(PALETTE_LIGHT),
        },
    );
}
