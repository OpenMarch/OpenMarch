// cspell:words khronos
/**
 * The first step of the pipeline: Khronos `gltf-validator` on the bytes as
 * picked. Errors block the import; warnings become one quiet note
 * (ADR 0002 D-13).
 */
import { validateBytes } from "gltf-validator";

export interface ValidationResult {
    errors: { code: string; message: string; pointer?: string }[];
    errorCount: number;
    warningCount: number;
}

/** How many error messages the report keeps for the review to show. */
const KEPT_MESSAGES = 10;

export async function validateModel(
    bytes: Uint8Array,
    format: "glb" | "gltf",
    resources: Readonly<Record<string, Uint8Array>>,
): Promise<ValidationResult> {
    const report = await validateBytes(bytes, {
        format,
        maxIssues: 0,
        writeTimestamp: false,
        externalResourceFunction: (uri) => {
            const data = resources[uri] ?? resources[decodedOrSelf(uri)];
            return data
                ? Promise.resolve(data)
                : Promise.reject(new Error(`missing resource ${uri}`));
        },
    });
    const errors = report.issues.messages
        .filter((m) => m.severity === 0)
        .slice(0, KEPT_MESSAGES)
        .map((m) => ({
            code: m.code,
            message: m.message,
            ...(m.pointer ? { pointer: m.pointer } : {}),
        }));
    return {
        errors,
        errorCount: report.issues.numErrors,
        warningCount: report.issues.numWarnings,
    };
}

/** `uri` percent-decoded, or as written when it isn't valid encoding. */
function decodedOrSelf(uri: string): string {
    try {
        return decodeURIComponent(uri);
    } catch {
        return uri;
    }
}
