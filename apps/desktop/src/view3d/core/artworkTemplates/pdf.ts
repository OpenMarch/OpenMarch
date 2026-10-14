/**
 * Writes a template drawing as a one-page vector PDF at size. The MediaBox and
 * BleedBox are the page (trim plus bleed) and the TrimBox is the trim, so
 * print tools read the bleed directly.
 *
 * PDF pages are limited to 14,400 units on a side; a larger page, such as a
 * Base floor, sets `/UserUnit` (PDF 1.6) so the page still measures its real
 * size.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words startxref nstartxref nendobj
import { fromMeters } from "../sizes/units";
import {
    TEMPLATE_COLORS,
    type Ring,
    type TemplateColor,
    type TemplateDrawing,
} from "./layout";

/** The largest page side PDF allows, in default user units (1/72 in). */
export const PDF_MAX_PAGE_UNITS = 14400;

function num(value: number): string {
    return String(Number(value.toFixed(4)));
}

function rgb(name: TemplateColor): string {
    return TEMPLATE_COLORS[name].map((c) => num(c / 255)).join(" ");
}

/** Text in a PDF literal string, folded to printable ASCII. */
function pdfString(text: string): string {
    const ascii = text
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/×/g, "x")
        .replace(/[^\x20-\x7e]/g, "?");
    return `(${ascii.replace(/([\\()])/g, "\\$1")})`;
}

export function templatePdf(d: TemplateDrawing): Uint8Array {
    const pointsPerM = (m: number) => fromMeters(m, "in") * 72;
    const longest = Math.max(pointsPerM(d.widthM), pointsPerM(d.heightM));
    const userUnit =
        longest > PDF_MAX_PAGE_UNITS
            ? Math.ceil(longest / PDF_MAX_PAGE_UNITS)
            : 1;
    const u = (m: number) => pointsPerM(m) / userUnit;
    const pageW = u(d.widthM);
    const pageH = u(d.heightM);
    const X = (x: number) => num(u(x));
    const Y = (y: number) => num(pageH - u(y));
    const path = (ring: Ring) =>
        ring
            .map(([x, y], i) => `${X(x)} ${Y(y)} ${i === 0 ? "m" : "l"}`)
            .join("\n") + "\nh";

    const ops: string[] = [];
    for (const shape of d.shapes) {
        switch (shape.type) {
            case "area":
                ops.push(
                    `${rgb(shape.fill)} rg`,
                    ...shape.rings.map(path),
                    "f*",
                );
                break;
            case "line": {
                const p = shape.points
                    .map(
                        ([x, y], i) => `${X(x)} ${Y(y)} ${i === 0 ? "m" : "l"}`,
                    )
                    .join("\n");
                ops.push(
                    `${rgb(shape.stroke)} RG`,
                    `${num(u(shape.widthM))} w`,
                    shape.dashM ? `[${num(u(shape.dashM))}] 0 d` : "[] 0 d",
                    p,
                    shape.closed ? "s" : "S",
                );
                break;
            }
            case "text":
                ops.push(
                    `${rgb(shape.fill)} rg`,
                    `BT /F1 ${num(u(shape.sizeM))} Tf ${X(shape.x)} ${Y(shape.y)} Td ${pdfString(shape.text)} Tj ET`,
                );
                break;
        }
    }
    const content = ops.join("\n");

    const page = `0 0 ${num(pageW)} ${num(pageH)}`;
    const trim = [
        X(d.trim.x),
        num(pageH - u(d.trim.y + d.trim.height)),
        X(d.trim.x + d.trim.width),
        num(pageH - u(d.trim.y)),
    ].join(" ");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        `<< /Type /Page /Parent 2 0 R /MediaBox [${page}] /BleedBox [${page}] /TrimBox [${trim}]` +
            (userUnit === 1 ? "" : ` /UserUnit ${userUnit}`) +
            " /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        `<< /Title ${pdfString(`${d.surface.name} Artwork template`)} /Subject (Released under CC0 1.0) >>`,
    ];

    let out = "%PDF-1.6\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets)
        out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    return asciiBytes(out);
}

/** ASCII text as bytes: one character is one byte. */
function asciiBytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
}
