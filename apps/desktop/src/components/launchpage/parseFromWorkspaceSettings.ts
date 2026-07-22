/** Extract non-empty trimmed fields from workspace_settings JSON. */
export function parseFromWorkspaceSettings(
    jsonData: string | null | undefined,
): {
    designer?: string;
    client?: string;
    activity?: string;
    pageNumberOffset?: number;
} {
    if (!jsonData) return {};

    try {
        const parsed: unknown = JSON.parse(jsonData);
        if (typeof parsed !== "object" || parsed === null) return {};

        const record = parsed as Record<string, unknown>;
        const designer =
            typeof record.designer === "string"
                ? record.designer.trim() || undefined
                : undefined;
        const client =
            typeof record.client === "string"
                ? record.client.trim() || undefined
                : undefined;
        const activity =
            typeof record.activity === "string"
                ? record.activity.trim() || undefined
                : undefined;
        const pageNumberOffset =
            typeof record.pageNumberOffset === "number" &&
            Number.isFinite(record.pageNumberOffset) &&
            Number.isInteger(record.pageNumberOffset)
                ? record.pageNumberOffset
                : undefined;

        return { designer, client, activity, pageNumberOffset };
    } catch {
        return {};
    }
}
