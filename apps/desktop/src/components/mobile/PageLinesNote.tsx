import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import { useTimingObjects } from "@/hooks";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { hasMotionBetweenPages } from "./utilities/pageLines";

/**
 * Whether the open show has motion the phone app can't show (`hasMotionBetweenPages`), checked
 * for the performers the export sends. False until the resolver and rows are loaded.
 */
export function useHasMotionBetweenPages(): boolean {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const { pages } = useTimingObjects();
    const { data: performers } = useQuery(allMarchersQueryOptions());
    return useMemo(() => {
        void version; // a new version means new answers
        if (!resolver || !performers) return false;
        return hasMotionBetweenPages({
            resolver,
            pages,
            marcherIds: new Set(performers.map((m) => m.id)),
        });
    }, [resolver, version, pages, performers]);
}

/**
 * One quiet line in the export panel: the phone shows each page's positions, so moves between
 * pages appear as straight lines. Shown only when the show moves in a way those lines can't.
 */
export default function PageLinesNote() {
    if (!useHasMotionBetweenPages()) return null;
    return (
        <p
            className="text-sub text-text-subtitle"
            data-testid="page-lines-note"
        >
            <T keyName="mobileExport.pageLines.note" />
        </p>
    );
}
