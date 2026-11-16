/**
 * Artwork template downloads (docs/3d/props-spec.md §3 "Artwork size and
 * templates", ADR 0010 D-16): PNG, SVG and PDF at size. Ported from
 * `archive/pre-convergence` for silks only (fork #973). Safe to import from
 * the renderer and from main.
 */
import { layoutTemplate, type TemplateDrawing } from "./layout";
import { templatePdf } from "./pdf";
import {
    DEFAULT_TEMPLATE_POLICY,
    resolveTemplate,
    type TemplatePolicy,
} from "./policy";
import {
    templatePng,
    templatePngAsync,
    templatePngDpi,
    type PngOptions,
} from "./png";
import { templateSvg } from "./svg";
import { FLOOR_PRINT_MASTER_NOTE, type TemplateSurface } from "./surfaces";

export * from "./surfaces";
export * from "./policy";
export * from "./layout";
export * from "./svg";
export * from "./pdf";
export * from "./png";

export type TemplateFormat = "svg" | "pdf" | "png";

export interface TemplateFile {
    readonly name: string;
    readonly mimeType: string;
    readonly data: string | Uint8Array;
}

export interface TemplateFileOptions {
    /** zlib-wrapped deflate (RFC 1950), such as Node's `zlib.deflateSync`. */
    readonly deflate: PngOptions["deflate"];
    /** Defaults to `DEFAULT_TEMPLATE_POLICY`. */
    readonly policy?: TemplatePolicy;
    /** The PNG's DPI; defaults to `templatePngDpi` (Q31). */
    readonly pngDpi?: number;
}

/** A surface's drawing under a policy, ready for any writer. */
export function templateDrawing(
    surface: TemplateSurface,
    policy: TemplatePolicy = DEFAULT_TEMPLATE_POLICY,
): TemplateDrawing {
    return layoutTemplate(resolveTemplate(surface, policy));
}

const MIME: Readonly<Record<TemplateFormat, string>> = {
    svg: "image/svg+xml",
    pdf: "application/pdf",
    png: "image/png",
};

const pngComment = (surface: TemplateSurface) =>
    surface.process === "floor" ? FLOOR_PRINT_MASTER_NOTE : undefined;

/**
 * A surface's template as SVG, PDF and PNG, named after the surface. A
 * floor's PNG carries the note that the PDF or SVG is the print master.
 */
export function artworkTemplateFiles(
    surface: TemplateSurface,
    options: TemplateFileOptions,
): TemplateFile[] {
    const drawing = templateDrawing(surface, options.policy);
    const comment = pngComment(surface);
    return [
        {
            name: `${surface.id}.svg`,
            mimeType: MIME.svg,
            data: templateSvg(drawing),
        },
        {
            name: `${surface.id}.pdf`,
            mimeType: MIME.pdf,
            data: templatePdf(drawing),
        },
        {
            name: `${surface.id}.png`,
            mimeType: MIME.png,
            data: templatePng(drawing, {
                dpi: options.pngDpi ?? templatePngDpi(drawing),
                deflate: options.deflate,
                ...(comment ? { comment } : {}),
            }),
        },
    ];
}

/**
 * One format of a surface's template, with a deflate that answers later
 * (the renderer's `CompressionStream`), for a download button.
 */
export async function artworkTemplateFile(
    surface: TemplateSurface,
    format: TemplateFormat,
    deflate: (data: Uint8Array) => Promise<Uint8Array>,
    policy: TemplatePolicy = DEFAULT_TEMPLATE_POLICY,
): Promise<TemplateFile> {
    const drawing = templateDrawing(surface, policy);
    const name = `${surface.id}.${format}`;
    if (format === "svg")
        return { name, mimeType: MIME.svg, data: templateSvg(drawing) };
    if (format === "pdf")
        return { name, mimeType: MIME.pdf, data: templatePdf(drawing) };
    const comment = pngComment(surface);
    return {
        name,
        mimeType: MIME.png,
        data: await templatePngAsync(drawing, {
            dpi: templatePngDpi(drawing),
            deflate,
            ...(comment ? { comment } : {}),
        }),
    };
}
