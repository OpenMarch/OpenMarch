/**
 * Artwork template downloads (docs/3d/props-spec.md §3 "Artwork size and
 * templates", ADR 0002 D-16, package C1.12): PNG, SVG and PDF at size for
 * every surface kind. Safe to import from the renderer and from main.
 */
import { layoutTemplate } from "./layout";
import { templatePdf } from "./pdf";
import {
    DEFAULT_TEMPLATE_POLICY,
    resolveTemplate,
    type TemplatePolicy,
} from "./policy";
import { templatePng, templatePngDpi, type PngOptions } from "./png";
import { templateSvg } from "./svg";
import { FLOOR_PRINT_MASTER_NOTE, type TemplateSurface } from "./surfaces";

export * from "./surfaces";
export * from "./downloads";
export * from "./uniformPanels";
export * from "./policy";
export * from "./layout";
export * from "./svg";
export * from "./pdf";
export * from "./png";

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

/**
 * A surface's template as SVG, PDF and PNG, named after the surface. A
 * floor's PNG carries the note that the PDF or SVG is the print master.
 */
export function artworkTemplateFiles(
    surface: TemplateSurface,
    options: TemplateFileOptions,
): TemplateFile[] {
    const policy = options.policy ?? DEFAULT_TEMPLATE_POLICY;
    const drawing = layoutTemplate(resolveTemplate(surface, policy));
    const comment =
        surface.process === "floor" ? FLOOR_PRINT_MASTER_NOTE : undefined;
    return [
        {
            name: `${surface.id}.svg`,
            mimeType: "image/svg+xml",
            data: templateSvg(drawing),
        },
        {
            name: `${surface.id}.pdf`,
            mimeType: "application/pdf",
            data: templatePdf(drawing),
        },
        {
            name: `${surface.id}.png`,
            mimeType: "image/png",
            data: templatePng(drawing, {
                dpi: options.pngDpi ?? templatePngDpi(drawing),
                deflate: options.deflate,
                ...(comment ? { comment } : {}),
            }),
        },
    ];
}
