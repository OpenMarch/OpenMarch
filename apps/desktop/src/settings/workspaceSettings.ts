import * as z from "zod";

export const workspaceSettingsSchema = z.object({
    defaultBeatsPerMeasure: z.int().positive().default(4),
    defaultTempo: z.float64().positive().default(120),
    defaultNewPageCounts: z.int().positive().default(16),
    audioOffsetSeconds: z.float64().default(0),
    pageNumberOffset: z.int().default(0),
    measurementOffset: z.int().default(1),
    projectName: z.string().optional(),
    designer: z.string().optional(),
    client: z.string().optional(),
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
