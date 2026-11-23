/**
 * How the app runs and saves model imports (fork #999): each run in a fresh import worker (#998),
 * and Add writes the show's asset store in a short transaction of its own, then refreshes the
 * show's asset list so the model shows under Imported.
 */
import type { QueryClient } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { showAssetKeys } from "@/hooks/queries/useShowAssets";
import { createModelImportWorker } from "../createModelImportWorker";
import { runModelImport } from "../runModelImport";
import { saveImportedModel } from "../saveImportedModel";
import type { ModelImportDeps } from "./modelImportSession";

export const appModelImportDeps = (
    queryClient: QueryClient,
): ModelImportDeps => ({
    run: (files, choices, signal) =>
        runModelImport(files, choices, {
            createWorker: createModelImportWorker,
            signal,
        }),
    async save(model) {
        const { modelValue } = await saveImportedModel({ db, model });
        await queryClient.invalidateQueries({ queryKey: showAssetKeys.all() });
        return { modelValue };
    },
});
