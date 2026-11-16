/**
 * Getting a model's files from the user (fork #999): a file picker, or files dropped on the app.
 * Both read the bytes in the page, the same on desktop and the web; the import worker gets bytes,
 * never paths (#998).
 */
import type { PickedFile } from "../types";

/** What the picker offers: a model, and the buffers and pictures a `.gltf` names */
export const MODEL_FILE_ACCEPT =
    ".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,model/gltf-binary,model/gltf+json";

/** True when the files include a model, so a drop of them is an import */
export const hasModelFile = (names: readonly string[]): boolean =>
    names.some((name) => /\.(glb|gltf)$/i.test(name));

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
        input.accept = MODEL_FILE_ACCEPT;
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
