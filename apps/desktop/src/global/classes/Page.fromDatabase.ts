/**
 * Builds `Page` objects from the database's page rows. Kept apart from `Page.ts`, which imports
 * renderer-only modules, so the main process can load it (the page converter runs there when a
 * file is converted on open, P9.3). `Page.ts` re-exports it.
 */
import type Beat from "./Beat";
import type Measure from "./Measure";
import type Page from "./Page";
import type { DatabasePage } from "@/db-functions/page";
import { FIRST_PAGE_ID } from "@/db-functions/rowMappers";
import { generatePageNames } from "@openmarch/core";

// Page Generation
/** A type that stores a beat with the index that it occurs in a list with all beats */
type BeatWithIndex = Beat & { index: number };

export type FromDatabasePagesArgs = {
    databasePages: DatabasePage[];
    allMeasures: Measure[];
    allBeats: Beat[];
    lastPageCounts: number;
    pageNumberOffset?: number;
};

/**
 * Converts the pages from the database (which are stored as a linked list) to Page objects.
 *
 * @param databasePages The pages from the database
 * @returns A list of Page objects
 */
// eslint-disable-next-line max-lines-per-function
export function fromDatabasePages({
    databasePages,
    allMeasures,
    allBeats,
    lastPageCounts,
    pageNumberOffset = 0,
}: FromDatabasePagesArgs): Page[] {
    if (databasePages.length === 0) return [];
    const sortedBeats = allBeats.sort((a, b) => a.position - b.position);
    const beatMap = new Map<number, BeatWithIndex>(
        sortedBeats.map((beat, i) => [beat.id, { ...beat, index: i }]),
    );
    const sortedDbPages = databasePages.sort((a, b) => {
        const aBeat = beatMap.get(a.start_beat);
        const bBeat = beatMap.get(b.start_beat);
        if (!aBeat && !bBeat) return 0;
        if (!aBeat) return 1;
        if (!bBeat) return -1;
        return aBeat.position - bBeat.position;
    });
    const isSubsetArr = sortedDbPages.map((page) => page.is_subset);
    const pageNames = generatePageNames(isSubsetArr, pageNumberOffset);
    const sortedMeasures = allMeasures.sort((a, b) => a.number - b.number);

    let curTimestamp = 0;
    const createdPages = (
        sortedDbPages.map((dbPage, i) => {
            // Get the beats that belong to this page
            const startBeat = beatMap.get(dbPage.start_beat);

            if (!startBeat) return undefined;

            const isLastPage = i === sortedDbPages.length - 1;
            const nextPage = isLastPage ? null : sortedDbPages[i + 1];
            const nextPageBeat = nextPage
                ? beatMap.get(nextPage.start_beat)
                : null;
            if (!nextPageBeat && nextPage) return undefined;

            // If this is the first page, return that special case
            if (dbPage.id === FIRST_PAGE_ID)
                return {
                    id: dbPage.id,
                    name: pageNames[i],
                    counts: 0,
                    notes: dbPage.notes,
                    order: i,
                    isSubset: dbPage.is_subset,
                    duration: 0,
                    beats: [startBeat],
                    measures: null,
                    measureBeatToStartOn: null,
                    measureBeatToEndOn: null,
                    timestamp: curTimestamp,
                    previousPageId: null,
                    nextPageId: nextPage ? nextPage.id : null,
                };

            const lastBeatIndex = nextPage
                ? nextPageBeat!.index
                : startBeat.index + lastPageCounts > sortedBeats.length
                  ? sortedBeats.length
                  : startBeat.index + lastPageCounts;
            const beats: Beat[] =
                startBeat.index < lastBeatIndex
                    ? sortedBeats.slice(startBeat.index, lastBeatIndex)
                    : [sortedBeats[startBeat.index]];
            const lastBeat = beats[beats.length - 1];
            const beatIdSet = new Set(beats.map((beat) => beat.id));

            // Get the measures that belong to this page
            const measures = sortedMeasures.filter(
                (measure) =>
                    // Check if the start beat of the measure is on or after the start beat of the page
                    (measure.startBeat.position >= startBeat.position ||
                        // Check that the start beat is on or before the last beat of the page
                        measure.startBeat.position <= lastBeat.position) &&
                    // If both are true, ensure that the beat is actually in the measure
                    measure.beats.some((beat) => beatIdSet.has(beat.id)),
            );
            const duration = beats.reduce(
                (acc, beat) => acc + beat.duration,
                0,
            );
            const output = {
                id: dbPage.id,
                name: pageNames[i],
                counts: beats.length,
                notes: dbPage.notes || null,
                order: i,
                isSubset: dbPage.is_subset,
                duration: duration,
                beats,
                measures: measures.length > 0 ? measures : null,
                measureBeatToStartOn:
                    measures.length > 0
                        ? measures[0].beats.findIndex(
                              (beat) => beat.id === startBeat.id,
                          ) + 1
                        : null,
                measureBeatToEndOn:
                    measures.length > 0
                        ? measures[measures.length - 1].beats.findIndex(
                              (beat) => beat.id === lastBeat.id,
                          ) + 1
                        : null,
                timestamp: curTimestamp,
                previousPageId: i > 0 ? sortedDbPages[i - 1].id : null,
                nextPageId: nextPage ? nextPage.id : null,
            } satisfies Page;
            curTimestamp += duration;
            return output;
        }) as Page[]
    ).filter((p) => p != null);

    return createdPages;
}
