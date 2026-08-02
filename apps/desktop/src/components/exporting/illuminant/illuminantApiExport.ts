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

export const SHOW_COLOR_HEX: Record<ShowColor, string> = {
    RED: "#FF0000",
    ORANGE: "#FF8000",
    YELLOW: "#FFFF00",
    GREEN: "#00FF00",
    CYAN: "#00FFFF",
    BLUE: "#0000FF",
    PURPLE: "#8000FF",
    PINK: "#FF0080",
};

export const DEFAULT_SHOW_COLOR: ShowColor = "CYAN";

export function getShowColorLabel(color: ShowColor): string {
    return color.charAt(0) + color.slice(1).toLowerCase();
}

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
    showColor = DEFAULT_SHOW_COLOR,
}: {
    database?: DB;
    showColor?: ShowColor;
} = {}): Promise<IlluminantExportSource> {
    const source = buildIlluminantVisualizerSource(
        await fetchIlluminantVisualizerSourceData(database),
    );

    return { ...source, showColor };
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
