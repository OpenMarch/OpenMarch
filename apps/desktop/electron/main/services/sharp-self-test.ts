import { writeFile } from "node:fs/promises";

/**
 * Packaging check for `sharp`, the main process's first native dependency
 * (ADR 0002 D-14). It resizes a 2048² image to 512² the way Artwork and
 * model imports will, so a packaged build on each platform can prove that
 * sharp and libvips load from `app.asar.unpacked` and run.
 *
 * Run a packaged build with `OPENMARCH_SHARP_SELF_TEST=<path to a .json file>`.
 * The app writes the result there and exits instead of opening a window: exit
 * code 0 when the resize produced a 512² PNG, 1 otherwise.
 */
export const SHARP_SELF_TEST_ENV = "OPENMARCH_SHARP_SELF_TEST";

const SOURCE_SIZE = 2048;
const TARGET_SIZE = 512;

export interface SharpSelfTestResult {
    ok: boolean;
    /** Where sharp resolved from, to show it ran from the packaged app. */
    sharpPath?: string;
    sharpVersion?: string;
    libvipsVersion?: string;
    platform: string;
    arch: string;
    importMs?: number;
    encodeMs?: number;
    resizeMs?: number;
    output?: { width?: number; height?: number; format?: string };
    error?: string;
}

const msSince = (start: number) =>
    Math.round((performance.now() - start) * 10) / 10;

/** A 2048² RGB gradient, so the resize has real detail to filter. */
function sourcePixels(): Buffer {
    const pixels = Buffer.alloc(SOURCE_SIZE * SOURCE_SIZE * 3);
    for (let y = 0; y < SOURCE_SIZE; y++) {
        for (let x = 0; x < SOURCE_SIZE; x++) {
            const i = (y * SOURCE_SIZE + x) * 3;
            pixels[i] = x & 0xff;
            pixels[i + 1] = y & 0xff;
            pixels[i + 2] = (x ^ y) & 0xff;
        }
    }
    return pixels;
}

export async function runSharpSelfTest(): Promise<SharpSelfTestResult> {
    const base = { platform: process.platform, arch: process.arch };
    try {
        let start = performance.now();
        const { default: sharp } = await import("sharp");
        const importMs = msSince(start);

        start = performance.now();
        const png = await sharp(sourcePixels(), {
            raw: { width: SOURCE_SIZE, height: SOURCE_SIZE, channels: 3 },
        })
            .png()
            .toBuffer();
        const encodeMs = msSince(start);

        start = performance.now();
        const resized = await sharp(png)
            .resize(TARGET_SIZE, TARGET_SIZE)
            .png()
            .toBuffer();
        const resizeMs = msSince(start);

        const { width, height, format } = await sharp(resized).metadata();
        return {
            ...base,
            ok:
                width === TARGET_SIZE &&
                height === TARGET_SIZE &&
                format === "png",
            sharpPath: require.resolve("sharp"),
            sharpVersion: sharp.versions.sharp,
            libvipsVersion: sharp.versions.vips,
            importMs,
            encodeMs,
            resizeMs,
            output: { width, height, format },
        };
    } catch (error) {
        return {
            ...base,
            ok: false,
            error:
                error instanceof Error
                    ? (error.stack ?? error.message)
                    : String(error),
        };
    }
}

/** Runs the check, writes the result as JSON, and returns the exit code. */
export async function writeSharpSelfTest(outPath: string): Promise<number> {
    const result = await runSharpSelfTest();
    await writeFile(outPath, JSON.stringify(result, null, 2) + "\n");
    return result.ok ? 0 : 1;
}
