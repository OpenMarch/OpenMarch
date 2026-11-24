/** What the main process answers for one drill chart PDF */
export type DrillChartPdfResult = { success: boolean; error?: string };

/** Electron's prefix on errors thrown by an IPC handler */
const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+': (Error: )?/;

/** The reason in a thrown error, without Electron's IPC prefix */
const pdfFailureReason = (error: unknown): string | undefined => {
    if (error instanceof Error)
        return error.message.replace(IPC_ERROR_PREFIX, "") || undefined;
    if (typeof error === "string") return error || undefined;
    return undefined;
};

/**
 * Makes the drill chart PDFs: one combined chart, or one per marcher when `individualCharts`
 * is on. Returns how many PDFs were made.
 *
 * Throws, with the reason as the message, so the caller shows the export as failed, when:
 * - the combined chart fails;
 * - a save throws. Saving errors (no space, no permission, file open elsewhere) reach the
 *   renderer as a rejected IPC call and would fail every marcher after it the same way, so
 *   the export stops at the first one rather than reporting each marcher;
 * - individual charts are on and none was made.
 *
 * Otherwise, with individual charts, each skipped marcher or `{ success: false }` answer is
 * reported through `onFailed` and the rest still get their PDFs.
 */
export async function makeDrillChartFiles({
    count,
    individualCharts,
    skipReason,
    makePdf,
    onFailed,
    onAttempted,
    isCancelled,
    cancelledMessage,
    noneMadeMessage,
    unknownErrorMessage,
}: {
    /** How many PDFs to make; only the first is made when `individualCharts` is off */
    count: number;
    individualCharts: boolean;
    /** Why marcher `index` gets no PDF without trying, or undefined to make it */
    skipReason: (index: number) => string | undefined;
    makePdf: (index: number) => Promise<DrillChartPdfResult>;
    /** An individual chart that was skipped or failed */
    onFailed: (index: number, reason: string) => void;
    /** Called after each individual chart is tried, made or not, for progress */
    onAttempted: (index: number) => void;
    isCancelled: () => boolean;
    cancelledMessage: string;
    /** The reason given when individual charts are on and no PDF was made */
    noneMadeMessage: string;
    unknownErrorMessage: string;
}): Promise<number> {
    if (!individualCharts) {
        let reason: string | undefined;
        try {
            const result = await makePdf(0);
            if (result.success) return 1;
            reason = result.error;
        } catch (error) {
            reason = pdfFailureReason(error);
        }
        throw new Error(reason || unknownErrorMessage);
    }

    let made = 0;
    for (let index = 0; index < count; index++) {
        const skipped = skipReason(index);
        if (skipped !== undefined) {
            onFailed(index, skipped);
            continue;
        }
        let result: DrillChartPdfResult;
        try {
            result = await makePdf(index);
        } catch (error) {
            throw new Error(pdfFailureReason(error) || unknownErrorMessage);
        }
        if (result.success) made += 1;
        onAttempted(index);
        if (!result.success)
            onFailed(index, result.error || unknownErrorMessage);
        if (isCancelled()) throw new Error(cancelledMessage);
    }
    if (made === 0) throw new Error(noneMadeMessage);
    return made;
}
