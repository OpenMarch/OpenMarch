import {
    ArrowCounterClockwiseIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
} from "@phosphor-icons/react";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useQuery } from "@tanstack/react-query";
import {
    canRedoQueryOptions,
    canUndoQueryOptions,
    usePerformHistoryAction,
} from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

export default function FileControls() {
    const { isFullscreen } = useFullscreenStore();
    const databaseReady = useDatabaseReady();
    const { data: canUndo } = useQuery(canUndoQueryOptions(databaseReady));
    const { data: canRedo } = useQuery(canRedoQueryOptions(databaseReady));
    const { mutate: performHistoryAction } = usePerformHistoryAction();

    return (
        <div className="titlebar-button flex w-fit gap-8">
            {!isFullscreen && (
                <>
                    <button
                        onClick={() => window.location.reload()}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowCounterClockwiseIcon size={18} />
                    </button>
                    <button
                        disabled={!canUndo}
                        onClick={() => performHistoryAction("undo")}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpLeftIcon size={18} />
                    </button>
                    <button
                        disabled={!canRedo}
                        onClick={() => performHistoryAction("redo")}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpRightIcon size={18} />
                    </button>
                </>
            )}
        </div>
    );
}
