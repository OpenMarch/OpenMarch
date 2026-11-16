import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { runAction } from "@/shortcuts/registry";

/**
 * The Moves lane's heading (fork #992): its name and an eye button that hides the move tracks,
 * through the same `toggleMovesLane` action as the Lanes menu. The timeline draws it at the top
 * left of the tracks, over the first row, and it stays at the visible left edge as the timeline
 * scrolls. Hidden, Moves folds into `MovesHiddenStrip`; the strip or the Lanes menu brings it
 * back.
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

/**
 * Where the move tracks were while the Moves lane is hidden (owner, fork #992): a thin strip
 * labelled "Moves hidden". A click or tap shows Moves again, through `toggleMovesLane`. It looks
 * as thin as one track row, but a finger gets a 44 px target. Other lanes, hidden, leave nothing.
 */
export function MovesHiddenStrip() {
    const { t } = useTranslate();
    return (
        <button
            type="button"
            data-testid="moves-hidden-strip"
            aria-label={t("timeline.lanes.showMoves")}
            title={t("timeline.lanes.showMoves")}
            className="group touch:h-44 absolute inset-x-0 top-1/2 flex h-full -translate-y-1/2 items-center"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => runAction("toggleMovesLane")}
        >
            <span className="border-stroke bg-fg-2 group-hover:bg-accent/10 group-hover:border-accent rounded-4 absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 border border-dashed" />
            <span className="text-micro text-text-subtitle group-hover:text-accent sticky left-0 z-[1] flex items-center gap-4 px-6">
                <EyeIcon size={12} />
                {t("timeline.lanes.movesHidden")}
            </span>
        </button>
    );
}
