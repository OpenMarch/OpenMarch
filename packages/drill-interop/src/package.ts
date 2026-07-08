import JSZip from "jszip";
import { parseDrillDocument } from "./document";
import type { DrillAudio, DrillShow } from "./types";

/** The inner drill document extension inside the interchange package. */
const DOCUMENT_EXTENSION = ".3dj";
const AUDIO_EXTENSIONS = [".ogg", ".wav", ".mp3", ".m4a", ".aac", ".flac"];

/**
 * Reads a drill interchange package (a `.3dz` archive) into a normalized
 * {@link DrillShow}. The archive bundles a binary drill document, optional show
 * audio, and asset images; only the drill document and audio are imported.
 */
export async function parseDrillPackage(
    buffer: ArrayBuffer | Uint8Array,
): Promise<DrillShow> {
    const zip = await JSZip.loadAsync(buffer);

    const documentEntry = Object.keys(zip.files).find((name) =>
        name.toLowerCase().endsWith(DOCUMENT_EXTENSION),
    );
    if (!documentEntry) {
        throw new Error("Package does not contain a drill document");
    }

    const documentBytes = await zip.files[documentEntry]!.async("uint8array");
    const document = await parseDrillDocument(documentBytes);
    const audio = await extractAudio(zip);

    return {
        title: document.title,
        performers: document.performers,
        props: document.props,
        supplemental: document.supplemental,
        sets: document.sets,
        field: document.field,
        totalCounts: document.totalCounts,
        audio,
    };
}

async function extractAudio(zip: JSZip): Promise<DrillAudio | undefined> {
    const audioEntry = Object.keys(zip.files).find((name) => {
        const lower = name.toLowerCase();
        return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
    });
    if (!audioEntry) return undefined;

    const data = await zip.files[audioEntry]!.async("uint8array");
    const name = audioEntry.split("/").pop() ?? audioEntry;
    return { name, data };
}
