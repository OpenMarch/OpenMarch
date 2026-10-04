import { useEffect, useRef, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getFieldPropertiesImage } from "@/global/classes/FieldProperties";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { DEFAULT_STALE_TIME } from "@/hooks/queries/constants";

/**
 * The show's field background image bytes, as the 2D canvas reads them
 * (`OpenMarchCanvas.refreshBackgroundImage`). The key sits under the field
 * properties' detail key, so the editor's field-properties invalidation (which
 * follows every image import) refreshes it too.
 */
export const fieldImageQueryOptions = () =>
    queryOptions<Uint8Array | null>({
        queryKey: [...fieldPropertiesKeys.detail(), "image"],
        queryFn: async () => (await getFieldPropertiesImage()) ?? null,
        staleTime: DEFAULT_STALE_TIME,
    });

function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (a === b) return true;
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}

export interface FieldImageState {
    /** The decoded image, or null when the show has none (or it won't decode). */
    image: ImageBitmap | null;
    /** False until the bytes are read and, if there are any, decoded. */
    loaded: boolean;
}

/**
 * The show's field image, decoded once per distinct image. Reloads that
 * return the same bytes keep the same `ImageBitmap`, so the field surface
 * doesn't rebuild for them.
 */
export function useFieldImage(): FieldImageState {
    const { data, isSuccess, isError } = useQuery(fieldImageQueryOptions());
    const [state, setState] = useState<FieldImageState>({
        image: null,
        loaded: false,
    });
    const lastBytes = useRef<Uint8Array | null | undefined>(undefined);

    useEffect(() => {
        if (isError) {
            setState({ image: null, loaded: true });
            return;
        }
        if (!isSuccess) return;
        const bytes = data ?? null;
        if (
            lastBytes.current !== undefined &&
            sameBytes(lastBytes.current, bytes)
        )
            return;
        lastBytes.current = bytes;
        if (!bytes || bytes.byteLength === 0) {
            setState({ image: null, loaded: true });
            return;
        }
        let cancelled = false;
        let settled = false;
        createImageBitmap(new Blob([bytes as BlobPart]))
            .then((image) => {
                settled = true;
                if (!cancelled) setState({ image, loaded: true });
            })
            .catch((error: unknown) => {
                settled = true;
                console.error("3D View couldn't decode the field image", error);
                if (!cancelled) setState({ image: null, loaded: true });
            });
        return () => {
            cancelled = true;
            // A decode cancelled before it finished must run again.
            if (!settled) lastBytes.current = undefined;
        };
    }, [data, isSuccess, isError]);

    return state;
}
