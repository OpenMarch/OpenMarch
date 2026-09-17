import { db, type DB } from "@/global/database/db";
import type {
    ExportRequestFields,
    ShowColor as GeneratedShowColor,
} from "@/generated/illuminant-api-contract";
import {
    buildIlluminantApiExportSource,
    fetchIlluminantVisualizerSourceData,
    type IlluminantApiExportSource,
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
] as const satisfies readonly GeneratedShowColor[];
export type ShowColor = GeneratedShowColor;

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

export type ColorMapping = ExportRequestFields["colorMapping"];

/** LED channel order for setColor bytes. Use GRB for strips with swapped R/G. */
export const COLOR_MAPPINGS = [
    "RGB",
    "GRB",
] as const satisfies readonly ColorMapping[];

export const DEFAULT_COLOR_MAPPING: ColorMapping = "RGB";

export type IlluminantExportSource = IlluminantApiExportSource &
    ExportRequestFields;

export type IlluminantHealthCheckResult = { ok: boolean };

export type IlluminantExportResult =
    | { success: true; filePath: string; exportDir: string }
    | { success: false; canceled: true }
    | { success: false; error: string };

export async function buildIlluminantExportSource({
    database = db,
    showColor = DEFAULT_SHOW_COLOR,
    colorMapping = DEFAULT_COLOR_MAPPING,
    title,
    author,
}: {
    database?: DB;
    showColor?: ShowColor;
    colorMapping?: ColorMapping;
    title: string;
    author?: string;
}): Promise<IlluminantExportSource> {
    const source = buildIlluminantApiExportSource(
        await fetchIlluminantVisualizerSourceData(database),
    );

    return {
        ...source,
        showColor,
        colorMapping,
        title,
        author,
    } satisfies IlluminantExportSource;
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
