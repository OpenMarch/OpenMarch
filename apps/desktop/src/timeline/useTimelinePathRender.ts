import { useEffect, useRef } from "react";
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

type Paths = ReadonlyMap<number, TimelinePath>;

/**
 * `compute()` kept until one of `deps` changes, like `useMemo`, except that while `active` is
 * false it neither computes nor forgets: it returns the last value. Playing turns `active` off,
 * so pressing Play and then Stop on the same page reuses the samples instead of resampling every
 * marcher's path twice.
 */
function useSamplesWhileActive(
    active: boolean,
    compute: () => Paths,
    deps: readonly unknown[],
): Paths {
    const cache = useRef<{ deps: readonly unknown[]; paths: Paths } | null>(
        null,
    );
    const cached = cache.current;
    if (!active) return cached?.paths ?? NO_PATHS;
    if (
        cached &&
        cached.deps.length === deps.length &&
        cached.deps.every((d, i) => Object.is(d, deps[i]))
    )
        return cached.paths;
    const paths = compute();
    cache.current = { deps, paths };
    return paths;
}

/**
 * Draws the selected page's path visuals from the resolver in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.10): the move into the selected page and the move
 * out of it, as curves sampled between page end beats, with midsets and step-size warnings from
 * the same samples. Replaces the page-mode effect in `Canvas.tsx`, which draws straight lines
 * from `marcher_pages`.
 *
 * Cost: the samples are kept per resolver version and page pair, so toggles and visual changes
 * redraw without resampling, and so do Play and Stop; a side that can't show (its toggle off and
 * no forced warning) isn't sampled; nothing is sampled or drawn while playing, as with
 * `useTimelineStaticRender`, and stopping on the page that was drawn doesn't draw it again.
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

    const previousPaths = useSamplesWhileActive(
        active,
        () =>
            sampleInto && marcherIds
                ? pathsIntoPage(
                      resolver!,
                      marcherIds,
                      selectedPage,
                      previousPage,
                  )
                : NO_PATHS,
        // `version` changes whenever the resolver's answers may have
        [sampleInto, resolver, version, marcherIds, selectedPage, previousPage],
    );
    const nextPaths = useSamplesWhileActive(
        active,
        () =>
            sampleOut && marcherIds
                ? pathsIntoPage(resolver!, marcherIds, nextPage, selectedPage)
                : NO_PATHS,
        [sampleOut, resolver, version, marcherIds, selectedPage, nextPage],
    );

    /**
     * What the last draw drew; the paths stay on the canvas while playing, so a draw with the same
     * inputs after playback stops would only redo the same work.
     */
    const lastDraw = useRef<readonly unknown[] | null>(null);
    useEffect(() => {
        if (!canvas) return;
        if (!enabled) {
            canvas.removeTimelinePathways();
            lastDraw.current = null;
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

        const draw = [
            canvas,
            marcherIds,
            marcherVisuals,
            fieldProperties,
            previousPaths,
            nextPaths,
            previousPathsEnabled,
            nextPathsEnabled,
            stepSizeWarningsEnabled,
        ];
        const last = lastDraw.current;
        if (last && last.every((d, i) => Object.is(d, draw[i]))) return;
        lastDraw.current = draw;

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
