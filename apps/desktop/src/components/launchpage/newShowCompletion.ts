import { db } from "@/global/database/db";
import { schema } from "@/global/database/db";
import { asc } from "drizzle-orm";
import {
    createBeatsInTransaction,
    realDatabaseBeatToDatabaseBeat,
} from "@/db-functions/beat";
import { createPagesInTransaction } from "@/db-functions/page";
import { transactionWithHistory } from "@/db-functions/history";
import { updateFieldProperties } from "@/global/classes/FieldProperties";
import {
    updateWorkspaceSettingsParsed,
    getWorkspaceSettingsParsed,
    getWorkspaceSettingsJSON,
} from "@/db-functions/workspaceSettings";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
    allMarchersQueryOptions,
} from "@/hooks/queries";
import type { NewShowFormState } from "./newShowTypes";
import type { QueryClient } from "@tanstack/react-query";
import { createAllUndoTriggers } from "@/db-functions/history";
import { databaseReadyQueryOptions } from "@/hooks/useDatabaseReady";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { workspaceSettingsKeys } from "@/hooks/queries/useWorkspaceSettings";
import { createMarchers } from "@/db-functions/marcher";
import AudioFile from "@/global/classes/AudioFile";
import { getMeasures } from "@/db-functions/measures";
import tolgee from "@/global/singletons/Tolgee";
import { conToastError } from "@/utilities/utils";

const PAGES_COUNT = 8;
const COUNTS_PER_PAGE = 16;
const TOTAL_COUNTS = PAGES_COUNT * COUNTS_PER_PAGE;
const DEFAULT_TEMPO = 120;

