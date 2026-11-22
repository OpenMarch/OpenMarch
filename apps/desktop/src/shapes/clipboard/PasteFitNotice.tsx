import { useTranslate } from "@tolgee/react";
import { WarningIcon } from "@phosphor-icons/react";
import { EDITOR_BAR } from "../editor/EditorBarParts";
import { usePasteNoticeStore } from "./pictureStore";

/**
 * Under an open paste's floating editor (owner 2026-11-22): how the paste doesn't fit, where the
 * eyes are when deciding to place it. Spots that stay empty, or marchers left out; nothing when
 * it fits. The clipboard chip says the same before the paste.
 */
export function PasteFitNotice() {
    const { t } = useTranslate();
    const fit = usePasteNoticeStore((s) => s.fit);
    if (!fit || (fit.fit !== "emptySpots" && fit.fit !== "leftOut"))
        return null;
    const text =
        fit.fit === "emptySpots"
            ? t("shapes.clipboard.chipEmptySpots", { count: fit.empty })
            : t("shapes.clipboard.chipLeftOut", { count: fit.left });
    return (
        <div
            // At the editor's end, under Place
            className={`${EDITOR_BAR} text-sub text-text-subtitle gap-4 self-end px-8`}
            data-testid="paste-fit-notice"
            data-fit={fit.fit}
        >
            <WarningIcon
                size={16}
                weight="fill"
                className="text-yellow shrink-0"
                aria-hidden
            />
            <span>{text}</span>
        </div>
    );
}
