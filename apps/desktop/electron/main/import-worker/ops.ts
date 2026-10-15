/**
 * The import worker's message loop as a plain function, so tests run it in
 * process on the real message contract. `index.ts` binds it to the utility
 * process's `parentPort`.
 */
import { deflateSync } from "node:zlib";
import {
    DEFAULT_TEMPLATE_POLICY,
    FLOOR_PRINT_MASTER_NOTE,
    layoutTemplate,
    resolveTemplate,
    templatePdf,
    templatePng,
    templatePngDpi,
    templateDownloadSurface,
    templateSvg,
    type TemplateSurface,
} from "../../../src/view3d/core/artworkTemplates";
import type { TemplateFormat } from "../../../src/view3d/library/protocol";
import { importModel } from "../model-import/pipeline";
import type { WorkerOps, WorkerRequest, WorkerResponse } from "./protocol";

const MIME: Record<TemplateFormat, string> = {
    svg: "image/svg+xml",
    pdf: "application/pdf",
    png: "image/png",
};

/**
 * One format of a surface's template, as `artworkTemplateFiles` makes it
 * (a test keeps the two equal) but without encoding the other two: the
 * floor PNG is the expensive one.
 */
export function templateFile(
    surface: TemplateSurface,
    format: TemplateFormat,
): WorkerOps["template"]["output"] {
    const drawing = layoutTemplate(
        resolveTemplate(surface, DEFAULT_TEMPLATE_POLICY),
    );
    let bytes: Uint8Array;
    switch (format) {
        case "svg":
            bytes = new TextEncoder().encode(templateSvg(drawing));
            break;
        case "pdf":
            bytes = templatePdf(drawing);
            break;
        case "png": {
            const comment =
                surface.process === "floor"
                    ? FLOOR_PRINT_MASTER_NOTE
                    : undefined;
            bytes = templatePng(drawing, {
                dpi: templatePngDpi(drawing),
                deflate: (data) => deflateSync(data),
                ...(comment ? { comment } : {}),
            });
            break;
        }
    }
    return {
        filename: `${surface.id}.${format}`,
        mimeType: MIME[format],
        bytes,
    };
}

/** Runs one job, posting stages as they start and then exactly one answer. */
export async function runWorkerJob(
    request: WorkerRequest,
    post: (response: WorkerResponse) => void,
): Promise<void> {
    const { jobId } = request;
    try {
        switch (request.op) {
            case "model-import": {
                const { file, kind, choices } = request.input;
                const output = await importModel(file, {
                    ...(kind ? { kind } : {}),
                    choices,
                    onStage: (stage) => post({ jobId, stage }),
                });
                post({ jobId, ok: true, output });
                return;
            }
            case "template": {
                const surface = templateDownloadSurface(
                    request.input.surfaceId,
                );
                if (!surface) {
                    post({
                        jobId,
                        ok: false,
                        error: {
                            code: "not-found",
                            message: `No template surface ${request.input.surfaceId}`,
                        },
                    });
                    return;
                }
                post({
                    jobId,
                    ok: true,
                    output: templateFile(surface, request.input.format),
                });
                return;
            }
            default:
                post({
                    jobId,
                    ok: false,
                    error: {
                        code: "failed",
                        message: `Unknown op ${String((request as { op?: unknown }).op)}`,
                    },
                });
        }
    } catch (error) {
        post({
            jobId,
            ok: false,
            error: {
                code: "failed",
                message:
                    error instanceof Error
                        ? (error.stack ?? error.message)
                        : String(error),
            },
        });
    }
}
