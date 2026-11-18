// cspell:words khronos
/**
 * Khronos `gltf-validator` on the bytes as picked (fork #998, ported from the parked pipeline).
 * Errors refuse the import; warnings become one quiet note. External resources come only from
 * the picked files: the validator is handed a lookup, never a path or a URL.
 */
import { validateBytes } from "gltf-validator";
import { resourcePathOf, type OpenedModel } from "./files";
import type { Note, Refusal } from "./types";

/** How many error messages the report keeps for the review to show */
const KEPT_MESSAGES = 10;

export async function validateModel(
    model: OpenedModel,
): Promise<{ refusal: Refusal | null; note: Note | null }> {
    // The validator may ask by the URI as written or by its normalized path
    const byPath = new Map<string, Uint8Array>();
    for (const [uri, data] of Object.entries(model.resources)) {
        const resolved = resourcePathOf(uri);
        if (resolved.ok) byPath.set(resolved.path, data);
    }
    const report = await validateBytes(model.bytes, {
        format: model.format,
        maxIssues: 0,
        writeTimestamp: false,
        externalResourceFunction: (uri) => {
            const resolved = resourcePathOf(uri);
            const data =
                model.resources[uri] ??
                (resolved.ok ? byPath.get(resolved.path) : undefined);
            return data
                ? Promise.resolve(data)
                : Promise.reject(new Error(`missing file ${uri}`));
        },
    });
    const { numErrors, numWarnings, messages } = report.issues;
    return {
        refusal:
            numErrors > 0
                ? {
                      code: "validatorErrors",
                      count: numErrors,
                      messages: messages
                          .filter((m) => m.severity === 0)
                          .slice(0, KEPT_MESSAGES)
                          .map((m) => ({
                              code: m.code,
                              message: m.message,
                              pointer: m.pointer ?? null,
                          })),
                  }
                : null,
        note:
            numWarnings > 0
                ? { code: "validatorWarnings", count: numWarnings }
                : null,
    };
}
