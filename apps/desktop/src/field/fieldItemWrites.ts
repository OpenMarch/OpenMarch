import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
    setItemGeometryMutationOptions,
} from "@/hooks/queries/useItems";
import { useTimingObjects } from "@/hooks";
import {
    fieldOutlineWrite,
    outlineWriteBeatNow,
} from "@/items/itemOutlineTimeline";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import type { DropResult } from "@/field/editor/fieldEditor";
import type { ItemSize } from "@/field/editor/itemTransform";
import type { FieldItems } from "@/field/three/fieldItems";

/**
 * Saves an item's Outline resized or turned on the field (C2.1): the same
 * data the Props panel writes, on the beat at or before the playhead, with no
 * move. Returns the editor's `saveItem` port; it reads the latest items,
 * Outline rows and beats when it runs.
 */
export function useFieldItemWrites(
    items: FieldItems,
): (marcherId: number, size: ItemSize) => Promise<DropResult> {
    const queryClient = useQueryClient();
    const { data: itemRows } = useQuery(allItemsQueryOptions());
    const { data: rows } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects()!;
    const { mutateAsync } = useMutation(
        setItemGeometryMutationOptions(queryClient),
    );
    const latest = useRef({ itemRows, rows, beats, mutateAsync });
    useEffect(() => {
        latest.current = { itemRows, rows, beats, mutateAsync };
    });

    return useCallback(
        async (marcherId, size) => {
            const { itemRows, rows, beats, mutateAsync } = latest.current;
            const item = itemRows?.find((i) => i.marcher_id === marcherId);
            const beat = outlineWriteBeatNow(beats);
            const shown = items.outlineOf(marcherId)?.geometry;
            if (!item || !beat || !shown || !rows) return "refused";
            try {
                await mutateAsync(
                    fieldOutlineWrite({
                        itemId: item.id,
                        beatId: beat.id,
                        drawn: {
                            width: size.width / PIXELS_PER_METER,
                            depth: size.depth / PIXELS_PER_METER,
                            rotation: size.rotation,
                        },
                        shown,
                        rows,
                        // An imported model resizes evenly: its height follows (#1078)
                        heightScalesFrom: items.heightScalesFrom(marcherId),
                    }),
                );
                return "saved";
            } catch {
                // The mutation has shown why
                return "refused";
            }
        },
        [items],
    );
}
