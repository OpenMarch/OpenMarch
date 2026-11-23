// cspell:words khronos
/**
 * Khronos `gltf-validator` on the bytes as picked (fork #998, ported from the parked pipeline).
 * Errors refuse the import; warnings become one quiet note. Errors inside what the import drops
 * anyway (animations, and the accessors only they use) don't refuse it: Sketchfab's converter writes thousands into every
 * animated model (#1168), and the stored GLB never has them. External resources come only from
 * the picked files: the validator is handed a lookup, never a path or a URL.
 */
import { validateBytes } from "gltf-validator";
import { resourcePathOf, type OpenedModel, type RawGltf } from "./files";
import type { Note, Refusal } from "./types";

/** How many error messages the report keeps for the review to show */
const KEPT_MESSAGES = 10;

const ANIMATIONS = /^\/animations(\/|$)/;
const ACCESSOR = /^\/accessors\/(\d+)(\/|$)/;
const BUFFER_VIEW = /^\/bufferViews\/(\d+)(\/|$)/;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
const indices = (values: unknown[]): number[] =>
    values.filter((v): v is number => Number.isInteger(v));

/**
 * The accessors and buffer views only animations use: the import drops them with the
 * animations. Anything else that names one (a mesh, a skin, instancing) keeps it.
 */
function animationOnly(json: RawGltf): {
    accessors: Set<number>;
    views: Set<number>;
} {
    const animated = new Set(
        indices(
            list(record(json).animations).flatMap((animation) =>
                list(record(animation).samplers).flatMap((sampler) => [
                    record(sampler).input,
                    record(sampler).output,
                ]),
            ),
        ),
    );
    const kept = new Set(
        indices([
            ...list(json.meshes).flatMap((mesh) =>
                list(record(mesh).primitives).flatMap((prim) => [
                    ...Object.values(record(record(prim).attributes)),
                    record(prim).indices,
                    ...list(record(prim).targets).flatMap((target) =>
                        Object.values(record(target)),
                    ),
                ]),
            ),
            ...list(record(json).skins).map(
                (skin) => record(skin).inverseBindMatrices,
            ),
            ...list(json.nodes).flatMap((node) =>
                Object.values(
                    record(
                        record(
                            record(record(node).extensions)
                                .EXT_mesh_gpu_instancing,
                        ).attributes,
                    ),
                ),
            ),
        ]),
    );
    const accessors = new Set([...animated].filter((i) => !kept.has(i)));
    const animationViews = new Set<number>();
    // Pictures and compressed meshes read buffer views directly
    const keptViews = new Set(
        indices([
            ...list(json.images).map((image) => record(image).bufferView),
            ...list(json.meshes).flatMap((mesh) =>
                list(record(mesh).primitives).map(
                    (prim) =>
                        record(
                            record(record(prim).extensions)
                                .KHR_draco_mesh_compression,
                        ).bufferView,
                ),
            ),
        ]),
    );
    list(json.accessors).forEach((accessor, i) => {
        const sparse = record(record(accessor).sparse);
        const views = indices([
            record(accessor).bufferView,
            record(sparse.indices).bufferView,
            record(sparse.values).bufferView,
        ]);
        for (const view of views)
            (accessors.has(i) ? animationViews : keptViews).add(view);
    });
    return {
        accessors,
        views: new Set([...animationViews].filter((v) => !keptViews.has(v))),
    };
}

/**
 * A test for errors the import drops along with the content they're in: in the animations, or
 * in an accessor or buffer view only they use
 */
export function droppedContent(
    json: RawGltf,
): (pointer: string | undefined) => boolean {
    let only: ReturnType<typeof animationOnly> | null = null;
    return (pointer) => {
        if (pointer === undefined) return false;
        if (ANIMATIONS.test(pointer)) return true;
        const accessor = ACCESSOR.exec(pointer);
        const view = BUFFER_VIEW.exec(pointer);
        if (!accessor && !view) return false;
        only ??= animationOnly(json);
        return accessor
            ? only.accessors.has(Number(accessor[1]))
            : only.views.has(Number(view![1]));
    };
}

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
    const { numWarnings, messages } = report.issues;
    const dropped = droppedContent(model.json);
    const errors: typeof messages = [];
    let droppedErrors = 0;
    for (const m of messages) {
        if (m.severity !== 0) continue;
        if (dropped(m.pointer)) droppedErrors += 1;
        else errors.push(m);
    }
    const warnings = numWarnings + droppedErrors;
    return {
        refusal:
            errors.length > 0
                ? {
                      code: "validatorErrors",
                      count: errors.length,
                      messages: errors.slice(0, KEPT_MESSAGES).map((m) => ({
                          code: m.code,
                          message: m.message,
                          pointer: m.pointer ?? null,
                      })),
                  }
                : null,
        note:
            warnings > 0
                ? { code: "validatorWarnings", count: warnings }
                : null,
    };
}
