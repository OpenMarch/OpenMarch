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
import { t } from "../i18n";

interface FileFilter {
    name: string;
    extensions: string[];
}

// The filters are built when a dialog opens, so their names follow the app language.
const MODEL_EXTENSIONS = ["glb", "gltf"];
const ARTWORK_EXTENSIONS = ["png", "jpg", "jpeg", "svg", "pdf"];
const modelFilter = (): FileFilter => ({
    name: t("library.fileDialog.models"),
    extensions: MODEL_EXTENSIONS,
});
const artworkFilter = (): FileFilter => ({
    name: t("library.fileDialog.artwork"),
    extensions: ARTWORK_EXTENSIONS,
});
// Library Import… takes either, so its first (selected) filter must show
// both; otherwise macOS greys out every image until the format is switched.
const importableFilter = (): FileFilter => ({
    name: t("library.fileDialog.modelsAndArtwork"),
    extensions: [...MODEL_EXTENSIONS, ...ARTWORK_EXTENSIONS],
});
const allFiles = (): FileFilter => ({
    name: t("fileDialog.filters.allFiles"),
    extensions: ["*"],
});

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
            ? [modelFilter(), allFiles()]
            : purpose === "artwork"
              ? [artworkFilter(), allFiles()]
              : [
                    importableFilter(),
                    modelFilter(),
                    artworkFilter(),
                    allFiles(),
                ];
    return {
        title: t("library.fileDialog.importTitle"),
        ...(lastFolder ? { defaultPath: lastFolder } : {}),
        filters,
        properties:
            purpose === "model"
                ? ["openFile"]
                : ["openFile", "multiSelections"],
    };
}

export function templateSaveFilter(format: TemplateFormat): FileFilter {
    switch (format) {
        case "svg":
            return { name: "SVG", extensions: ["svg"] }; // i18n-ignore: a file format's name
        case "pdf":
            return { name: "PDF", extensions: ["pdf"] }; // i18n-ignore: a file format's name
        case "png":
            return {
                name: t("library.fileDialog.pngImage"),
                extensions: ["png"],
            };
    }
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
