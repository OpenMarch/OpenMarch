import { useEffect, useMemo } from "react";
import type { FieldProperties } from "@openmarch/core";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { canShowPath } from "@/global/classes/canvasObjects/stepSizeWarning";
import type { MarcherVisualMap } from "@/hooks/queries";
import { useTimelineResolverStore } from "./timelineStore";
import {
    pathsIntoPage,
    type PathPage,
    type TimelinePath,
} from "./timelinePaths";

/** The page fields this hook reads. `Page` satisfies it. */
export interface PathRenderPage extends PathPage {
    readonly id: number;
    readonly previousPageId: number | null;
    readonly nextPageId: number | null;
}

const findPage = (
    pages: readonly PathRenderPage[],
    id: number | null,
): PathRenderPage | null => pages.find((p) => p.id === id) ?? null;

const NO_PATHS: ReadonlyMap<number, TimelinePath> = new Map();

/**
 * Draws the selected page's path visuals from the resolver in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.10): the move into the selected page and the move
 * out of it, as curves sampled between page end beats, with midsets and step-size warnings from
 * the same samples. Replaces the page-mode effect in `Canvas.tsx`, which draws straight lines
 * from `marcher_pages`.
 *
 * Cost: the samples are kept per resolver version and page pair, so toggles and visual changes
 * redraw without resampling; a side that can't show (its toggle off and no forced warning) isn't
 * sampled; nothing is sampled or drawn while playing, as with `useTimelineStaticRender`.
 *
 * Does nothing while `enabled` is false (the flag is off, or the resolver isn't ready yet, when
 * the page-mode paths stand in, as the marchers do). When it turns false, the curved paths are
 * removed so the page-mode effect's straight paths are the only ones left.
 */
// eslint-disable-next-line max-lines-per-function
export function useTimelinePathRender({
    canvas,
    enabled,
    isPlaying,
    selectedPage,
    pages,
    marcherIds,
    marcherVisuals,
    fieldProperties,
    previousPathsEnabled,
    nextPathsEnabled,
    stepSizeWarningsEnabled,
}: {
    canvas: OpenMarchCanvas | null;
    enabled: boolean;
    isPlaying: boolean;
    selectedPage: PathRenderPage | null;
    pages: readonly PathRenderPage[];
    marcherIds: readonly number[] | undefined;
    marcherVisuals: MarcherVisualMap | null | undefined;
    fieldProperties: FieldProperties | undefined;
    previousPathsEnabled: boolean;
    nextPathsEnabled: boolean;
    stepSizeWarningsEnabled: boolean;
}): void {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const active = enabled && !isPlaying && resolver !== null;

    const previousPage = selectedPage
        ? findPage(pages, selectedPage.previousPageId)
        : null;
    const nextPage = selectedPage
        ? findPage(pages, selectedPage.nextPageId)
        : null;
    const sampleInto = canShowPath({
        pathEnabled: previousPathsEnabled,
        allowForceShow: false,
        warningsEnabled: stepSizeWarningsEnabled,
    });
    const sampleOut = canShowPath({
        pathEnabled: nextPathsEnabled,
        allowForceShow: true,
        warningsEnabled: stepSizeWarningsEnabled,
    });

    const previousPaths = useMemo(
        () =>
            active && sampleInto && marcherIds
                ? pathsIntoPage(
                      resolver!,
                      marcherIds,
                      selectedPage,
                      previousPage,
                  )
                : NO_PATHS,
        // `version` changes whenever the resolver's answers may have
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            active,
            sampleInto,
            resolver,
            version,
            marcherIds,
            selectedPage,
            previousPage,
        ],
    );
    const nextPaths = useMemo(
        () =>
            active && sampleOut && marcherIds
                ? pathsIntoPage(resolver!, marcherIds, nextPage, selectedPage)
                : NO_PATHS,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            active,
            sampleOut,
            resolver,
            version,
            marcherIds,
            selectedPage,
            nextPage,
        ],
    );

    useEffect(() => {
        if (!canvas) return;
        if (!enabled) {
            canvas.removeTimelinePathways();
            return;
        }
        if (
            !active ||
            !selectedPage ||
            !marcherIds ||
            marcherVisuals == null ||
            !fieldProperties
        )
            return;

        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds,
            previousPaths,
            nextPaths,
            previousPathsEnabled,
            nextPathsEnabled,
            stepSizeWarningsEnabled,
            fieldProperties,
        });
        canvas.sendCanvasMarchersToFront();
        canvas.requestRenderAll();
    }, [
        canvas,
        enabled,
        active,
        selectedPage,
        marcherIds,
        marcherVisuals,
        fieldProperties,
        previousPaths,
        nextPaths,
        previousPathsEnabled,
        nextPathsEnabled,
        stepSizeWarningsEnabled,
    ]);
}
