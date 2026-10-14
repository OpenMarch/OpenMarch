import { useMemo } from "react";
import type { FieldProperties } from "@openmarch/core";
import type { MinMaxStepSizes, StepSize } from "@/global/classes/StepSize";
import { useTimelineResolverStore } from "./timelineStore";
import {
    timelineMinMaxStepSizes,
    timelineStepSize,
    type PathPage,
} from "./timelinePaths";

export interface TimelineStepSizes {
    /**
     * Whether the resolver is ready, the same condition under which the canvas draws from it.
     * While false, there are no step sizes.
     */
    active: boolean;
    stepSize: StepSize | undefined;
    minMax: MinMaxStepSizes | undefined;
}

const INACTIVE: TimelineStepSizes = {
    active: false,
    stepSize: undefined,
    minMax: undefined,
};

/**
 * The inspector's step sizes (docs/timeline/phases/07-page-parity.md P7.10),
 * from the resolver between the previous page's end beat and the selected page's: one marcher's
 * step size when one is selected, the smallest and largest when several are. Both are undefined
 * on the first page.
 */
export function useTimelineStepSizes({
    marcherIds,
    page,
    previousPage,
    fieldProperties,
}: {
    marcherIds: readonly number[];
    page: PathPage | null | undefined;
    previousPage: PathPage | null | undefined;
    fieldProperties: FieldProperties | undefined;
}): TimelineStepSizes {
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);

    return useMemo(() => {
        if (!ready || !resolver) return INACTIVE;
        const none = { active: true, stepSize: undefined, minMax: undefined };
        if (!page || !fieldProperties) return none;
        if (marcherIds.length === 1)
            return {
                ...none,
                stepSize: timelineStepSize({
                    resolver,
                    marcherId: marcherIds[0]!,
                    page,
                    previousPage,
                    fieldProperties,
                }),
            };
        if (marcherIds.length > 1 && previousPage)
            return {
                ...none,
                minMax: timelineMinMaxStepSizes({
                    resolver,
                    marcherIds,
                    page,
                    previousPage,
                    fieldProperties,
                }),
            };
        return none;
        // `version` changes whenever the resolver's answers may have
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        ready,
        resolver,
        version,
        marcherIds,
        page,
        previousPage,
        fieldProperties,
    ]);
}
