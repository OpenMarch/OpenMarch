import JSZip from "jszip";
import { parseDrillDocument } from "./document";
import type { DrillAudio, DrillImage, DrillShow } from "./types";

/** The inner drill document extension inside the interchange package. */
const DOCUMENT_EXTENSION = ".3dj";
const AUDIO_EXTENSIONS = [".ogg", ".wav", ".mp3", ".m4a", ".aac", ".flac"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

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
    const surface = await extractSurface(zip, document.grid.surfaceImageName);

    return {
        title: document.title,
        performers: document.performers,
        props: document.props,
        supplemental: document.supplemental,
        sets: document.sets,
        field: document.field,
        grid: document.grid,
        productionNotes: document.productionNotes,
        totalCounts: document.totalCounts,
        audioSync: document.audioSync,
        audio,
        surface,
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

/**
 * Extracts the field-surface image. Prefers the file the grid's `SRFC` token
 * names; otherwise falls back to the first bundled image. Props and figurine
 * images share these extensions, so the named match is more reliable.
 */
async function extractSurface(
    zip: JSZip,
    surfaceImageName: string | undefined,
): Promise<DrillImage | undefined> {
    const isImage = (name: string) => {
        const lower = name.toLowerCase();
        return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    };
    const named =
        surfaceImageName &&
        Object.keys(zip.files).find(
            (name) => (name.split("/").pop() ?? name) === surfaceImageName,
        );
    const entry = named || Object.keys(zip.files).find(isImage);
    if (!entry) return undefined;

    const data = await zip.files[entry]!.async("uint8array");
    const name = entry.split("/").pop() ?? entry;
    return { name, data };
}
