import { db, type DB } from "@/global/database/db";
import {
    buildIlluminantVisualizerSource,
    fetchIlluminantVisualizerSourceData,
    type IlluminantVisualizerSource,
} from "./illuminantExport";

export const SHOW_COLORS = [
    "RED",
    "ORANGE",
    "YELLOW",
    "GREEN",
    "CYAN",
    "BLUE",
    "PURPLE",
    "PINK",
] as const;
export type ShowColor = (typeof SHOW_COLORS)[number];

/** OpenMarch has no show/uniform color concept yet; placeholder until product defines one. */
export const DEFAULT_SHOW_COLOR: ShowColor = "CYAN";

export type IlluminantExportSource = IlluminantVisualizerSource & {
    showColor: ShowColor;
};

export type IlluminantHealthCheckResult = { ok: boolean };

export type IlluminantExportResult =
    | { success: true; filePath: string; exportDir: string }
    | { success: false; canceled: true }
    | { success: false; error: string };

export async function buildIlluminantExportSource({
    database = db,
}: { database?: DB } = {}): Promise<IlluminantExportSource> {
    const source = buildIlluminantVisualizerSource(
        await fetchIlluminantVisualizerSourceData(database),
    );

    return { ...source, showColor: DEFAULT_SHOW_COLOR };
}

export async function checkIlluminantHealth(): Promise<IlluminantHealthCheckResult> {
    return (await window.electron.invoke(
        "illuminant:healthCheck",
    )) as IlluminantHealthCheckResult;
}

export async function exportIlluminantShow(
    request: IlluminantExportSource,
): Promise<IlluminantExportResult> {
    return (await window.electron.invoke(
        "illuminant:export",
        request,
    )) as IlluminantExportResult;
}
