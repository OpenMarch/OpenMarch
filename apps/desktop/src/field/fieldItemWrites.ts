import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allItemsQueryOptions,
    itemGeometryKeys,
    itemGeometryQueryOptions,
    setItemGeometryMutationOptions,
} from "@/hooks/queries/useItems";
import { moveMarchersInTargetMutationOptions } from "@/hooks/queries/useMarcherPages";
import { setItemGeometryInTransaction } from "@/db-functions/items";
import { dropMarchersOnTimeline } from "@/field/fieldDrop";
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
 * data the Props panel writes, on the beat at or before the playhead. A resize
 * that moved the item's center (its opposite side stayed put) drops the item
 * there through the timeline's rules, as a drag does, with the Outline in the
 * same edit; a refused drop saves neither. Returns the editor's `saveItem`
 * port; it reads the latest items, Outline rows and beats when it runs.
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
    const { mutateAsync: moveMarchers } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );
    const latest = useRef({ itemRows, rows, beats, mutateAsync, moveMarchers });
    useEffect(() => {
        latest.current = { itemRows, rows, beats, mutateAsync, moveMarchers };
    });

    return useCallback(
        async (marcherId, size) => {
            const { itemRows, rows, beats, mutateAsync, moveMarchers } =
                latest.current;
            const item = itemRows?.find((i) => i.marcher_id === marcherId);
            const beat = outlineWriteBeatNow(beats);
            const shown = items.outlineOf(marcherId)?.geometry;
            if (!item || !beat || !shown || !rows) return "refused";
            const outline = fieldOutlineWrite({
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
            });
            try {
                if (!size.center) {
                    await mutateAsync(outline);
                    return "saved";
                }
                let written = false;
                const dropped = await dropMarchersOnTimeline(
                    [{ id: marcherId, ...size.center }],
                    (request) =>
                        moveMarchers({
                            ...request,
                            afterWrite: async (tx) => {
                                await setItemGeometryInTransaction({
                                    tx,
                                    ...outline,
                                });
                                written = true;
                            },
                        }),
                    (id) => items.isLocked(id),
                );
                if (dropped !== "saved") return dropped;
                // An edit with no move to keep app data in (a locked item's home) saved the
                // position alone: the Outline follows as a step of its own
                if (!written) await mutateAsync(outline);
                else
                    await queryClient.invalidateQueries({
                        queryKey: itemGeometryKeys.all(),
                    });
                return "saved";
            } catch {
                // The mutation has shown why
                return "refused";
            }
        },
        [items, queryClient],
    );
}
