import { db } from "@/global/database/db";
import { createBeats } from "@/db-functions/beat";
import { createPages } from "@/db-functions/page";
import { createMarchers } from "@/db-functions/marcher";
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
import { toast } from "sonner";
import type { WizardState } from "./types";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { QueryClient } from "@tanstack/react-query";
import { createAllUndoTriggers } from "@/db-functions/history";
import { getMeasures } from "@/db-functions/measures";
import AudioFile from "@/global/classes/AudioFile";

const DEFAULT_TEMPO = 120;
const PAGES_COUNT = 8;
const COUNTS_PER_PAGE = 16;
const TOTAL_COUNTS = PAGES_COUNT * COUNTS_PER_PAGE; // 128 counts total

const sanitizeFilename = (name: string): string =>
    name.trim().replace(/[<>:"/\\|?*]/g, "_");

/**
 * Retry a database operation with exponential backoff to handle SQLITE_BUSY errors
 */
async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 5,
    initialDelay = 50,
): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            if (
                error?.code === "SQLITE_BUSY" ||
                error?.message?.includes("database is locked")
            ) {
                if (attempt < maxRetries - 1) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
            throw error;
        }
    }
    // This should never be reached since the last attempt will throw
    throw new Error("Operation failed after retries");
}

/**
 * Completes the wizard by applying all collected data to the database
 * and creating the initial pages and beats.
 */
