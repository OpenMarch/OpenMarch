// cspell:words IHDR IDAT IEND zlib
/**
 * A minimal PNG encoder for RGBA pixels: no filtering, zlib from `CompressionStream`. The same
 * pixels give the same bytes in the import worker, the web editor and Node, so a thumbnail never
 * makes a re-import a new Version.
 */

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
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
        .stream()
        .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `rgba` (width × height × 4 bytes, rows top to bottom) as PNG bytes. */
export async function encodePng(
    rgba: Uint8Array,
    width: number,
    height: number,
): Promise<Uint8Array> {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8; // bits per channel
    header[9] = 6; // RGBA
    // Each row starts with filter type 0 (none)
    const raw = new Uint8Array(height * (width * 4 + 1));
    for (let y = 0; y < height; y++)
        raw.set(
            rgba.subarray(y * width * 4, (y + 1) * width * 4),
            y * (width * 4 + 1) + 1,
        );
    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", await deflate(raw)),
        chunk("IEND", new Uint8Array(0)),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
