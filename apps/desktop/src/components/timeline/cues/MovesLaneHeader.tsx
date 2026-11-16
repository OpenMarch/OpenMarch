import { EyeSlashIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { runAction } from "@/shortcuts/registry";

/**
 * The Moves lane's heading (fork #992): its name and an eye button that hides the move tracks,
 * through the same `toggleMovesLane` action as the Lanes menu. The timeline draws it at the top
 * left of the tracks, over the first row, and it stays at the visible left edge as the timeline
 * scrolls. Ticking Moves in the Lanes menu brings the tracks back.
 */
export function MovesLaneHeader() {
    const { t } = useTranslate();
    return (
        <div
            data-testid="moves-lane-header"
            className="bg-bg-1/80 text-micro text-text-subtitle flex w-fit items-center gap-4 rounded-full px-6 backdrop-blur-sm"
        >
            <span className="text-text font-medium">
                {t("timeline.lanes.moves")}
            </span>
            <button
                type="button"
                data-testid="moves-lane-hide"
                aria-label={t("cues.lane.hide")}
                title={t("cues.lane.hide")}
                className="hover:text-text touch:size-44 flex size-14 items-center justify-center rounded-full"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => runAction("toggleMovesLane")}
            >
                <EyeSlashIcon size={12} />
            </button>
        </div>
    );
}