export async function completeWizard(
    wizardState: WizardState,
    queryClient: QueryClient,
): Promise<void> {
    const isTriggerAlreadyExistsError = (error: unknown) => {
        const message = (error as { message?: string } | null | undefined)
            ?.message;
        return (
            typeof message === "string" &&
            message.toLowerCase().includes("already exists")
        );
    };

    try {
        // 0. Verify file exists and is ready, create if needed
        if (wizardState.project?.projectName) {
            // Ensure fileLocation includes the project name
            let filePath = wizardState.project.fileLocation;

            // If fileLocation is missing or doesn't end with .dots, construct it
            if (!filePath || !filePath.trim()) {
                // Get default documents directory
                const defaultDir =
                    await window.electron.getDefaultDocumentsPath();
                const sanitizedProjectName = sanitizeFilename(
                    wizardState.project.projectName,
                ); // Remove invalid filename characters
                filePath = `${defaultDir}/${sanitizedProjectName}.dots`;
            } else {
                // Ensure fileLocation has .dots extension and uses project name
                filePath = filePath.trim();
                const normalizedPath = filePath.replace(/\\/g, "/");
                const pathParts = normalizedPath.split("/");
                const lastPart = pathParts[pathParts.length - 1];

                // If last part doesn't end with .dots or doesn't match project name, fix it
                if (!lastPart.endsWith(".dots")) {
                    const sanitizedProjectName = sanitizeFilename(
                        wizardState.project.projectName,
                    );
                    pathParts[pathParts.length - 1] =
                        `${sanitizedProjectName}.dots`;
                    filePath = pathParts.join("/");
                } else if (
                    !lastPart.startsWith(
                        sanitizeFilename(wizardState.project.projectName),
                    )
                ) {
                    // If filename doesn't match project name, update it
                    const sanitizedProjectName = sanitizeFilename(
                        wizardState.project.projectName,
                    );
                    pathParts[pathParts.length - 1] =
                        `${sanitizedProjectName}.dots`;
                    filePath = pathParts.join("/");
                }
            }

            // Verify database is ready and connected to the correct file
            const dbReady = await window.electron.databaseIsReady();
            const currentPath = await window.electron.databaseGetPath();
            const normalizedFilePath = filePath.replace(/\\/g, "/");
            const normalizedCurrentPath = currentPath
                ?.trim()
                .replace(/\\/g, "/");

            if (!dbReady || normalizedCurrentPath !== normalizedFilePath) {
                // File wasn't created yet or wrong file is open, create it now
                console.log("Creating database file at:", filePath);
                const result =
                    await window.electron.databaseCreateForWizard(filePath);
                if (result !== 200) {
                    throw new Error(
                        `Failed to create file at specified location: ${filePath}`,
                    );
                }
                // Verify it was created successfully
                const verifyReady = await window.electron.databaseIsReady();
                if (!verifyReady) {
                    throw new Error(
                        "Database file was created but is not ready",
                    );
                }
                // Ensure undo/redo history triggers are set up
                // This is critical for the history system to work correctly
                console.log("Setting up undo/redo history triggers...");
                try {
                    await createAllUndoTriggers(db);
                    console.log("History triggers set up successfully");
                } catch (error) {
                    if (isTriggerAlreadyExistsError(error)) {
                        console.warn(
                            "History triggers already exist; continuing",
                        );
                    } else {
                        console.error(
                            "Error setting up history triggers:",
                            error,
                        );
                        throw error;
                    }
                }
            } else {
                console.log(
                    "Database file already exists and is ready:",
                    filePath,
                );
                // Ensure undo/redo history triggers are set up even if file already exists
                console.log(
                    "Verifying undo/redo history triggers are set up...",
                );
                try {
                    await createAllUndoTriggers(db);
                    console.log(
                        "History triggers verified/set up successfully",
                    );
                } catch (error) {
                    if (isTriggerAlreadyExistsError(error)) {
                        console.warn(
                            "History triggers already exist; continuing",
                        );
                    } else {
                        console.error(
                            "Error setting up history triggers:",
                            error,
                        );
                        throw error;
                    }
                }
            }
        } else {
            throw new Error("Project name is required to create database file");
        }

        // 1. Apply project settings
        console.log("Applying project settings...");
        await retryWithBackoff(async () => {
            await applyProjectSettings(wizardState.project, queryClient);
        });
        console.log("Project settings applied successfully");

        // 2. Apply ensemble settings (extend workspace settings schema if needed)
        // For now, we'll store ensemble data in workspace settings JSON
        // Note: This requires extending the workspace settings schema
        console.log("Applying ensemble settings...");
        await applyEnsembleSettings(wizardState.ensemble, queryClient);
        console.log("Ensemble settings applied successfully");

        // 3. Apply music settings FIRST (tempo needed for beats)
        console.log("Applying music settings...");
        await retryWithBackoff(async () => {
            await applyMusicSettings(wizardState.music, queryClient);
        });
        console.log("Music settings applied successfully");

        // 4. Apply field properties
        console.log("Applying field properties...");
        await retryWithBackoff(async () => {
            if (wizardState.field) {
                await updateFieldProperties(wizardState.field.template);
            } else {
                // Default to College Football Field (no end zones)
                const defaultTemplate =
                    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
                await updateFieldProperties(defaultTemplate);
            }
        });
        console.log("Field properties applied successfully");

        // 5. Create beats and pages (performers need pages to exist)
        console.log("Creating beats and pages...");
        await retryWithBackoff(async () => {
            await createBeatsAndPages(queryClient);
        });
        console.log("Beats and pages created successfully");

        // 6. Create performers in database (if any were added)
        console.log("Applying performers settings...");
        await retryWithBackoff(async () => {
            await applyPerformersSettings(wizardState.performers, queryClient);
        });
        console.log("Performers settings applied successfully");

        // Verify database is ready before completing
        const finalDbReady = await window.electron.databaseIsReady();
        if (!finalDbReady) {
            throw new Error("Database is not ready after completing wizard");
        }

        toast.success("Setup complete! Your show is ready.");
    } catch (error) {
        console.error("Failed to complete wizard:", error);
        toast.error("Failed to complete setup. Please try again.");
        throw error;
    }
}

/**
 * Applies project settings to workspace settings
 */
