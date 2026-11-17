// cspell:words Fetc Fpasswd fwood
// @vitest-environment node
// cspell:words VP8L VP8X IHDR
import { describe, expect, it } from "vitest";
import { resourcePathOf } from "../files";
import { readImageHeader } from "../imageSize";
import { encodePng } from "../png";
import { ktx2Header, pngHeaderOnly } from "./fixtures";

describe("resourcePathOf", () => {
    it.each([
        ["wood.png", "wood.png"],
        ["textures/wood.png", "textures/wood.png"],
        ["./textures/../wood.png", "wood.png"],
        ["my%20wood.png", "my wood.png"],
    ])("follows %s", (uri, path) => {
        expect(resourcePathOf(uri)).toEqual({ ok: true, path });
    });

    it.each([
        ["https://example.com/wood.png", "externalUri"],
        ["file:///etc/passwd", "externalUri"],
        ["blob:https://example.com/123", "externalUri"],
        ["https%3A//example.com/wood.png", "externalUri"],
        ["../wood.png", "outsidePickedFiles"],
        ["textures/../../wood.png", "outsidePickedFiles"],
        ["/etc/passwd", "outsidePickedFiles"],
        ["C:/wood.png", "outsidePickedFiles"],
        ["c:wood.png", "outsidePickedFiles"],
        ["textures\\wood.png", "outsidePickedFiles"],
        ["%2e%2e%2fwood.png", "outsidePickedFiles"],
        ["%2Fetc%2Fpasswd", "outsidePickedFiles"],
        ["%", "outsidePickedFiles"],
    ])("refuses %s", (uri, code) => {
        expect(resourcePathOf(uri)).toEqual({
            ok: false,
            refusal: { code, uri },
        });
    });
});

describe("readImageHeader", () => {
    it("reads PNG", async () => {
        const png = await encodePng(new Uint8Array(3 * 2 * 4), 3, 2);
        expect(readImageHeader(png)).toEqual({
            mimeType: "image/png",
            width: 3,
            height: 2,
        });
        expect(readImageHeader(pngHeaderOnly(16384, 9000))).toMatchObject({
            width: 16384,
            height: 9000,
        });
    });

    it("reads JPEG from its first frame marker, past APP segments", () => {
        const jpeg = new Uint8Array([
            0xff,
            0xd8, // SOI
            0xff,
            0xe0,
            0x00,
            0x04,
            0x00,
            0x00, // APP0, 2 bytes of data
            0xff,
            0xc2,
            0x00,
            0x0b,
            0x08,
            0x02,
            0x00,
            0x04,
            0x00,
            0x03, // SOF2: 512 × 1024
        ]);
        expect(readImageHeader(jpeg)).toEqual({
            mimeType: "image/jpeg",
            width: 1024,
            height: 512,
        });
    });

    it("reads WebP (lossy, lossless and extended)", () => {
        const webp = (chunk: string, body: number[]) => {
            const out = new Uint8Array(30 + 10);
            out.set([...new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`)]);
            out.set(body, 20);
            return out;
        };
        // VP8: width and height at 26 and 28
        expect(
            readImageHeader(
                webp(
                    "VP8 ",
                    [0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x04, 0x00, 0x02],
                ),
            ),
        ).toMatchObject({ width: 1024, height: 512 });
        // VP8L: 14-bit width-1 and height-1 after the 0x2f signature at 20
        const bits = (1023 & 0x3fff) | ((511 & 0x3fff) << 14);
        expect(
            readImageHeader(
                webp("VP8L", [
                    0x2f,
                    bits & 0xff,
                    (bits >> 8) & 0xff,
                    (bits >> 16) & 0xff,
                    (bits >> 24) & 0xff,
                ]),
            ),
        ).toMatchObject({ width: 1024, height: 512 });
        // VP8X: 24-bit width-1 and height-1 at 24 and 27
        expect(
            readImageHeader(
                webp("VP8X", [0, 0, 0, 0, 0xff, 0x1f, 0x00, 0xff, 0x0f, 0x00]),
            ),
        ).toMatchObject({ width: 8192, height: 4096 });
    });

    it("reads KTX2", () => {
        expect(readImageHeader(ktx2Header(2048, 1024))).toEqual({
            mimeType: "image/ktx2",
            width: 2048,
            height: 1024,
        });
    });

    it("gives null for anything else", () => {
        expect(readImageHeader(new TextEncoder().encode("GIF89a"))).toBeNull();
        expect(readImageHeader(new Uint8Array([0x89, 0x50]))).toBeNull();
    });
});
