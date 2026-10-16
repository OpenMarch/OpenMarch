import { useMemo } from "react";
import { useTranslate } from "@tolgee/react";
import {
    keptMarchersOnPage,
    keptMarkText,
    type KeepTranslate,
} from "./timelineKeepLater";
import { keepPagesOf, useKeptAssignmentsStore } from "./useKeepLaterPages";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import type { FlagPage } from "./timelinePlayhead";
import type { TimelineKeptMark } from "./timelineKeptMarks";

export type NamedPage = FlagPage & { readonly name: string };

/** How long the pointer rests on a mark before its tooltip shows, as the timeline's tooltips */
export const KEPT_MARK_TOOLTIP_DELAY = 500;

/** A kept mark's tooltip: its words, at the screen point the pointer rested on. */
export interface KeptMarkTooltip {
    readonly text: string;
    readonly clientX: number;
    readonly clientY: number;
}

/**
 * The marks for the marchers kept on the page `pageId` (`keptMarchersOnPage`), whatever is
 * selected, with their tooltips. Empty without a resolver or a page.
 */
export function useKeptMarks(
    pages: readonly NamedPage[],
    pageId: number | null | undefined,
    marcherIds: readonly number[] | undefined,
): TimelineKeptMark[] {
    const { t } = useTranslate();
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const kept = useKeptAssignmentsStore((s) => s.ids);
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || !marcherIds || pageId == null) return [];
        const keepPages = keepPagesOf(pages);
        const page = keepPages.find((p) => p.id === pageId);
        if (!page) return [];
        const translate: KeepTranslate = (key, defaultValue, params) =>
            t(key, { defaultValue, ...params });
        return keptMarchersOnPage({
            pages: keepPages,
            pageId,
            marcherIds,
            spansOf: (id) => resolverSpans(resolver, id),
            kept,
        }).map((k) => ({
            marcherId: k.marcherId,
            text: keptMarkText(page.name, k.from, translate),
        }));
    }, [resolver, version, kept, pages, pageId, marcherIds, t]);
}
