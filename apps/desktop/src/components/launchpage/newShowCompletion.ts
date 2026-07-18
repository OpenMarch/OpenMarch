import { db } from "@/global/database/db";
import { schema } from "@/global/database/db";
import { asc } from "drizzle-orm";
import {
    createBeatsInTransaction,
    deleteBeatsInTransaction,
    FIRST_BEAT_ID,
    realDatabaseBeatToDatabaseBeat,
} from "@/db-functions/beat";
import {
    createPagesInTransaction,
    deletePagesInTransaction,
    ensureSecondBeatHasPage,
    FIRST_PAGE_ID,
} from "@/db-functions/page";
import { transactionWithHistory } from "@/db-functions/history";
import {
    updateFieldProperties,
    updateFieldPropertiesImage,
} from "@/global/classes/FieldProperties";
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
import type { NewShowFormState, NewShowTempoData } from "./newShowTypes";
import {
    isTempoOnlyTimeSignature,
    TEMPO_ONLY_LAST_PAGE_MEASURES,
    TEMPO_ONLY_MEASURE_COUNT,
    TEMPO_ONLY_PAGE_START_MEASURE_NUMBERS,
} from "./newShowTypes";
import type { QueryClient } from "@tanstack/react-query";
import { createAllUndoTriggers } from "@/db-functions/history";
import { databaseReadyQueryOptions } from "@/hooks/useDatabaseReady";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { workspaceSettingsKeys } from "@/hooks/queries/useWorkspaceSettings";
import { marcherPageKeys } from "@/hooks/queries/useMarcherPages";
import { sectionAppearanceKeys } from "@/hooks/queries/useSectionAppearances";
import { tagKeys } from "@/hooks/queries/tags/queries";
import {
    createMarchers,
    deleteMarchers,
    getMarchers,
} from "@/db-functions/marcher";
import { updateMarcherPagesInTransaction } from "@/db-functions/marcherPage";
import { createSectionAppearances } from "@/db-functions/sectionAppearance";
import { createMarcherTags, createTags } from "@/db-functions/tag";
import AudioFile from "@/global/classes/AudioFile";
import {
    deleteMeasuresInTransaction,
    getMeasures,
    realDatabaseMeasureToDatabaseMeasure,
} from "@/db-functions/measures";
import tolgee from "@/global/singletons/Tolgee";
import TimeSignature from "@/global/classes/TimeSignature";
import { _createFromTempoGroupInTransaction } from "@/components/music/TempoGroup/TempoGroup";
import { updateUtilityInTransaction } from "@/db-functions/utility";
import { measureKeys } from "@/hooks/queries/useMeasures";
import type { DbTransaction } from "@/db-functions/types";
import type { DatabaseMeasure } from "@/db-functions/measures";

const DEFAULT_NEW_PAGE_COUNTS = 16;
const TEMPO_ONLY_DEFAULT_NEW_PAGE_MEASURES = 4;
const DEFAULT_LAST_PAGE_COUNTS = 8;
const TEMPO_ONLY_EXPECTED_PAGE_COUNT =
    1 + TEMPO_ONLY_PAGE_START_MEASURE_NUMBERS.length;

function getDefaultNewPageCounts(form: NewShowFormState): number {
    if (
        form.tempo?.method === "tempo_only" &&
        isTempoOnlyTimeSignature(form.tempo.timeSignature)
    ) {
        const beatsPerMeasure = TimeSignature.fromString(
            form.tempo.timeSignature,
        ).numerator;
        return TEMPO_ONLY_DEFAULT_NEW_PAGE_MEASURES * beatsPerMeasure;
    }
    return DEFAULT_NEW_PAGE_COUNTS;
}
const PAGES_COUNT = 8;
const COUNTS_PER_PAGE = DEFAULT_NEW_PAGE_COUNTS;
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
        form.tempo?.method === "tempo_only" && form.tempo.tempo
            ? form.tempo.tempo
            : form.defaultTempo;
    const defaultBeatsPerMeasure =
        form.tempo?.method === "tempo_only" &&
        isTempoOnlyTimeSignature(form.tempo.timeSignature)
            ? TimeSignature.fromString(form.tempo.timeSignature).numerator
            : currentSettings.defaultBeatsPerMeasure;

    const updatedSettings = workspaceSettingsSchema.parse({
        ...currentSettings,
        projectName: form.projectName,
        designer: form.designer,
        client: form.client,
        defaultTempo: tempo,
        defaultBeatsPerMeasure,
        defaultNewPageCounts: getDefaultNewPageCounts(form),
        activity: form.ensemble?.activity,
        ...(form.previousDotsImport != null
            ? { pageNumberOffset: form.previousDotsImport.pageNumberOffset }
            : {}),
    });
    await updateWorkspaceSettingsParsed({ db, settings: updatedSettings });
}

