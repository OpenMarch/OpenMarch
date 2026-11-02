import {
    ArrowCounterClockwiseIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
} from "@phosphor-icons/react";
import { useIsPreviewMode } from "@/stores/PreviewModeStore";
import { useQuery } from "@tanstack/react-query";
import {
    canRedoQueryOptions,
    canUndoQueryOptions,
    usePerformHistoryAction,
} from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { isWebBuild } from "@/utilities/webBuild";
import { useTranslate } from "@tolgee/react";

/** Icon buttons; a finger-sized hit area in touch mode, unchanged with a mouse. */
const buttonClassName =
    "hover:text-accent focus-visible:text-accent flex items-center justify-center outline-hidden duration-150 ease-out disabled:opacity-50 touch:size-44 touch:[&>svg]:size-24";

export default function FileControls() {
    const { t } = useTranslate();
    // Preview edits nothing, so it has nothing to undo
    const preview = useIsPreviewMode();
    const databaseReady = useDatabaseReady();
    const { data: canUndo } = useQuery(canUndoQueryOptions(databaseReady));
    const { data: canRedo } = useQuery(canRedoQueryOptions(databaseReady));
    const { mutate: performHistoryAction } = usePerformHistoryAction();

    return (
        <div className="titlebar-button touch:gap-0 flex w-fit items-center gap-8">
            {!preview && (
                <>
                    {/* The browser has its own reload. */}
                    {!isWebBuild && (
                        <button
                            onClick={() => window.location.reload()}
                            aria-label={t("titlebar.reload")}
                            title={t("titlebar.reload")}
                            className={buttonClassName}
                        >
                            <ArrowCounterClockwiseIcon size={18} />
                        </button>
                    )}
                    <button
                        disabled={!canUndo}
                        onClick={() => performHistoryAction("undo")}
                        aria-label={t("actions.edit.undo")}
                        title={t("actions.edit.undo")}
                        className={buttonClassName}
                    >
                        <ArrowUUpLeftIcon size={18} />
                    </button>
                    <button
                        disabled={!canRedo}
                        onClick={() => performHistoryAction("redo")}
                        aria-label={t("actions.edit.redo")}
                        title={t("actions.edit.redo")}
                        className={buttonClassName}
                    >
                        <ArrowUUpRightIcon size={18} />
                    </button>
                </>
            )}
        </div>
    );
}
