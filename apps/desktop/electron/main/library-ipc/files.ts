/**
 * File dialogs and sniffing for imports (C1.9 §7; props-spec.md §2 "Where
 * import starts"). Main owns every dialog; the renderer never passes dialog
 * options, only a purpose.
 */
// cspell:words gltf
import { open } from "node:fs/promises";
import type {
    ImportFileType,
    PickPurpose,
    TemplateFormat,
} from "../../../src/view3d/library/protocol";
import { sniffArtworkFormat } from "../artwork-import/formats";
import { isGlb } from "../model-import/container";

interface FileFilter {
    name: string;
    extensions: string[];
}

const MODEL_FILTER: FileFilter = {
    name: "3D model (glb, gltf)",
    extensions: ["glb", "gltf"],
};
const ARTWORK_FILTER: FileFilter = {
    name: "Artwork (png, jpg, svg, pdf)",
    extensions: ["png", "jpg", "jpeg", "svg", "pdf"],
};
// Library Import… takes either, so its first (selected) filter must show
// both; otherwise macOS greys out every image until the format is switched.
const IMPORTABLE_FILTER: FileFilter = {
    name: "Models and artwork",
    extensions: [...MODEL_FILTER.extensions, ...ARTWORK_FILTER.extensions],
};
const ALL_FILES: FileFilter = { name: "All Files", extensions: ["*"] };

export interface OpenDialogSpec {
    title: string;
    defaultPath?: string;
    filters: FileFilter[];
    properties: ("openFile" | "multiSelections")[];
}

/** The spec's filters by purpose, first one selected. */
export function openDialogSpec(
    purpose: PickPurpose,
    lastFolder: string | null,
): OpenDialogSpec {
    const filters =
        purpose === "model"
            ? [MODEL_FILTER, ALL_FILES]
            : purpose === "artwork"
              ? [ARTWORK_FILTER, ALL_FILES]
              : [IMPORTABLE_FILTER, MODEL_FILTER, ARTWORK_FILTER, ALL_FILES];
    return {
        title: "Import",
        ...(lastFolder ? { defaultPath: lastFolder } : {}),
        filters,
        properties:
            purpose === "model"
                ? ["openFile"]
                : ["openFile", "multiSelections"],
    };
}

const TEMPLATE_FILTERS: Record<TemplateFormat, FileFilter> = {
    svg: { name: "SVG", extensions: ["svg"] },
    pdf: { name: "PDF", extensions: ["pdf"] },
    png: { name: "PNG image", extensions: ["png"] },
};

export function templateSaveFilter(format: TemplateFormat): FileFilter {
    return TEMPLATE_FILTERS[format];
}

/** Bytes read to sniff a file's type (an SVG root may follow a long prolog). */
export const SNIFF_BYTES = 64 * 1024;

/** A file's type from its leading bytes, never its extension. */
export function sniffFileType(head: Uint8Array): ImportFileType {
    if (isGlb(head)) return "model";
    if (sniffArtworkFormat(head)) return "artwork";
    // A `.gltf` is JSON: an object at the top, after an optional BOM.
    const text = new TextDecoder("utf-8", { fatal: false })
        .decode(head.subarray(0, 1024))
        .replace(/^\uFEFF/, "")
        .trimStart();
    if (text.startsWith("{")) return "model";
    return "unsupported";
}

export async function readHead(filePath: string): Promise<Uint8Array> {
    const handle = await open(filePath, "r");
    try {
        const buffer = new Uint8Array(SNIFF_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}