async function applyMusicSettings(
    audio: NewShowFormState["audio"],
    tempo: NewShowFormState["tempo"],
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

    if (tempo?.method === "tempo_only") {
        const { tempo: tempoBpm, beatsPerMeasure } =
            requireTempoOnlyData(tempo);
        await updateWorkspaceSettingsParsed({
            db,
            settings: workspaceSettingsSchema.parse({
                ...currentSettings,
                defaultTempo: tempoBpm,
                defaultBeatsPerMeasure: beatsPerMeasure,
                defaultNewPageCounts:
                    TEMPO_ONLY_DEFAULT_NEW_PAGE_MEASURES * beatsPerMeasure,
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

    if (audio?.method === "audio") {
        const audioFiles = await AudioFile.getAudioFilesDetails();
        if (audioFiles.length === 0) {
            throw new Error(
                tolgee.t("launchpage.newShow.errors.audioNotSaved"),
            );
        }
    }

    if (tempo?.method === "xml") {
        const measures = await getMeasures({ db });
        if (measures.length === 0) {
            throw new Error(
                tolgee.t("launchpage.newShow.errors.xmlNotImported"),
            );
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

    const existingMarchers = await getMarchers({ db });
    if (existingMarchers.length > 0) {
        await deleteMarchers({
            db,
            marcherIds: new Set(existingMarchers.map((m) => m.id)),
        });
    }

    await createMarchers({
        db,
        newMarchers: performers.marchers,
    });

    await queryClient.invalidateQueries({
        queryKey: allMarchersQueryOptions().queryKey,
    });
    await queryClient.invalidateQueries({
        queryKey: marcherPageKeys.all(),
    });
}

function drillNumberKey(marcher: {
    drill_prefix: string;
    drill_order: number;
}): string {
    return `${marcher.drill_prefix}\u0000${marcher.drill_order}`;
}

async function applyPreviousDotsCoordinates(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const coordinates = form.previousDotsImport?.coordinates;
    if (!coordinates?.length) return;

    const coordinateByDrillNumber = new Map(
        coordinates.map((coordinate) => [
            drillNumberKey(coordinate),
            coordinate,
        ]),
    );
    const marchers = await getMarchers({ db });
    const updates = marchers.flatMap((marcher) => {
        const coordinate = coordinateByDrillNumber.get(drillNumberKey(marcher));
        if (!coordinate) return [];
        return [
            {
                marcher_id: marcher.id,
                page_id: FIRST_PAGE_ID,
                x: coordinate.x,
                y: coordinate.y,
            },
        ];
    });

    if (updates.length === 0) return;

    await transactionWithHistory(
        db,
        "applyPreviousDotsCoordinates",
        async (tx) => {
            await updateMarcherPagesInTransaction({
                tx,
                modifiedMarcherPages: updates,
            });
        },
    );

    await queryClient.invalidateQueries({
        queryKey: marcherPageKeys.all(),
    });
}

async function applyPreviousDotsFieldImage(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const fieldImage = form.previousDotsImport?.fieldImage;
    if (fieldImage == null || fieldImage.length === 0) return;

    await updateFieldPropertiesImage(fieldImage);
    await queryClient.invalidateQueries({
        queryKey: fieldPropertiesKeys.detail(),
    });
}

async function applyPreviousDotsSectionAppearances(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const sectionAppearances = form.previousDotsImport?.sectionAppearances;
    if (!sectionAppearances?.length) return;

    await createSectionAppearances({
        db,
        newItems: sectionAppearances,
    });
    await queryClient.invalidateQueries({
        queryKey: sectionAppearanceKeys.all(),
    });
}

async function applyPreviousDotsMarcherTags(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const importData = form.previousDotsImport;
    if (!importData?.tags.length) return;

    const createdTags = await createTags({
        db,
        newTags: importData.tags.map((tag) => ({
            name: tag.name,
            description: tag.description,
            icon: tag.icon,
            color_hex: tag.color_hex,
        })),
    });

    const tagIdByKey = new Map(
        importData.tags.map((tag, index) => [tag.key, createdTags[index].id]),
    );

    if (!importData.marcherTags.length) {
        await queryClient.invalidateQueries({
            queryKey: tagKeys.allTags(),
        });
        return;
    }

    const marchers = await getMarchers({ db });
    const marcherIdByDrillNumber = new Map(
        marchers.map((marcher) => [drillNumberKey(marcher), marcher.id]),
    );

    const newMarcherTags = importData.marcherTags.flatMap((marcherTag) => {
        const marcherId = marcherIdByDrillNumber.get(
            drillNumberKey(marcherTag),
        );
        const tagId = tagIdByKey.get(marcherTag.tagKey);
        if (marcherId == null || tagId == null) return [];
        return [{ marcher_id: marcherId, tag_id: tagId }];
    });

    if (newMarcherTags.length > 0) {
        await createMarcherTags({ db, newMarcherTags });
    }

    await queryClient.invalidateQueries({
        queryKey: tagKeys.allTags(),
    });
    await queryClient.invalidateQueries({
        queryKey: tagKeys.allMarcherTags(),
    });
    await queryClient.invalidateQueries({
        queryKey: tagKeys.marcherIdsByTagIdMap(),
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

function requireTempoOnlyData(tempoData: NewShowTempoData | null | undefined): {
    tempo: number;
    beatsPerMeasure: number;
} {
    if (
        tempoData?.method !== "tempo_only" ||
        !tempoData.tempo ||
        !isTempoOnlyTimeSignature(tempoData.timeSignature)
    ) {
        throw new Error("Tempo-only show requires tempo and time signature");
    }

    return {
        tempo: tempoData.tempo,
        beatsPerMeasure: TimeSignature.fromString(tempoData.timeSignature)
            .numerator,
    };
}

async function sortMeasuresByBeatPosition(
    tx: DbTransaction,
): Promise<DatabaseMeasure[]> {
    const measuresRaw = await tx.query.measures.findMany();
    const beatsRaw = await tx.query.beats.findMany({
        orderBy: asc(schema.beats.position),
    });
    const beatPositionById = new Map(
        beatsRaw.map((beat) => [beat.id, beat.position]),
    );
    return measuresRaw
        .map(realDatabaseMeasureToDatabaseMeasure)
        .sort(
            (a, b) =>
                (beatPositionById.get(a.start_beat) ?? 0) -
                (beatPositionById.get(b.start_beat) ?? 0),
        );
}

function buildTempoOnlyPageArgs(
    sortedMeasures: DatabaseMeasure[],
    pageByStartBeat: Map<number, number>,
): { start_beat: number; is_subset: boolean }[] {
    if (sortedMeasures.length < TEMPO_ONLY_MEASURE_COUNT) {
        throw new Error(
            `Expected ${TEMPO_ONLY_MEASURE_COUNT} measures, got ${sortedMeasures.length}`,
        );
    }

    const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];
    for (const measureNumber of TEMPO_ONLY_PAGE_START_MEASURE_NUMBERS) {
        const measure = sortedMeasures[measureNumber - 1];
        if (!measure) {
            throw new Error(
                `Missing measure ${measureNumber} for page creation`,
            );
        }
        if (pageByStartBeat.has(measure.start_beat)) {
            continue;
        }
        newPagesArgs.push({
            start_beat: measure.start_beat,
            is_subset: false,
        });
    }
    return newPagesArgs;
}

async function isTempoOnlyTimingComplete(
    tx: DbTransaction,
    beatsPerMeasure: number,
): Promise<boolean> {
    const measures = await tx.query.measures.findMany();
    const beats = await tx.query.beats.findMany();
    const pages = await tx.query.pages.findMany();
    const utility = await tx.query.utility.findFirst();

    const nonFirstBeats = beats.filter((beat) => beat.id !== FIRST_BEAT_ID);
    const expectedBeatCount = TEMPO_ONLY_MEASURE_COUNT * beatsPerMeasure;
    const expectedLastPageCounts =
        TEMPO_ONLY_LAST_PAGE_MEASURES * beatsPerMeasure;

    return (
        measures.length === TEMPO_ONLY_MEASURE_COUNT &&
        nonFirstBeats.length === expectedBeatCount &&
        pages.length === TEMPO_ONLY_EXPECTED_PAGE_COUNT &&
        utility?.last_page_counts === expectedLastPageCounts
    );
}

async function resetTempoOnlyTimingStateInTransaction(
    tx: DbTransaction,
): Promise<void> {
    const measures = await tx.query.measures.findMany();
    const beats = await tx.query.beats.findMany();
    const pages = await tx.query.pages.findMany();

    const nonFirstBeats = beats.filter((beat) => beat.id !== FIRST_BEAT_ID);
    const nonFirstPages = pages.filter((page) => page.id !== FIRST_PAGE_ID);

    if (
        measures.length === 0 &&
        nonFirstBeats.length === 0 &&
        nonFirstPages.length === 0
    ) {
        return;
    }

    if (nonFirstPages.length > 0) {
        await deletePagesInTransaction({
            tx,
            pageIds: new Set(nonFirstPages.map((page) => page.id)),
        });
    }

    if (measures.length > 0) {
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(measures.map((measure) => measure.id)),
        });
    }

    if (nonFirstBeats.length > 0) {
        await deleteBeatsInTransaction({
            tx,
            beatIds: new Set(nonFirstBeats.map((beat) => beat.id)),
        });
    }

    await ensureSecondBeatHasPage({ tx });
    await updateUtilityInTransaction({
        tx,
        args: { last_page_counts: DEFAULT_LAST_PAGE_COUNTS },
    });
}

async function createTempoOnlyPagesInTransaction(
    tx: DbTransaction,
    params: {
        tempo: number;
        beatsPerMeasure: number;
        pageByStartBeat: Map<number, number>;
    },
): Promise<void> {
    const { tempo, beatsPerMeasure, pageByStartBeat } = params;

    if (!(await isTempoOnlyTimingComplete(tx, beatsPerMeasure))) {
        await resetTempoOnlyTimingStateInTransaction(tx);
        await _createFromTempoGroupInTransaction({
            tx,
            tempoGroup: {
                name: "",
                tempo,
                bigBeatsPerMeasure: beatsPerMeasure,
                numOfRepeats: TEMPO_ONLY_MEASURE_COUNT,
            },
            startingPosition: 0,
        });
    }

    const sortedMeasures = await sortMeasuresByBeatPosition(tx);
    const newPagesArgs = buildTempoOnlyPageArgs(
        sortedMeasures,
        pageByStartBeat,
    );

    if (newPagesArgs.length > 0) {
        await createPagesInTransaction({ tx, newPages: newPagesArgs });
    }

    await updateUtilityInTransaction({
        tx,
        args: {
            last_page_counts: TEMPO_ONLY_LAST_PAGE_MEASURES * beatsPerMeasure,
        },
    });
}

async function invalidateTempoOnlyQueries(
    queryClient: QueryClient,
): Promise<void> {
    await queryClient.invalidateQueries({
        queryKey: allDatabaseBeatsQueryOptions().queryKey,
    });
    await queryClient.invalidateQueries({
        queryKey: measureKeys.all(),
    });
    await queryClient.invalidateQueries({
        queryKey: allDatabasePagesQueryOptions().queryKey,
    });
}

async function createTempoOnlyBeatsMeasuresAndPages(
    form: NewShowFormState,
    queryClient: QueryClient,
): Promise<void> {
    const { tempo, beatsPerMeasure } = requireTempoOnlyData(form.tempo);

    const existingPages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const pageByStartBeat = new Map(
        existingPages.map((p) => [p.start_beat, p.id]),
    );

    await transactionWithHistory(
        db,
        "createTempoOnlyBeatsMeasuresAndPages",
        async (tx) => {
            await createTempoOnlyPagesInTransaction(tx, {
                tempo,
                beatsPerMeasure,
                pageByStartBeat,
            });
        },
    );

    await invalidateTempoOnlyQueries(queryClient);
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

    if (form.tempo?.method === "tempo_only") {
        requireTempoOnlyData(form.tempo);
    }

    await ensureHistoryTriggers();
    await applyProjectSettings(form);
    await applyMusicSettings(form.audio, form.tempo);
    await updateFieldProperties(form.fieldTemplate);
    await applyPreviousDotsFieldImage(form, queryClient);
    if (form.tempo?.method === "tempo_only") {
        await createTempoOnlyBeatsMeasuresAndPages(form, queryClient);
    } else {
        await createBeatsAndPages(queryClient);
    }
    await applyPerformersSettings(form.performers, queryClient);
    await applyPreviousDotsCoordinates(form, queryClient);
    await applyPreviousDotsSectionAppearances(form, queryClient);
    await applyPreviousDotsMarcherTags(form, queryClient);

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
