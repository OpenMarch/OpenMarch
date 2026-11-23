// cspell:words fflate
/**
 * A picked `.zip`, opened into the files inside it (#1168): Sketchfab and most model sites hand
 * out a glTF as a zip of `scene.gltf`, `scene.bin` and a `textures/` folder, which a file picker
 * can't select in one go. Each entry becomes a picked file named by its path in the zip, so
 * `textures/wood.png` resolves exactly.
 *
 * Only the files a glTF can name are decoded: a model site's zip often carries the model's
 * sources too (`.blend`, `.fbx`), which the import never reads and shouldn't count against it.
 *
 * Bytes in, bytes out, like the rest of the import (ADR 0010 amendment 2026-11-15): nothing is
 * written anywhere. fflate decodes a compressed entry into a buffer of the size its header
 * declares and never past it, and copies a stored one by its stored size, so adding up the
 * larger of the two before decoding bounds the memory a zip costs however it lies (a zip bomb
 * gets cut short and then fails to read as a model). fflate still inflates the whole stream, so
 * the zip's own size is capped too, and so is how many entries it may list: its directory can
 * claim billions.
 */
import { unzipSync } from "fflate";
import { RefusedError } from "./files";
import { MAX_IMPORT_BYTES } from "./rules";
import type { PickedFile } from "./types";

/** More entries than this is no model download */
export const MAX_ZIP_ENTRIES = 5_000;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\3\4"

/** What a glTF and the files it names can be; any other entry is never decoded */
const MODEL_ENTRY = /\.(glb|gltf|bin|png|jpe?g|webp|ktx2)$/i;

const MODEL_FILE = /\.(glb|gltf)$/i;

/** A `.zip`, or a file with no known extension that starts like one */
export function isZip(file: PickedFile): boolean {
    if (/\.zip$/i.test(file.name)) return true;
    if (MODEL_ENTRY.test(file.name)) return false;
    return ZIP_MAGIC.every((byte, i) => file.bytes[i] === byte);
}

/** An entry's path with `/` between folders and no leading `./`, as Windows zips may not have */
const entryPath = (name: string) =>
    name.replace(/\\/g, "/").replace(/^(\.\/)+/, "");

/** Entries that are never part of a model: folders, macOS metadata and hidden files */
function skipped(path: string): boolean {
    if (path.endsWith("/")) return true;
    const parts = path.split("/").filter((part) => part !== ".");
    return (
        parts[0] === "__MACOSX" ||
        parts.some((part) => part.startsWith(".") && part !== "..")
    );
}

const tooManyEntries = () =>
    new RefusedError({
        code: "unreadable",
        reason: `the zip lists more than ${MAX_ZIP_ENTRIES} files`,
    });

/**
 * The picked files with every zip opened in place, and the name of the zip the model came from
 * (for a title better than `scene`). Throws `RefusedError` for a zip that's too large once
 * opened, or that can't be read.
 */
export function openZips(
    files: readonly PickedFile[],
    limit = MAX_IMPORT_BYTES,
): {
    files: PickedFile[];
    zipName: string | null;
    /** The zips' other entries, never decoded: named when no model is found */
    skipped: string[];
} {
    if (!files.some(isZip))
        return { files: [...files], zipName: null, skipped: [] };
    // What the opened files will hold, checked entry by entry before each is decoded
    const total = {
        bytes: files
            .filter((f) => !isZip(f))
            .reduce((n, f) => n + f.bytes.byteLength, 0),
        entries: 0,
    };
    const out: PickedFile[] = [];
    const skippedEntries: string[] = [];
    let zipName: string | null = null;
    for (const file of files) {
        if (!isZip(file)) {
            out.push(file);
            continue;
        }
        if (file.bytes.byteLength > limit)
            throw new RefusedError({
                code: "tooLarge",
                bytes: file.bytes.byteLength,
                limit,
            });
        zipName ??= file.name.replace(/\.zip$/i, "");
        let opened: Record<string, Uint8Array>;
        try {
            opened = unzipSync(file.bytes, {
                filter: (entry) => {
                    const path = entryPath(entry.name);
                    if (skipped(path)) return false;
                    total.entries += 1;
                    if (total.entries > MAX_ZIP_ENTRIES) throw tooManyEntries();
                    if (!MODEL_ENTRY.test(path)) {
                        skippedEntries.push(path);
                        return false;
                    }
                    total.bytes += Math.max(entry.size, entry.originalSize);
                    if (total.bytes > limit)
                        throw new RefusedError({
                            code: "tooLarge",
                            bytes: total.bytes,
                            limit,
                        });
                    return true;
                },
            });
        } catch (error) {
            if (error instanceof RefusedError) throw error;
            throw new RefusedError({
                code: "unreadable",
                reason: `the zip can't be opened (${error instanceof Error ? error.message : String(error)})`,
            });
        }
        for (const [name, data] of Object.entries(opened))
            out.push({ name: entryPath(name), bytes: data });
    }
    return { files: out, zipName, skipped: skippedEntries };
}

/**
 * True when a zip names a model file, read from its directory without decoding anything: a zip
 * dropped on the window is an import only then.
 */
export function zipHasModel(bytes: Uint8Array): boolean {
    let found = false;
    let entries = 0;
    try {
        unzipSync(bytes, {
            filter: (entry) => {
                const path = entryPath(entry.name);
                if (++entries > MAX_ZIP_ENTRIES) throw tooManyEntries();
                if (!skipped(path) && MODEL_FILE.test(path)) found = true;
                return false;
            },
        });
    } catch {
        return false;
    }
    return found;
}
