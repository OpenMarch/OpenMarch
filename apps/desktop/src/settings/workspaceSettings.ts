import * as z from "zod";
import { MIN_TEMPO_BPM } from "@/global/classes/Beat";

export const workspaceSettingsSchema = z.object({
    defaultBeatsPerMeasure: z.int().positive().default(4),
    defaultTempo: z.float64().min(MIN_TEMPO_BPM).default(120),
    defaultNewPageCounts: z.int().positive().default(16),
    audioOffsetSeconds: z.float64().default(0),
    pageNumberOffset: z.int().default(0),
    measurementOffset: z.int().default(1),
    projectName: z.string().optional(),
    designer: z.string().optional(),
    client: z.string().optional(),
    activity: z.string().optional(),

    // Mobile export settings
    otmProductionId: z.preprocess(
        (v) => (v === "" || v === undefined ? undefined : v),
        z.optional(z.coerce.number().int().positive()),
    ),

    /**
     * When the file was converted to timelines, or created as a timeline file (ISO time; P9.3,
     * ADR 0001 §6). Written by the main process; kept here so saving the settings keeps it. The
     * conversion worker's host reads it to tell whether a conversion committed.
     */
    timelineConvertedAt: z.string().optional(),

    /**
     * Show-wide performer defaults the cues fall back to (ADR 0004 D-4). Absent fields mean left
     * foot and foot on the dot (`performerDefaultsOf`). Not shown in the settings UI yet.
     */
    performerDefaults: z
        .object({
            stepOffFoot: z.enum(["left", "right"]).optional(),
            dotMode: z.enum(["foot", "body"]).optional(),
        })
        .optional(),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/**
 * Default workspace settings
 */
export const defaultWorkspaceSettings: WorkspaceSettings = {
    defaultBeatsPerMeasure: 4,
    defaultTempo: 120,
    defaultNewPageCounts: 16,
    audioOffsetSeconds: 0,
    pageNumberOffset: 0,
    measurementOffset: 0,
    projectName: undefined,
    designer: undefined,
    client: undefined,
    activity: undefined,
    otmProductionId: undefined,
};

/**
 * Parses workspace settings from JSON string
 */
export function parseWorkspaceSettings(jsonData: string): WorkspaceSettings {
    try {
        const parsed = JSON.parse(jsonData);
        return workspaceSettingsSchema.parse(parsed);
    } catch (error) {
        console.warn(
            "Failed to parse workspace settings, using defaults:",
            error,
        );
        return defaultWorkspaceSettings;
    }
}

/**
 * Serializes workspace settings to JSON string
 */
export function serializeWorkspaceSettings(
    settings: WorkspaceSettings,
): string {
    return JSON.stringify(settings);
}

export type PerformerDefaults = {
    stepOffFoot: "left" | "right";
    dotMode: "foot" | "body";
};

/** The show's performer defaults, filled in: left foot and foot on the dot when absent. */
export function performerDefaultsOf(
    settings: Pick<WorkspaceSettings, "performerDefaults"> | undefined,
): PerformerDefaults {
    return {
        stepOffFoot: settings?.performerDefaults?.stepOffFoot ?? "left",
        dotMode: settings?.performerDefaults?.dotMode ?? "foot",
    };
}
