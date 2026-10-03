import type { DbConnection } from "@/db-functions/types";
import type { TimelineFixture } from "./fixtureTypes";
import { GOLDEN_FIXTURES } from "./goldenFixtures";
import {
    loadTimelineFixture,
    type LoadedTimelineFixture,
} from "./loadTimelineFixture";
import { sc01, sc03, sc05, sc11 } from "./scenarioFixtures";
import {
    convertPagesToTimeline,
    type ConvertPagesOptions,
    type PageConversionResult,
} from "../convert/writePageConversion";
import { describePageConversionReport } from "../convert/planPageConversion";
import { exportTimelineKeyframesJson } from "../timelineExport";
import type { KeyframeExportOptions } from "../timelineKeyframes";

/**
 * Every fixture the dev loader offers (docs/timeline/phases/05-rendering.md P5.7): the golden
 * vectors G1 to G13 and the QA-SC data scenarios. `seed` only matters to generated ones.
 */
export const TIMELINE_FIXTURES: ReadonlyArray<{
    name: string;
    build: (seed: number) => TimelineFixture;
}> = [
    ...GOLDEN_FIXTURES,
    { name: "QA-SC-01", build: sc01 },
    { name: "QA-SC-03", build: sc03 },
    { name: "QA-SC-05", build: sc05 },
    { name: "QA-SC-11", build: (seed) => sc11(seed) },
];

/** Builds the fixture called `name` (case-insensitive), or throws listing the known names. */
export function buildTimelineFixture(name: string, seed = 1): TimelineFixture {
    const entry = TIMELINE_FIXTURES.find(
        (f) => f.name.toLowerCase() === name.toLowerCase(),
    );
    if (!entry)
        throw new Error(
            `Unknown timeline fixture '${name}'. Known: ${TIMELINE_FIXTURES.map((f) => f.name).join(", ")}`,
        );
    return entry.build(seed);
}

/** The dev console API, installed as `window.openmarchTimeline` while the timeline flag is on. */
export interface TimelineDevApi {
    /** The fixture names */
    fixtures: () => string[];
    /**
     * Loads a fixture into the open file as one undoable edit. Beats are shifted by `beatOffset`
     * (default 1, so the fixture starts with the show).
     */
    loadFixture: (
        name: string,
        options?: { seed?: number; beatOffset?: number },
    ) => Promise<LoadedTimelineFixture>;
    /**
     * Converts the file's page show into timeline rows as one undoable edit (P6.4), and logs the
     * per-page loss report. Refused (E-ARGS) when the file already has timeline rows, unless
     * `replace` is set.
     */
    convertPages: (
        options?: ConvertPagesOptions,
    ) => Promise<PageConversionResult>;
    /**
     * The spec §11 keyframe export of the open file, as JSON text (P7.9). Built from the resolver;
     * export data only, never read back as state.
     */
    exportKeyframes: (options?: KeyframeExportOptions) => Promise<string>;
}

export function createTimelineDevApi(
    db: DbConnection,
    afterLoad: () => void,
): TimelineDevApi {
    return {
        fixtures: () => TIMELINE_FIXTURES.map((f) => f.name),
        async loadFixture(name, { seed = 1, beatOffset = 1 } = {}) {
            const loaded = await loadTimelineFixture(
                db,
                buildTimelineFixture(name, seed),
                { beatOffset },
            );
            afterLoad();
            return loaded;
        },
        async convertPages(options) {
            const result = await convertPagesToTimeline(db, options);
            afterLoad();
            const lines = describePageConversionReport(result.report);
            // The dev console API reports to the console it runs in
            // eslint-disable-next-line no-console
            console.info(
                `Converted ${result.timelineIds.size} page(s), one timeline each` +
                    (lines.length
                        ? `. Not carried over:\n${lines.join("\n")}`
                        : "; nothing lost."),
            );
            return result;
        },
        exportKeyframes: (options) => exportTimelineKeyframesJson(db, options),
    };
}
