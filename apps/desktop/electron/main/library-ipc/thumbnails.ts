/**
 * Library thumbnails (C1.9 §9, owner decisions Q49 and Q50), cached in
 * `<library>/cache/thumbs/<versionHash>-<px>.png`: outside manifests and the
 * Version hash, never synced, safe to delete.
 *
 * - Artwork: the `display` part resized by `sharp`.
 * - Models: nothing in a model Version is an image. The review captures a
 *   PNG from its canvas at commit; main re-encodes it (so it never stores
 *   what the renderer sent verbatim) as the 256 px entry. Without one, the
 *   editor shows the kind icon.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sharp, SharpOptions } from "sharp";
import type { LibraryStore } from "../library/store";
import type { LibraryItem } from "../library/types";
import { ARTWORK_PARTS } from "../artwork-import/sidecar";

export const THUMBNAIL_SIZES = [128, 256] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];
/** The size a captured model thumbnail is stored at. */
const CAPTURE_PX = 256;

type SharpFactory = (input?: Uint8Array, options?: SharpOptions) => Sharp;
let sharpModule: Promise<SharpFactory> | null = null;
function loadSharp(): Promise<SharpFactory> {
    sharpModule ??= import("sharp").then(
        (m) => m.default as unknown as SharpFactory,
    );
    return sharpModule;
}

/** Any image sharp reads, as a PNG at most `maxPx` on the long edge, never enlarged. */
export async function encodeThumbnail(
    bytes: Uint8Array,
    maxPx: number,
): Promise<Uint8Array> {
    const sharp = await loadSharp();
    const out = await sharp(bytes, { limitInputPixels: 64 * 1024 * 1024 })
        .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    return new Uint8Array(out);
}

export class ThumbnailCache {
    readonly dir: string;

    constructor(libraryRoot: string) {
        this.dir = path.join(libraryRoot, "cache", "thumbs");
    }

    private file(versionHash: string, px: number) {
        return path.join(this.dir, `${versionHash}-${px}.png`);
    }

    private async read(versionHash: string, px: number) {
        try {
            return new Uint8Array(await readFile(this.file(versionHash, px)));
        } catch {
            return null;
        }
    }

    private async write(versionHash: string, px: number, png: Uint8Array) {
        await mkdir(this.dir, { recursive: true });
        const target = this.file(versionHash, px);
        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, png);
        await rename(tmp, target);
    }

    /** Stores a model's captured thumbnail, re-encoded, replacing any older sizes. */
    async putCapture(versionHash: string, bytes: Uint8Array): Promise<void> {
        const png = await encodeThumbnail(bytes, CAPTURE_PX);
        for (const px of THUMBNAIL_SIZES) {
            await rm(this.file(versionHash, px), { force: true });
        }
        await this.write(versionHash, CAPTURE_PX, png);
    }

    /** The thumbnail of one Version, made and cached on first use; null when there's none. */
    async get(
        store: LibraryStore,
        item: LibraryItem,
        versionHash: string,
        px: ThumbnailSize,
    ): Promise<Uint8Array | null> {
        const cached = await this.read(versionHash, px);
        if (cached) return cached;
        const version = item.versions.find((v) => v.hash === versionHash);
        if (!version) return null;
        let source: Uint8Array | null = null;
        if (item.kind === "artwork") {
            const blob = version.parts[ARTWORK_PARTS.display];
            if (blob) source = await store.readBlob(blob);
        } else if (item.kind === "model" && px !== CAPTURE_PX) {
            source = await this.read(versionHash, CAPTURE_PX);
        }
        if (!source) return null;
        const png = await encodeThumbnail(source, px);
        await this.write(versionHash, px, png);
        return png;
    }
}
