/**
 * Writes a template drawing as SVG at size: `width` and `height` carry the
 * page's physical size in the surface's unit (inches or millimeters), and the
 * view box uses the same unit, so one user unit is one inch or millimeter.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { fromMeters } from "../sizes/units";
import {
    TEMPLATE_COLORS,
    type Ring,
    type TemplateColor,
    type TemplateDrawing,
} from "./layout";

/** Meters to the drawing unit, as a short exact-enough number. */
export function svgNumber(m: number, unit: "in" | "mm"): string {
    const value = unit === "in" ? fromMeters(m, "in") : fromMeters(m, "mm");
    return String(Number(value.toFixed(6)));
}

function color(name: TemplateColor): string {
    const [r, g, b] = TEMPLATE_COLORS[name];
    return `rgb(${r},${g},${b})`;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function templateSvg(d: TemplateDrawing): string {
    const unit = d.surface.unit;
    const n = (m: number) => svgNumber(m, unit);
    const pts = (ring: Ring) =>
        ring.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
    const path = (ring: Ring) =>
        `M${ring.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
    const W = n(d.widthM);
    const H = n(d.heightM);

    const body = d.shapes.map((shape) => {
        switch (shape.type) {
            case "area":
                return `<path d="${shape.rings.map(path).join("")}" fill="${color(shape.fill)}" fill-rule="evenodd"/>`;
            case "line": {
                const tag = shape.closed ? "polygon" : "polyline";
                const dash = shape.dashM
                    ? ` stroke-dasharray="${n(shape.dashM)} ${n(shape.dashM)}"`
                    : "";
                return `<${tag} points="${pts(shape.points)}" fill="none" stroke="${color(shape.stroke)}" stroke-width="${n(shape.widthM)}"${dash}/>`;
            }
            default: // text
                return `<text x="${n(shape.x)}" y="${n(shape.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(shape.sizeM)}" fill="${color(shape.fill)}">${escapeXml(shape.text)}</text>`;
        }
    });

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}${unit}" height="${H}${unit}" viewBox="0 0 ${W} ${H}">`,
        `<title>${escapeXml(d.surface.name)} Artwork template</title>`,
        `<desc>Trim ${n(d.trim.width)} x ${n(d.trim.height)} ${unit} at offset ${n(d.trim.x)} ${unit}. Template released under CC0 1.0.</desc>`,
        ...body,
        `</svg>`,
        ``,
    ].join("\n");
}