async function applyProjectSettings(
    project: WizardState["project"],
    queryClient: QueryClient,
): Promise<void> {
    if (!project || !project.projectName) {
        console.warn("No project data to apply");
        return;
    }

    try {
        const currentSettings = await getWorkspaceSettingsParsed({ db });

        const updatedSettings = {
            ...currentSettings,
            projectName: project.projectName,
            designer: project.designer,
            client: project.client,
        };

        const validatedSettings =
            workspaceSettingsSchema.parse(updatedSettings);
        await updateWorkspaceSettingsParsed({
            db,
            settings: validatedSettings,
        });

        // Verify the settings were saved
        const verifySettings = await getWorkspaceSettingsParsed({ db });
        if (verifySettings.projectName !== project.projectName) {
            throw new Error("Failed to verify project settings were saved");
        }
    } catch (error) {
        console.error("Error applying project settings:", error);
        throw error;
    }
}

/**
 * Applies ensemble settings to workspace settings
 * Note: Ensemble data is collected but not currently stored in workspace settings
 * as the schema doesn't support it. This can be extended in the future if needed.
 */
async function applyEnsembleSettings(
    ensemble: WizardState["ensemble"],
    queryClient: QueryClient,
): Promise<void> {
    if (!ensemble) return;

    // TODO: Extend workspace settings schema to include ensemble data
    // For now, ensemble data is collected but not persisted
    // The field and music settings are the critical ones that get applied
}

/**
 * Applies music settings
 */
async function applyMusicSettings(
    music: WizardState["music"],
    queryClient: QueryClient,
): Promise<void> {
    try {
        // Always set a default tempo if none exists (needed for beats)
        const currentSettings = await getWorkspaceSettingsParsed({ db });

        // Detect whether defaultTempo was explicitly set in raw settings.
        // If the key is missing/null in the stored JSON, we should initialize it.
        const rawSettingsJson = await getWorkspaceSettingsJSON({ db });
        const rawSettings = JSON.parse(rawSettingsJson) ?? {};
        const hasDefaultTempoKey = Object.prototype.hasOwnProperty.call(
            rawSettings,
            "defaultTempo",
        );
        const needsTempoUpdate =
            !hasDefaultTempoKey || rawSettings.defaultTempo == null;

        if (music && music.method === "tempo_only" && music.tempo) {
            // Update workspace settings with user-specified tempo
            const updatedSettings = {
                ...currentSettings,
                defaultTempo: music.tempo,
            };

            const validatedSettings =
                workspaceSettingsSchema.parse(updatedSettings);
            await updateWorkspaceSettingsParsed({
                db,
                settings: validatedSettings,
            });

            // Verify tempo was saved
            const verifySettings = await getWorkspaceSettingsParsed({ db });
            if (verifySettings.defaultTempo !== music.tempo) {
                throw new Error("Failed to verify tempo was saved");
            }
        } else if (needsTempoUpdate) {
            // Set default tempo if none exists and user skipped music step
            const updatedSettings = {
                ...currentSettings,
                defaultTempo: DEFAULT_TEMPO,
            };

            const validatedSettings =
                workspaceSettingsSchema.parse(updatedSettings);
            await updateWorkspaceSettingsParsed({
                db,
                settings: validatedSettings,
            });

            // Verify default tempo was saved
            const verifySettings = await getWorkspaceSettingsParsed({ db });
            if (verifySettings.defaultTempo !== DEFAULT_TEMPO) {
                throw new Error("Failed to verify default tempo was saved");
            }
        }

        // For XML and MP3, verify that files were actually saved
        if (music && music.method === "mp3") {
            // Verify audio file exists in database
            const audioFiles = await AudioFile.getAudioFilesDetails();
            if (audioFiles.length === 0) {
                console.warn(
                    "No audio files found in database. Music may not have been saved during upload.",
                );
                toast.error(
                    "Audio file was not saved. Please upload the audio file again after completing the wizard.",
                );
            }
        } else if (music && music.method === "xml") {
            // Verify measures exist in database
            const measures = await getMeasures({ db });
            if (measures.length === 0) {
                console.warn(
                    "No measures found in database. Music XML may not have been imported.",
                );
                toast.error(
                    "Music XML was not imported. Please import the Music XML file again after completing the wizard.",
                );
            }
        }
    } catch (error) {
        console.error("Error applying music settings:", error);
        throw error;
    }
}

