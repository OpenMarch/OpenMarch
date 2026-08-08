import { QueryClient } from "@tanstack/react-query";
import { marcherTimelineKeys } from "./useMarcherTimelines";
import { useFrameClockStore } from "@/services/clock/frame-clock";

export const invalidateAllMarchers = (qc: QueryClient) => {
    const promises = [
        qc.invalidateQueries({
            queryKey: marcherTimelineKeys.all(),
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
            queryKey: marcherTimelineKeys.byMarcherId(marcherId),
        });
    }
};
