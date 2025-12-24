import { db } from "@/global/database/db";
import { createBeats } from "@/db-functions/beat";
import { createPages } from "@/db-functions/page";
import { updateFieldProperties } from "@/global/classes/FieldProperties";
import {
    updateWorkspaceSettingsParsed,
    getWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
} from "@/hooks/queries";
import { toast } from "sonner";
import type { WizardState } from "./types";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { QueryClient } from "@tanstack/react-query";

const DEFAULT_TEMPO = 120;
const PAGES_COUNT = 8;
const COUNTS_PER_PAGE = 16;
const TOTAL_COUNTS = PAGES_COUNT * COUNTS_PER_PAGE; // 128 counts total

/**
 * Completes the wizard by applying all collected data to the database
 * and creating the initial pages and beats.
 */
export async function completeWizard(
    wizardState: WizardState,
    queryClient: QueryClient,
): Promise<void> {
    try {
        // 0. File should already be created when project step completed
        // Just verify it exists, or create it if it doesn't (fallback)
        if (wizardState.project?.fileLocation) {
            const dbReady = await window.electron.databaseIsReady();
            if (!dbReady) {
                // File wasn't created yet, create it now (fallback)
                const result = await window.electron.databaseCreateAtPath(
                    wizardState.project.fileLocation,
                );
                if (result !== 200) {
                    throw new Error(
                        "Failed to create file at specified location",
                    );
                }
            }
        }

        // 1. Apply project settings
        await applyProjectSettings(wizardState.project, queryClient);

        // 2. Apply ensemble settings (extend workspace settings schema if needed)
        // For now, we'll store ensemble data in workspace settings JSON
        // Note: This requires extending the workspace settings schema
        await applyEnsembleSettings(wizardState.ensemble, queryClient);

        // 3. Apply field properties
        if (wizardState.field) {
            await updateFieldProperties(wizardState.field.template);
        } else {
            // Default to College Football Field (no end zones)
            const defaultTemplate =
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
            await updateFieldProperties(defaultTemplate);
        }

        // 4. Performers are already created in the database (created during PerformersStep)
        // No action needed here

        // 5. Apply music settings
        await applyMusicSettings(wizardState.music, queryClient);

        // 6. Create beats and pages
        await createBeatsAndPages(queryClient);

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
    if (!project || !project.projectName) return;

    const currentSettings = await getWorkspaceSettingsParsed({ db });

    const updatedSettings = {
        ...currentSettings,
        projectName: project.projectName,
        designer: project.designer,
        client: project.client,
    };

    const validatedSettings = workspaceSettingsSchema.parse(updatedSettings);
    await updateWorkspaceSettingsParsed({
        db,
        settings: validatedSettings,
    });
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
    if (!music || music.method === "skip") return;

    if (music.method === "tempo_only" && music.tempo) {
        // Update workspace settings with default tempo
        const currentSettings = await getWorkspaceSettingsParsed({ db });

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
    }
    // For XML and MP3, the files are already imported during the MusicStep
    // No additional action needed here
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
            queryKey: ["beats"],
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
            queryKey: ["pages"],
        });
    }
}