/**
 * Creates performers in the database if any were added during the wizard
 */
async function applyPerformersSettings(
    performers: WizardState["performers"],
    queryClient: QueryClient,
): Promise<void> {
    if (
        !performers ||
        performers.method === "skip" ||
        !performers.marchers ||
        performers.marchers.length === 0
    ) {
        console.log("No performers to add");
        return;
    }

    try {
        console.log(`Creating ${performers.marchers.length} marchers...`);
        await createMarchers({
            db,
            newMarchers: performers.marchers,
        });

        // Invalidate marchers query to refresh the UI
        await queryClient.invalidateQueries({
            queryKey: allMarchersQueryOptions().queryKey,
        });

        // Verify marchers were created by refetching
        const allMarchers = await queryClient.fetchQuery(
            allMarchersQueryOptions(),
        );
        if (!allMarchers || allMarchers.length < performers.marchers.length) {
            throw new Error("Failed to verify all marchers were created");
        }
        console.log(
            `Successfully created ${performers.marchers.length} marchers`,
        );
    } catch (error) {
        console.error("Error applying performers settings:", error);
        throw error;
    }
}

/**
 * Creates beats and pages for the initial show setup
 * Creates 8 pages × 16 counts (128 beats total)
 * Pages start at beat positions: 0, 16, 32, 48, 64, 80, 96, 112
 */
async function createBeatsAndPages(queryClient: QueryClient): Promise<void> {
    // Get current beats to see how many exist
    const currentBeats = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );

    // Get workspace settings for tempo
    const workspaceSettings = await getWorkspaceSettingsParsed({ db });

    const tempo = workspaceSettings?.defaultTempo || DEFAULT_TEMPO;
    const beatDuration = 60 / tempo;

    // Calculate how many beats we need
    // We need beats at positions 0 through TOTAL_COUNTS (inclusive)
    // That's TOTAL_COUNTS + 1 beats total
    const beatsNeeded = Math.max(0, TOTAL_COUNTS + 1 - currentBeats.length);

    if (beatsNeeded > 0) {
        // Create the needed beats
        const newBeats = Array.from({ length: beatsNeeded }, () => ({
            duration: beatDuration,
            include_in_measure: true,
        }));

        await createBeats({
            db,
            newBeats,
        });

        // Refetch beats to get the latest data
        await queryClient.invalidateQueries({
            queryKey: allDatabaseBeatsQueryOptions().queryKey,
        });
    }

    // Refetch beats to ensure we have the latest data
    const updatedBeats = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );

    // Sort beats by position
    const sortedBeats = updatedBeats
        .sort((a, b) => a.position - b.position)
        .map((beat) => ({ id: beat.id, position: beat.position }));

    // Check existing pages
    const existingPages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );

    const pageByStartBeat = new Map(
        existingPages.map((p) => [p.start_beat, p.id]),
    );

    // Create pages starting at beat positions 0, 16, 32, 48, 64, 80, 96, 112
    // Page 0 already exists (FIRST_PAGE_ID = 0), so we create pages 1-7
    const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];

    for (let i = 1; i < PAGES_COUNT; i++) {
        const beatPosition = i * COUNTS_PER_PAGE; // 16, 32, 48, 64, 80, 96, 112
        const beatObj = sortedBeats.find((b) => b.position === beatPosition);

        if (!beatObj) {
            console.error(
                `Missing beat at position ${beatPosition} for page ${i}`,
            );
            throw new Error(
                `Missing beat at position ${beatPosition} for page ${i}`,
            );
        }

        // Check if page already exists at this start_beat
        if (pageByStartBeat.has(beatObj.id)) {
            continue;
        }

        newPagesArgs.push({
            start_beat: beatObj.id,
            is_subset: false,
        });
    }

    if (newPagesArgs.length > 0) {
        await createPages({
            db,
            newPages: newPagesArgs,
        });

        // Invalidate pages query
        await queryClient.invalidateQueries({
            queryKey: allDatabasePagesQueryOptions().queryKey,
        });
    }
}
