import { useMemo, type ReactElement } from "react";
import { useTranslate } from "@tolgee/react";
import {
    pageHoldMarkHint,
    pageHoldMarkLabel,
    type PageHoldMark,
} from "@/timeline/pageHoldMarks";
import type { PageHoldMarks } from "@/timeline/usePageHoldMarks";
import { ShortcutTooltip } from "./ShortcutTooltip";

/** A page box's mark with its words: the tooltip's label and its hint line. */
export type LabeledHoldMark = {
    readonly mark: PageHoldMark;
    readonly label: string;
    readonly hint: string;
};

/** A page box's mark with its words, by page id. */
export type LabeledHoldMarks = ReadonlyMap<string | number, LabeledHoldMark>;

/** The key's shape */
const DIAMOND = "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)";

/**
 * Where the selected marchers hold, drawn inside a page box (docs/timeline/ui.md UI-18; Eos's
 * "moved" and "tracked"): a page they move on gets a small key at its flag, and a page they hold
 * on a thin muted bar along its bottom, level with the key, so a run of held pages reads as one
 * line drawn back to the page they last moved on. Mixed is the same bar, dashed. Shared by the
 * timeline's page boxes and page mode's page strip; the box itself carries the words
 * (`useLabeledHoldMarks`) as its tooltip (`HoldMarkTooltip`) and accessible description. Kept to
 * the bottom few pixels, clear of the label, the flag line and the playhead's handle, and it never
 * takes the pointer. A 3px bar in the subtitle color and a 10px-wide key (first-time users found them
 * too faint and small, defined-coordinates 09).
 */
export function PageHoldMarkView({
    hold,
    descriptionId,
}: {
    hold: LabeledHoldMark | undefined;
    /** The id of the words, for the box's `aria-describedby` */
    descriptionId: string;
}) {
    if (!hold) return null;
    const { mark, label, hint } = hold;
    return (
        <>
            <span id={descriptionId} className="sr-only">
                {label}. {hint}
            </span>
            <span
                aria-hidden="true"
                data-testid="page-hold-mark"
                data-hold-mark={mark.kind}
                className="pointer-events-none absolute inset-0"
            >
                {mark.kind === "moves" ? (
                    // A diamond wider than tall, so it stays under the box's label
                    <span
                        className="bg-text-subtitle absolute right-[2px] bottom-[1px] h-[7px] w-[10px]"
                        style={{ clipPath: DIAMOND }}
                    />
                ) : (
                    <span
                        className={
                            mark.kind === "holds"
                                ? "bg-text-subtitle absolute inset-x-0 bottom-[3px] h-[3px]"
                                : "absolute inset-x-0 bottom-[3px] h-[3px]"
                        }
                        style={
                            mark.kind === "mixed"
                                ? {
                                      backgroundImage:
                                          "repeating-linear-gradient(to right, var(--color-text-subtitle) 0 4px, transparent 4px 7px)",
                                  }
                                : undefined
                        }
                    />
                )}
            </span>
        </>
    );
}

/**
 * A page box's tooltip for its mark (`ShortcutTooltip`, above the box): the mark's words and what they
 * mean on the field. No tooltip without a mark (nothing selected). The box keeps its
 * `aria-describedby` for screen readers.
 */
export function HoldMarkTooltip({
    hold,
    children,
}: {
    hold: LabeledHoldMark | undefined;
    children: ReactElement;
}) {
    return (
        <ShortcutTooltip
            label={hold?.label}
            hint={hold?.hint}
            side="top"
            closeOnPress
        >
            {children}
        </ShortcutTooltip>
    );
}

/** Each mark with its words, for the page box's tooltip and accessible description. */
export function useLabeledHoldMarks(marks: PageHoldMarks): LabeledHoldMarks {
    const { t } = useTranslate();
    return useMemo(() => {
        const translate = (
            key: string,
            defaultValue: string,
            params?: Record<string, string>,
        ) => t(key, { defaultValue, ...params });
        return new Map<string | number, LabeledHoldMark>(
            [...marks].map(([pageId, mark]) => [
                pageId,
                {
                    mark,
                    label: pageHoldMarkLabel(mark, translate),
                    hint: pageHoldMarkHint(mark, translate),
                },
            ]),
        );
    }, [marks, t]);
}
