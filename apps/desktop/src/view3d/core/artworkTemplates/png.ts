/**
 * Rasterizes a template drawing to an indexed PNG at size: its pixel size is
 * the page at the chosen DPI, and its `pHYs` chunk records that density so
 * importers read the physical size back. Text isn't drawn (there is no font
 * here); the SVG and PDF carry the labels.
 *
 * `pHYs` stores whole pixels per meter, so for a DPI that isn't a whole
 * number of pixels per meter (300 DPI is 11,811.02) the stored density is the
 * nearest whole value and the size read back differs by under 0.01%.
 *
 * Deflate is passed in, so this stays platform-free: main passes
 * `zlib.deflateSync`.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words rasterizes ihdr plte idat iend
import { METERS_PER_INCH } from "../sizes/units";
import { FLOOR_PNG_MAX_PX } from "./surfaces";
import {
    TEMPLATE_COLORS,
    lineSegments,
    type Ring,
    type TemplateColor,
    type TemplateDrawing,
} from "./layout";

export interface PngOptions {
    readonly dpi: number;
    /** zlib-wrapped deflate (RFC 1950), such as Node's `zlib.deflateSync`. */
    readonly deflate: (data: Uint8Array) => Uint8Array;
    /** Written as a `tEXt` "Comment"; printable ASCII only. */
    readonly comment?: string;
}

/**
 * The DPI a template's PNG is written at (Q31): the surface's minimum print
 * DPI, except that a floor or Floor prop is capped so the page's long edge
 * is at most `FLOOR_PNG_MAX_PX` pixels.
 */
export function templatePngDpi(d: TemplateDrawing): number {
    const dpi = d.surface.dpi.minimum;
    if (d.surface.process !== "floor") return dpi;
    const longIn = Math.max(d.widthM, d.heightM) / METERS_PER_INCH;
    return Math.min(dpi, FLOOR_PNG_MAX_PX / longIn);
}

const PALETTE = Object.keys(TEMPLATE_COLORS) as TemplateColor[];

/** The PNG's pixel size for a drawing at a DPI. */
export function pngSize(
    d: TemplateDrawing,
    dpi: number,
): { width: number; height: number } {
    const perM = dpi / METERS_PER_INCH;
    return {
        width: Math.max(1, Math.round(d.widthM * perM)),
        height: Math.max(1, Math.round(d.heightM * perM)),
    };
}

/** A filled job: polygons in pixels, painted with the even-odd rule. */
interface Fill {
    readonly rings: readonly Ring[];
    readonly index: number;
    readonly minY: number;
    readonly maxY: number;
}

function quad(a: readonly number[], b: readonly number[], half: number): Ring {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    return [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
    ];
}

function fillOf(rings: readonly Ring[], index: number): Fill {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of rings)
        for (const [, y] of ring) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    return { rings, index, minY, maxY };
}

function fillsFor(d: TemplateDrawing, perM: number): Fill[] {
    const px = (ring: Ring): Ring => ring.map(([x, y]) => [x * perM, y * perM]);
    const fills: Fill[] = [];
    for (const shape of d.shapes) {
        if (shape.type === "area")
            fills.push(
                fillOf(shape.rings.map(px), PALETTE.indexOf(shape.fill)),
            );
        else if (shape.type === "line") {
            // At least one pixel wide, so a hairline still shows.
            const half = Math.max(1, shape.widthM * perM) / 2;
            const index = PALETTE.indexOf(shape.stroke);
            for (const [a, b] of lineSegments(
                shape.points,
                shape.closed,
                shape.dashM,
            ))
                fills.push(
                    fillOf(
                        [
                            quad(
                                [a[0] * perM, a[1] * perM],
                                [b[0] * perM, b[1] * perM],
                                half,
                            ),
                        ],
                        index,
                    ),
                );
        }
    }
    return fills;
}

function paintRow(
    row: Uint8Array,
    offset: number,
    width: number,
    yc: number,
    fill: Fill,
): void {
    if (yc < fill.minY || yc > fill.maxY) return;
    const xs: number[] = [];
    for (const ring of fill.rings)
        for (let i = 0; i < ring.length; i++) {
            const [x0, y0] = ring[i];
            const [x1, y1] = ring[(i + 1) % ring.length];
            const above0 = y0 <= yc;
            const above1 = y1 <= yc;
            if (above0 !== above1)
                xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
        }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
        // Pixels whose centers fall inside the span.
        const from = Math.max(0, Math.ceil(xs[i] - 0.5));
        const to = Math.min(width, Math.ceil(xs[i + 1] - 0.5));
        row.fill(fill.index, offset + from, offset + to);
    }
}

// ---------------------------------------------------------------- encoding

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

function u32s(...values: number[]): Uint8Array {
    const out = new Uint8Array(values.length * 4);
    const view = new DataView(out.buffer);
    values.forEach((v, i) => view.setUint32(i * 4, v));
    return out;
}

/** A `tEXt` chunk's data: the "Comment" keyword, a null, then the text. */
function textData(text: string): Uint8Array {
    if (!/^[\x20-\x7e]*$/.test(text))
        throw new Error("PNG comment must be printable ASCII");
    const body = `Comment\0${text}`;
    return Uint8Array.from(body, (c) => c.charCodeAt(0));
}

export function templatePng(
    d: TemplateDrawing,
    options: PngOptions,
): Uint8Array {
    const { dpi } = options;
    if (!(dpi > 0)) throw new Error("PNG DPI must be positive");
    const perM = dpi / METERS_PER_INCH;
    const { width, height } = pngSize(d, dpi);
    const fills = fillsFor(d, perM);

    const stride = width + 1; // a filter byte per row
    const raw = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const offset = y * stride + 1; // filter byte 0: none
        for (const fill of fills) paintRow(raw, offset, width, y + 0.5, fill);
    }

    const ihdr = new Uint8Array(13);
    ihdr.set(u32s(width, height));
    ihdr.set([8, 3, 0, 0, 0], 8); // 8-bit, indexed, deflate, adaptive, no interlace
    const plte = new Uint8Array(PALETTE.length * 3);
    PALETTE.forEach((name, i) => plte.set(TEMPLATE_COLORS[name], i * 3));
    const ppm = Math.round(perM);
    const phys = new Uint8Array(9);
    phys.set(u32s(ppm, ppm));
    phys[8] = 1; // unit: meter

    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("PLTE", plte),
        chunk("pHYs", phys),
        ...(options.comment ? [chunk("tEXt", textData(options.comment))] : []),
        chunk("IDAT", options.deflate(raw)),
        chunk("IEND", new Uint8Array(0)),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}
