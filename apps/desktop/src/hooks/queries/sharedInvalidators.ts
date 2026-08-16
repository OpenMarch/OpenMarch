import { QueryClient } from "@tanstack/react-query";
import { useFrameClockStore } from "@/services/clock/frame-clock";
import { marcherPageKeys } from "./useMarcherPages";
import { marcherAppearanceKeys } from "./useMarcherAppearance";

export const invalidateAllMarchers = (qc: QueryClient) => {
    const promises = [
        qc.invalidateQueries({
            queryKey: marcherPageKeys.all(),
        }),
    ];

    // Wait for all promises to resolve, then increment the clock version
    // This is to trigger a re-render for all subscribers of the frame clock
    void Promise.all(promises).then(() => {
        useFrameClockStore.setState(({ _version }) => ({
            _version: _version + 1,
        }));
    });
};

export const invalidateByMarchers = (
    qc: QueryClient,
    marcherIds: Set<number>,
) => {
    for (const marcherId of marcherIds) {
        void qc.invalidateQueries({
            queryKey: marcherPageKeys.byMarcher(marcherId),
        });
    }
};

/**
 * Invalidates the per-marcher appearance timeline cache for only the given marchers.
 *
 * Use this whenever something that feeds a specific marcher's appearance changes
 * (e.g. that marcher's section, or a tag it has) instead of blowing away every
 * marcher's cached appearance.
 */
export const invalidateAppearanceForMarchers = (
    qc: QueryClient,
    marcherIds: Set<number>,
) => {
    for (const marcherId of marcherIds) {
        void qc.invalidateQueries({
            queryKey: marcherAppearanceKeys.byMarcherId(marcherId),
        });
    }
};

/**
 * Invalidates every marcher's cached appearance timeline.
 *
 * Reserved for genuinely show-wide changes (field theme, page/beat timing, or tag
 * mutations where the affected marchers can't be cheaply determined) — prefer
 * `invalidateAppearanceForMarchers` whenever the affected marcher ids are known.
 */
export const invalidateAllAppearances = (qc: QueryClient) => {
    void qc.invalidateQueries({
        queryKey: marcherAppearanceKeys.all(),
    });
};
