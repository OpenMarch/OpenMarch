/**
 * The Library's items for the browser, kept fresh by `library:changed`, with
 * thumbnails as `blob:` URLs (Q49). Each Version's thumbnail is fetched once
 * and its URL revoked when the Version leaves the list or the browser
 * unmounts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToObjectUrl } from "@/view3d/library/importClient";
import {
    LIBRARY_LIMITS,
    type LibraryIpcError,
} from "@/view3d/library/protocol";
import {
    loadLibraryItems,
    type LibraryBrowserApi,
    type LibraryBrowserItem,
} from "./libraryItems";

export type LibraryItemsState =
    | { status: "loading" }
    | { status: "ready"; items: LibraryBrowserItem[] }
    | { status: "error"; error: LibraryIpcError };

/** Pixel size asked of `library:thumbnails`; tiles are ~120 px wide. */
const THUMBNAIL_PX = 256;

export function useLibraryItems(
    api: LibraryBrowserApi,
    /** Changing it reloads, e.g. after a commit. */
    refreshKey: unknown = null,
) {
    const [state, setState] = useState<LibraryItemsState>({
        status: "loading",
    });
    /** Version hash → `blob:` URL. */
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const urls = useRef(new Map<string, string>());
    /** Hashes asked for, so a null answer isn't asked again. */
    const asked = useRef(new Set<string>());
    const loadSeq = useRef(0);
    const disposed = useRef(false);

    const fetchThumbnails = useCallback(
        async (items: LibraryBrowserItem[]) => {
            await syncThumbnails(
                api,
                items,
                urls.current,
                asked.current,
                () => disposed.current,
            );
            if (!disposed.current) {
                setThumbnails(Object.fromEntries(urls.current));
            }
        },
        [api],
    );

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        const result = await loadLibraryItems(api);
        if (disposed.current || seq !== loadSeq.current) return;
        if (!result.ok) {
            setState({ status: "error", error: result.error });
            return;
        }
        setState({ status: "ready", items: result.value });
        await fetchThumbnails(result.value);
    }, [api, fetchThumbnails]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    useEffect(() => api.onChanged(() => void load()), [api, load]);

    useEffect(() => {
        disposed.current = false;
        const owned = urls.current;
        const askedSet = asked.current;
        return () => {
            disposed.current = true;
            for (const url of owned.values()) URL.revokeObjectURL(url);
            owned.clear();
            askedSet.clear();
        };
    }, []);

    return { state, thumbnails, reload: load };
}

/**
 * Revokes URLs of Versions no longer listed and fetches thumbnails for
 * Versions not asked for yet, into `urls`.
 */
async function syncThumbnails(
    api: LibraryBrowserApi,
    items: LibraryBrowserItem[],
    urls: Map<string, string>,
    asked: Set<string>,
    isDisposed: () => boolean,
) {
    const live = new Set(items.map((i) => i.versionHash));
    for (const [hash, url] of urls) {
        if (!live.has(hash)) {
            URL.revokeObjectURL(url);
            urls.delete(hash);
            asked.delete(hash);
        }
    }
    const missing = items.filter((i) => !asked.has(i.versionHash));
    for (const item of missing) asked.add(item.versionHash);
    const size = LIBRARY_LIMITS.thumbnailsPerCall;
    for (let start = 0; start < missing.length; start += size) {
        const batch = missing.slice(start, start + size);
        let result;
        try {
            result = await api.thumbnails({
                items: batch.map((i) => ({
                    itemId: i.id,
                    versionHash: i.versionHash,
                })),
                maxPx: THUMBNAIL_PX,
            });
        } catch {
            continue; // the kind icon stands in
        }
        if (!result.ok) continue;
        result.value.forEach((payload, index) => {
            if (!payload) return;
            const url = bytesToObjectUrl(payload);
            if (isDisposed()) URL.revokeObjectURL(url);
            else urls.set(batch[index].versionHash, url);
        });
    }
}
