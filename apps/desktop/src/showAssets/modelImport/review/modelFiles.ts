/**
 * Getting a model's files from the user (fork #999): a file picker, or files dropped on the app.
 * Both read the bytes in the page, the same on desktop and the web; the import worker gets bytes,
 * never paths (#998).
 */
import { touchSafeAccept } from "@/utilities/fileAccept";
import type { PickedFile } from "../types";
import { isZip, zipHasModel } from "../zip";

/**
 * What the picker offers: a model, the buffers and pictures a `.gltf` names, or a zip of them
 * (#1168), as Sketchfab hands a glTF out
 */
export const MODEL_FILE_ACCEPT =
    ".glb,.gltf,.zip,.bin,.png,.jpg,.jpeg,.webp,.ktx2,model/gltf-binary,model/gltf+json,application/zip";

/** True when the files include a model or a zip, so a drop of them may be an import */
export const hasModelFile = (names: readonly string[]): boolean =>
    names.some((name) => /\.(glb|gltf|zip)$/i.test(name));

/**
 * Dropped files, read, when they're an import: a model among them, or a zip with one inside.
 * Null for anything else, a zip of pictures or backups included, which the drop ignores.
 */
export async function readDroppedModel(
    files: readonly File[],
): Promise<PickedFile[] | null> {
    const names = files.map((file) => file.name);
    if (!hasModelFile(names)) return null;
    const picked = await readPickedFiles(files);
    if (names.some((name) => /\.(glb|gltf)$/i.test(name))) return picked;
    return picked.some((file) => isZip(file) && zipHasModel(file.bytes))
        ? picked
        : null;
}

export async function readPickedFiles(
    files: Iterable<File>,
): Promise<PickedFile[]> {
    return Promise.all(
        [...files].map(async (file) => ({
            name: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
        })),
    );
}

/**
 * Asks for a model's files with the system's file picker. Resolves with them, or null when the
 * user picked nothing.
 */
export function pickModelFiles(): Promise<File[] | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        // iPad Safari greys out .glb and .gltf; there any file is offered and the import checks
        input.accept = touchSafeAccept(MODEL_FILE_ACCEPT);
        input.style.display = "none";
        const done = (files: File[] | null) => {
            input.remove();
            resolve(files);
        };
        input.addEventListener("change", () =>
            done(input.files?.length ? [...input.files] : null),
        );
        input.addEventListener("cancel", () => done(null));
        document.body.append(input);
        input.click();
    });
}