export const sanitizeFilename = (name: string): string =>
    name.trim().replace(/[<>:"/\\|?*]/g, "_");

export async function buildDefaultFilePath(
    projectName: string,
): Promise<string> {
    const defaultDir = await window.electron.getDefaultDocumentsPath();
    const sanitized = sanitizeFilename(projectName) || "Untitled";
    return `${defaultDir}/${sanitized}.dots`;
}

export function resolveNewShowFilePath(
    projectName: string,
    filePath: string,
): string {
    const trimmed = filePath.trim();
    if (!trimmed) {
        throw new Error("File path is required");
    }

    const normalizedPath = trimmed.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");
    const lastPart = pathParts[pathParts.length - 1];
    const sanitizedProjectName = sanitizeFilename(projectName) || "Untitled";

    if (!lastPart.endsWith(".dots")) {
        pathParts[pathParts.length - 1] = `${sanitizedProjectName}.dots`;
        return pathParts.join("/");
    }

    if (!lastPart.startsWith(sanitizedProjectName)) {
        pathParts[pathParts.length - 1] = `${sanitizedProjectName}.dots`;
        return pathParts.join("/");
    }

    return trimmed;
}

const isTriggerAlreadyExistsError = (error: unknown) => {
    const message = (error as { message?: string } | null | undefined)?.message;
    return (
        typeof message === "string" &&
        message.toLowerCase().includes("already exists")
    );
};

async function ensureHistoryTriggers(): Promise<void> {
    try {
        await createAllUndoTriggers(db);
    } catch (error) {
        if (!isTriggerAlreadyExistsError(error)) {
            throw error;
        }
    }
}

async function applyProjectSettings(form: NewShowFormState): Promise<void> {
    const currentSettings = await getWorkspaceSettingsParsed({ db });
    const tempo =
        form.music?.method === "tempo_only" && form.music.tempo
            ? form.music.tempo
            : form.defaultTempo;

    const updatedSettings = workspaceSettingsSchema.parse({
        ...currentSettings,
        projectName: form.projectName,
        designer: form.designer,
        client: form.client,
        defaultTempo: tempo,
        ensembleEnvironment: form.ensemble?.environment,
        ensembleType: form.ensemble?.ensemble_type,
    });
    await updateWorkspaceSettingsParsed({ db, settings: updatedSettings });
}

async function applyMusicSettings(
    music: NewShowFormState["music"],
): Promise<void> {
    const currentSettings = await getWorkspaceSettingsParsed({ db });
    const rawSettingsJson = await getWorkspaceSettingsJSON({ db });
    const rawSettings = JSON.parse(rawSettingsJson) ?? {};
    const hasDefaultTempoKey = Object.prototype.hasOwnProperty.call(
        rawSettings,
        "defaultTempo",
    );
    const needsTempoUpdate =
        !hasDefaultTempoKey || rawSettings.defaultTempo == null;

    if (music?.method === "tempo_only" && music.tempo) {
        await updateWorkspaceSettingsParsed({
            db,
            settings: workspaceSettingsSchema.parse({
                ...currentSettings,
                defaultTempo: music.tempo,
            }),
        });
    } else if (needsTempoUpdate) {
        await updateWorkspaceSettingsParsed({
            db,
            settings: workspaceSettingsSchema.parse({
                ...currentSettings,
                defaultTempo: DEFAULT_TEMPO,
            }),
        });
    }

    if (music?.method === "mp3") {
        const audioFiles = await AudioFile.getAudioFilesDetails();
        if (audioFiles.length === 0) {
            conToastError(tolgee.t("launchpage.newShow.errors.audioNotSaved"));
        }
    } else if (music?.method === "xml") {
        const measures = await getMeasures({ db });
        if (measures.length === 0) {
            conToastError(tolgee.t("launchpage.newShow.errors.xmlNotImported"));
        }
    }
}

async function applyPerformersSettings(
    performers: NewShowFormState["performers"],
    queryClient: QueryClient,
): Promise<void> {
    if (
        !performers ||
        performers.method === "skip" ||
        !performers.marchers?.length
    ) {
        return;
    }

    await createMarchers({
        db,
        newMarchers: performers.marchers,
    });

    await queryClient.invalidateQueries({
        queryKey: allMarchersQueryOptions().queryKey,
    });
}

async function createBeatsAndPages(queryClient: QueryClient): Promise<void> {
    const currentBeats = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );
    const workspaceSettings = await getWorkspaceSettingsParsed({ db });
    const tempo = workspaceSettings.defaultTempo;
    const beatDuration = 60 / tempo;
    const beatsNeeded = Math.max(0, TOTAL_COUNTS + 1 - currentBeats.length);

    const newBeats =
        beatsNeeded > 0
            ? Array.from({ length: beatsNeeded }, () => ({
                  duration: beatDuration,
                  include_in_measure: true,
              }))
            : [];

    const existingPages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const pageByStartBeat = new Map(
        existingPages.map((p) => [p.start_beat, p.id]),
    );

    await transactionWithHistory(db, "createBeatsAndPages", async (tx) => {
        if (newBeats.length > 0) {
            await createBeatsInTransaction({ tx, newBeats });
        }

        const updatedBeatsRaw = await tx.query.beats.findMany({
            orderBy: asc(schema.beats.position),
        });
        const updatedBeats = updatedBeatsRaw.map(
            realDatabaseBeatToDatabaseBeat,
        );
        const sortedBeats = updatedBeats.map((beat) => ({
            id: beat.id,
            position: beat.position,
        }));

        const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];

        for (let i = 1; i < PAGES_COUNT; i++) {
            const beatPosition = i * COUNTS_PER_PAGE;
            const beatObj = sortedBeats.find(
                (b) => b.position === beatPosition,
            );

            if (!beatObj) {
                throw new Error(
                    `Missing beat at position ${beatPosition} for page ${i}`,
                );
            }

            if (pageByStartBeat.has(beatObj.id)) {
                continue;
            }

            newPagesArgs.push({
                start_beat: beatObj.id,
                is_subset: false,
            });
        }

        if (newPagesArgs.length > 0) {
            await createPagesInTransaction({ tx, newPages: newPagesArgs });
        }
    });

    await queryClient.invalidateQueries({
        queryKey: allDatabaseBeatsQueryOptions().queryKey,
    });
    await queryClient.invalidateQueries({
        queryKey: allDatabasePagesQueryOptions().queryKey,
    });
}

/**
 * Applies wizard data to the open draft DB, then moves the file to the user's path.
 */
export async function completeNewShow(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const targetPath = resolveNewShowFilePath(form.projectName, form.filePath);

    const dbReady = await window.electron.databaseIsReady();
    if (!dbReady) {
        throw new Error(
            "Database is not ready. Complete the project step first.",
        );
    }

    await ensureHistoryTriggers();
    await applyProjectSettings(form);
    await applyMusicSettings(form.music);
    await updateFieldProperties(form.fieldTemplate);
    await createBeatsAndPages(queryClient);
    await applyPerformersSettings(form.performers, queryClient);

    const finalizeResult = await window.electron.finalizeNewShowDraft(
        targetPath,
        form.projectName,
    );
    if (finalizeResult !== 200) {
        throw new Error(`Failed to save show at ${targetPath}`);
    }

    await queryClient.invalidateQueries({
        queryKey: databaseReadyQueryOptions().queryKey,
    });
    await queryClient.invalidateQueries({
        queryKey: fieldPropertiesKeys.detail(),
    });
    await queryClient.invalidateQueries({
        queryKey: workspaceSettingsKeys.detail(),
    });
}
