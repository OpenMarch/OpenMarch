import { useEffect, useRef, useState } from "react";

export interface PropImageCacheEntry {
    el: HTMLImageElement;
    url: string;
}

type PropImageCache = Map<number, PropImageCacheEntry>;

/**
 * Loads prop images into an in-memory cache of HTMLImageElements, keyed by
 * prop id. The cache is held in a ref (stable across renders); `imageCacheVersion`
 * bumps whenever the cache is replaced so consumers re-run and pick up the newly
 * loaded elements. Object URLs are revoked when superseded.
 */
export function usePropImageCache(
    propImages: { prop_id: number; image: Uint8Array }[] | undefined,
): {
    propImageCacheRef: React.MutableRefObject<PropImageCache>;
    imageCacheVersion: number;
} {
    const propImageCacheRef = useRef<PropImageCache>(new Map());
    const [imageCacheVersion, setImageCacheVersion] = useState(0);

    useEffect(() => {
        if (!propImages) return;
        let cancelled = false;

        const revokeAll = (cache: PropImageCache) => {
            for (const { url } of cache.values()) URL.revokeObjectURL(url);
        };

        if (propImages.length === 0) {
            if (propImageCacheRef.current.size > 0) {
                revokeAll(propImageCacheRef.current);
                propImageCacheRef.current = new Map();
                setImageCacheVersion((v) => v + 1);
            }
            return;
        }

        const loadImg = (data: Uint8Array): Promise<PropImageCacheEntry> =>
            new Promise((resolve, reject) => {
                const blob = new Blob([(data as any).buffer ?? data]);
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => resolve({ el: img, url });
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Image load failed"));
                };
                img.src = url;
            });

        void (async () => {
            const newCache: PropImageCache = new Map();
            await Promise.all(
                propImages.map(async ({ prop_id, image }) => {
                    try {
                        const entry = await loadImg(image);
                        if (!cancelled) newCache.set(prop_id, entry);
                        else URL.revokeObjectURL(entry.url);
                    } catch {
                        /* skip broken images */
                    }
                }),
            );
            if (!cancelled) {
                revokeAll(propImageCacheRef.current);
                propImageCacheRef.current = newCache;
                setImageCacheVersion((v) => v + 1);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [propImages]);

    return { propImageCacheRef, imageCacheVersion };
}
