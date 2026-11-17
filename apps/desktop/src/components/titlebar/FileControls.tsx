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
} from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { isWebBuild } from "@/utilities/webBuild";
import { useTranslate } from "@tolgee/react";
import { useEffect, useId, useState } from "react";
import { twMerge } from "tailwind-merge";
import {
    queueHistoryAction,
    type HistoryDirection,
} from "@/shortcuts/handlers/historyQueue";
import { LongPressBubble } from "@openmarch/ui";

/**
 * Undo or Redo with nothing to undo: greyed out, saying so on hover and when pressed, instead of
 * a button that does nothing (owner rule, 2026-11-16). Its greyed state comes from a query that
 * can lag an edit (#223), so a press always tries, through the same queue as the keys, and says
 * "nothing to undo" only when there really was nothing.
 */
function HistoryButton({
    can,
    direction,
    label,
    reason,
    children,
}: {
    can: boolean | undefined;
    direction: HistoryDirection;
    label: string;
    reason: string;
    children: React.ReactNode;
}) {
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const reasonId = useId();
    const off = can !== true;
    // Something to undo again: an open reason goes
    useEffect(() => {
        if (!off) setOpen(false);
    }, [off]);
    // Escape closes the reason and nothing else (not the app's Escape)
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open]);
    return (
        <>
            <button
                ref={setAnchor}
                aria-disabled={off ? true : undefined}
                aria-describedby={off ? reasonId : undefined}
                onClick={() =>
                    void queueHistoryAction(direction).then((did) => {
                        if (!did) setOpen(true);
                    })
                }
                onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setOpen(false);
                }}
                onBlur={() => setOpen(false)}
                aria-label={label}
                title={off ? reason : label}
                className={twMerge(
                    buttonClassName,
                    off &&
                        "hover:text-text focus-visible:text-text cursor-not-allowed opacity-50",
                )}
            >
                {children}
            </button>
            {off && (
                <span id={reasonId} className="sr-only">
                    {reason}
                </span>
            )}
            <LongPressBubble
                anchor={anchor}
                open={open}
                onClose={() => setOpen(false)}
            >
                {reason}
            </LongPressBubble>
        </>
    );
}

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
                    <HistoryButton
                        can={canUndo}
                        direction="undo"
                        label={t("actions.edit.undo")}
                        reason={t("actions.edit.noUndoAvailable")}
                    >
                        <ArrowUUpLeftIcon size={18} />
                    </HistoryButton>
                    <HistoryButton
                        can={canRedo}
                        direction="redo"
                        label={t("actions.edit.redo")}
                        reason={t("actions.edit.noRedoAvailable")}
                    >
                        <ArrowUUpRightIcon size={18} />
                    </HistoryButton>
                </>
            )}
        </div>
    );
}
