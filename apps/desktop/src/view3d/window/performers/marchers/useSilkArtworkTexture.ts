/**
 * The show's silk Artwork as the silks' texture (fork #973): reads the row
 * the venue settings name, decodes the PNG, and hands it to every silk
 * material (`setSilkArtwork`), with the trim's place in the image for the
 * show's silk shape. Returns whether Artwork is on the silks, so the looks
 * mark their silks for it only once it can be drawn.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";
import { silkArtworkQueryOptions } from "@/hooks/queries/useSilkArtwork";
import {
    SILK_ARTWORK_MAX_PX,
    silkArtworkTrimRect,
} from "@/view3d/core/silkArtwork";
import { silkShapeSurface } from "@/view3d/core/artworkTemplates/surfaces";
import { silkShape, type SilkShapeId } from "@/view3d/core/sizes/silkShapes";
import { requestDraw } from "../../drawWake";
import { setSilkArtwork } from "./silkSet";

type ArtworkRow = { data: Uint8Array; width: number; height: number };

/**
 * The stored PNG as a texture, decoded once per row; null until it is. The
 * texture is kept with the row it came from, so a new row never shows (or
 * reuses) the last row's texture, which its cleanup has disposed.
 */
function useArtworkTexture(row: ArtworkRow | undefined): THREE.Texture | null {
    const [decoded, setDecoded] = useState<{
        row: ArtworkRow;
        texture: THREE.Texture;
    } | null>(null);
    useEffect(() => {
        if (!row) return;
        let cancelled = false;
        let texture: THREE.Texture | null = null;
        const scale = Math.min(
            1,
            SILK_ARTWORK_MAX_PX / Math.max(row.width, row.height),
        );
        void createImageBitmap(
            new Blob([row.data as Uint8Array<ArrayBuffer>], {
                type: "image/png",
            }),
            {
                // three doesn't flip an ImageBitmap: flip it here, so its top
                // row is at v = 1 as the silk shader expects
                imageOrientation: "flipY",
                premultiplyAlpha: "none",
                // the editor stores at most SILK_ARTWORK_MAX_PX; a row from
                // before that rule is drawn smaller here
                ...(scale < 1
                    ? {
                          resizeWidth: Math.max(
                              1,
                              Math.round(row.width * scale),
                          ),
                          resizeHeight: Math.max(
                              1,
                              Math.round(row.height * scale),
                          ),
                          resizeQuality: "high" as const,
                      }
                    : {}),
            },
        )
            .then((bitmap) => {
                if (cancelled) {
                    bitmap.close();
                    return;
                }
                texture = new THREE.Texture(bitmap);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 4;
                texture.needsUpdate = true;
                setDecoded({ row, texture });
            })
            .catch((error: unknown) => {
                console.warn("3D View: couldn't read the silk Artwork", error);
            });
        return () => {
            cancelled = true;
            if (texture) {
                (texture.image as ImageBitmap | undefined)?.close?.();
                texture.dispose();
            }
        };
    }, [row]);
    return row && decoded?.row === row ? decoded.texture : null;
}

export function useSilkArtworkTexture(
    id: number | undefined,
    shape: SilkShapeId,
): boolean {
    const { data: row } = useQuery(silkArtworkQueryOptions(id));
    const texture = useArtworkTexture(row ?? undefined);
    const shown = Boolean(row && texture);
    // a new shape only moves the trim in the same texture
    useEffect(() => {
        if (!row || !texture) {
            setSilkArtwork(null);
            return;
        }
        setSilkArtwork(
            texture,
            silkArtworkTrimRect(
                row.width,
                row.height,
                silkShapeSurface(silkShape(shape)),
            ),
        );
        requestDraw(600);
        return () => setSilkArtwork(null);
    }, [row, texture, shape]);
    return shown;
}
